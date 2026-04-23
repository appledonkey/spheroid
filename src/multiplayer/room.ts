import { MAX_TASKS } from '../game/tasks';

// djb2-style string hash, collapsed to a positive 32-bit int. Same shape as
// storage/daily.ts's dateToSeed — the room code plays the same role for
// multiplayer that the date string does for Daily (seeds the hand).
export function codeToSeed(code: string): number {
  let hash = 5381;
  const normalized = code.toUpperCase();
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Derive the card count from the room seed so every client computes the same
// number without negotiating. Range matches Daily (4..8) — the same Classic
// shape players are already familiar with.
export function cardsForRoom(code: string): number {
  const seed = codeToSeed(code);
  return Math.min(MAX_TASKS, 4 + (seed % 5));
}

// 4-letter uppercase code. ~450k combinations — enough entropy that random
// guesses won't hit an active room. Skips I/O/0/1 to avoid visual ambiguity
// ("is that an O or a zero?") when sharing the code verbally.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(): string {
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

// Light validation for the join form. Phase 1 is permissive — Phase 2's
// server will do the authoritative check (does the code name an active room).
export function looksLikeValidCode(raw: string): boolean {
  const trimmed = raw.trim().toUpperCase();
  if (trimmed.length !== 4) return false;
  for (const c of trimmed) {
    if (!ALPHABET.includes(c)) return false;
  }
  return true;
}

// Small helper for generating unique-ish player IDs in Phase 1 without a
// server to hand them out. Collisions are fine for the mock flow.
export function makePlayerId(): string {
  return `p_${Math.random().toString(36).slice(2, 10)}`;
}
