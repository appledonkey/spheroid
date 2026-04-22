import type { GameMode } from '../types';

const KEY = 'spheroids.bestScores';

export type BestScores = { classic: number | null; escalation: number | null };

const EMPTY: BestScores = { classic: null, escalation: null };

export function loadBestScores(): BestScores {
  if (typeof localStorage === 'undefined') return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<BestScores>;
    return {
      classic:    typeof parsed.classic    === 'number' ? parsed.classic    : null,
      escalation: typeof parsed.escalation === 'number' ? parsed.escalation : null,
    };
  } catch {
    return EMPTY;
  }
}

// Returns { isNewBest, newBest }. `isNewBest` is true iff score beat (or set
// the first) record for this mode. Caller uses it to show a "New best!" badge.
export function recordBestScore(
  mode: GameMode,
  score: number,
): { isNewBest: boolean; newBest: number } {
  const current = loadBestScores();
  const previous = current[mode];
  if (previous === null || score > previous) {
    const next: BestScores = { ...current, [mode]: score };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // ignore quota / privacy errors
    }
    return { isNewBest: true, newBest: score };
  }
  return { isNewBest: false, newBest: previous };
}
