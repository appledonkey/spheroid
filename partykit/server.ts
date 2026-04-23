import type * as Party from 'partykit/server';

// --- Shared types (kept in sync with src/types.ts MultiplayerPlayer/Room) ----
// We don't import from src/ because the PartyKit worker bundle is separate.
// If these drift we'll spot it in integration testing — they're small enough
// to duplicate and the type shape is load-bearing for the protocol.

type ServerPlayer = {
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  finalScore: number | null;
  finished: boolean;
};

type Phase = 'lobby' | 'playing' | 'waiting' | 'results';

type Difficulty = 'easy' | 'normal' | 'expert';

// Settings live on the room so every client agrees on what's being played.
// Host mutates via updateSettings; server validates and broadcasts.
type RoomSettings = {
  numTasks: number;     // 4..8
  roundTime: number;    // 30..180 (step 15)
  totalRounds: number;  // 1..5 — keep small for MP so sessions stay short
  difficulty: Difficulty;
};

type RoomState = {
  code: string;
  phase: Phase;
  players: ServerPlayer[];
  settings: RoomSettings;
  // Server timestamp when the host hit Start. Clients anchor their countdown
  // to this so everyone's "GO!" fires within network jitter of each other.
  startedAt: number | null;
};

type ClientMessage =
  | { type: 'join'; name: string }
  | { type: 'toggleReady' }
  | { type: 'updateSettings'; settings: Partial<RoomSettings> }
  | { type: 'start' }
  | { type: 'finish'; finalScore: number }
  | { type: 'playAgain' };

type ServerMessage =
  | { type: 'state'; state: RoomState }
  | { type: 'error'; message: string };

const MAX_PLAYERS = 8;
const NAME_MAX = 16;

// Ranges mirrored between server and client. Server re-validates on every
// updateSettings so a tampered client can't smuggle out-of-range values.
const RANGES = {
  numTasks:    { min: 4,  max: 8,   step: 1 },
  roundTime:   { min: 30, max: 180, step: 15 },
  totalRounds: { min: 1,  max: 5,   step: 1 },
} as const;

const DEFAULT_SETTINGS: RoomSettings = {
  numTasks: 6,
  roundTime: 120,
  totalRounds: 1,
  difficulty: 'normal',
};

function clampStep(value: number, range: { min: number; max: number; step: number }): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return range.min;
  const clamped = Math.min(range.max, Math.max(range.min, value));
  const rounded = Math.round((clamped - range.min) / range.step) * range.step + range.min;
  return Math.min(range.max, Math.max(range.min, rounded));
}

function sanitizeSettings(patch: Partial<RoomSettings>, base: RoomSettings): RoomSettings {
  return {
    numTasks:    patch.numTasks    !== undefined ? clampStep(patch.numTasks,    RANGES.numTasks)    : base.numTasks,
    roundTime:   patch.roundTime   !== undefined ? clampStep(patch.roundTime,   RANGES.roundTime)   : base.roundTime,
    totalRounds: patch.totalRounds !== undefined ? clampStep(patch.totalRounds, RANGES.totalRounds) : base.totalRounds,
    difficulty:  (patch.difficulty === 'easy' || patch.difficulty === 'normal' || patch.difficulty === 'expert')
      ? patch.difficulty
      : base.difficulty,
  };
}

export default class SpheroidsServer implements Party.Server {
  state: RoomState;

  constructor(readonly party: Party.Party) {
    this.state = {
      code: party.id.toUpperCase(),
      phase: 'lobby',
      players: [],
      settings: { ...DEFAULT_SETTINGS },
      startedAt: null,
    };
  }

  private broadcastState() {
    const msg: ServerMessage = { type: 'state', state: this.state };
    this.party.broadcast(JSON.stringify(msg));
  }

  private sendError(conn: Party.Connection, message: string) {
    const msg: ServerMessage = { type: 'error', message };
    conn.send(JSON.stringify(msg));
  }

