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

type RoomState = {
  code: string;
  numTasks: number;
  phase: Phase;
  players: ServerPlayer[];
  // Server timestamp when the host hit Start. Clients anchor their countdown
  // to this so everyone's "GO!" fires within network jitter of each other.
  startedAt: number | null;
};

type ClientMessage =
  | { type: 'join'; name: string }
  | { type: 'toggleReady' }
  | { type: 'start' }
  | { type: 'finish'; finalScore: number }
  | { type: 'playAgain' };

type ServerMessage =
  | { type: 'state'; state: RoomState }
  | { type: 'error'; message: string };

// --- Room-seed derivation (duplicated from src/multiplayer/room.ts) ---------
// Duplicated to keep the worker bundle self-contained; stays in sync by shape.

function codeToSeed(code: string): number {
  let hash = 5381;
  const normalized = code.toUpperCase();
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function cardsForRoom(code: string): number {
  const seed = codeToSeed(code);
  return Math.min(8, 4 + (seed % 5));
}

const MAX_PLAYERS = 8;
const NAME_MAX = 16;

export default class SpheroidsServer implements Party.Server {
  state: RoomState;

  constructor(readonly party: Party.Party) {
    this.state = {
      code: party.id.toUpperCase(),
      numTasks: cardsForRoom(party.id),
      phase: 'lobby',
      players: [],
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
