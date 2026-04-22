const KEY = 'spheroids.daily';

// Per-round data we persist so the share grid can be rebuilt when the player
// revisits a completed day. Mirrors the relevant subset of RoundResult.
export type DailyRoundEntry = {
  total: number;
  bonusTokenEarned: boolean;
  allTasksPassed: boolean;
  taskCount: number;
  passedCount: number;
  spheres: number;
};

export type DailyEntry = {
  score: number;
  rounds: DailyRoundEntry[];
};

type DailyMap = Record<string, DailyEntry>;

function loadAll(): DailyMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: DailyMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      // Back-compat: old format stored just a number. Keep it playable — we
      // lose the rounds grid for those days but the score stays visible.
      if (typeof v === 'number') {
        out[k] = { score: v, rounds: [] };
      } else if (v && typeof v === 'object' && 'score' in v && typeof (v as DailyEntry).score === 'number') {
        const e = v as DailyEntry;
        out[k] = {
          score: e.score,
          rounds: Array.isArray(e.rounds) ? e.rounds : [],
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Seed derived from the date string — same across every player for a given day.
// djb2-style hash, collapsed to a positive 32-bit int.
export function dateToSeed(dateStr: string): number {
  let hash = 5381;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) + hash + dateStr.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getDailyScore(dateStr: string): number | null {
  const all = loadAll();
  return dateStr in all ? all[dateStr].score : null;
}

export function getDailyEntry(dateStr: string): DailyEntry | null {
  const all = loadAll();
  return dateStr in all ? all[dateStr] : null;
}

export function recordDaily(dateStr: string, score: number, rounds: DailyRoundEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  const all = loadAll();
  all[dateStr] = { score, rounds };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}