  onConnect(conn: Party.Connection) {
    // Send a snapshot so the joiner sees the room immediately; they'll add
    // themselves to the roster once they send `join` with their name.
    const msg: ServerMessage = { type: 'state', state: this.state };
    conn.send(JSON.stringify(msg));
  }

  onMessage(raw: string, conn: Party.Connection) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'join': {
        if (this.state.phase !== 'lobby') {
          this.sendError(conn, 'Game has already started.');
          return;
        }
        if (this.state.players.length >= MAX_PLAYERS) {
          this.sendError(conn, 'Room is full.');
          return;
        }
        if (this.state.players.some(p => p.id === conn.id)) return; // already joined
        const isHost = this.state.players.length === 0;
        const rawName = (msg.name ?? '').trim();
        const name = (rawName.length > 0 ? rawName : 'Player').slice(0, NAME_MAX);
        this.state.players.push({
          id: conn.id,
          name,
          isHost,
          ready: false,
          finalScore: null,
          finished: false,
        });
        this.broadcastState();
        return;
      }

      case 'toggleReady': {
        const p = this.state.players.find(p => p.id === conn.id);
        if (!p) return;
        if (this.state.phase !== 'lobby') return;
        p.ready = !p.ready;
        this.broadcastState();
        return;
      }

      case 'updateSettings': {
        const p = this.state.players.find(p => p.id === conn.id);
        if (!p || !p.isHost) return;
        if (this.state.phase !== 'lobby') return;
        if (!msg.settings || typeof msg.settings !== 'object') return;
        this.state.settings = sanitizeSettings(msg.settings, this.state.settings);
        // Any settings change un-readies everyone so nobody accidentally
        // starts a game they haven't confirmed the shape of.
        this.state.players.forEach(q => { q.ready = false; });
        this.broadcastState();
        return;
      }

      case 'start': {
        const p = this.state.players.find(p => p.id === conn.id);
        if (!p || !p.isHost) return;
        if (this.state.phase !== 'lobby') return;
        if (!this.state.players.every(pp => pp.ready)) return;
        this.state.phase = 'playing';
        this.state.startedAt = Date.now();
        this.broadcastState();
        return;
      }

      case 'finish': {
        const p = this.state.players.find(p => p.id === conn.id);
        if (!p) return;
        if (this.state.phase !== 'playing' && this.state.phase !== 'waiting') return;
        if (typeof msg.finalScore !== 'number' || !Number.isFinite(msg.finalScore)) return;
        p.finalScore = msg.finalScore;
        p.finished = true;
        const allDone = this.state.players.length > 0 && this.state.players.every(q => q.finished);
        this.state.phase = allDone ? 'results' : 'waiting';
        this.broadcastState();
        return;
      }

      case 'playAgain': {
        const p = this.state.players.find(p => p.id === conn.id);
        if (!p || !p.isHost) return;
        this.state.phase = 'lobby';
        this.state.startedAt = null;
        this.state.players.forEach(q => {
          q.ready = false;
          q.finalScore = null;
          q.finished = false;
        });
        this.broadcastState();
        return;
      }
    }
  }

  onClose(conn: Party.Connection) {
    const idx = this.state.players.findIndex(p => p.id === conn.id);
    if (idx < 0) return;
    const wasHost = this.state.players[idx].isHost;
    this.state.players.splice(idx, 1);
    // Promote first remaining player to host if the host left.
    if (wasHost && this.state.players.length > 0) {
      this.state.players[0].isHost = true;
    }
    // If mid-game this leaves ≥1 players and one of them hasn't finished,
    // the remaining players' finish events will still flip the room to
    // results when they all complete. If the disconnected player was the
    // last non-finished one, re-evaluate now so the game can progress.
    if (this.state.phase === 'waiting' && this.state.players.length > 0) {
      const allDone = this.state.players.every(q => q.finished);
      if (allDone) this.state.phase = 'results';
    }
    this.broadcastState();
  }
}
