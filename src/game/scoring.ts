import type { Board, EvaluatedTask, RoundResult, Task } from '../types';
import { evaluateTask, isTaskEngaged } from './rules';

export const SPHERE_POINTS = 1;
export const FAILED_TASK_PENALTY = 2;
export const DISTINCT_COLOR_GOAL = 5;

// Bonus-token conversion table from the board-game rulebook. The rulebook
// assumes a 6-round game — index = tokens earned, value = final adjustment.
// Non-linear: 0 tokens = big penalty, 3 tokens = break even, 6 tokens = big
// reward. For games with a different round count we map by *ratio* of perfect
// rounds so the curve shape is preserved (break-even at 50% perfect).
export const BONUS_TOKEN_TABLE = [-6, -3, -1, 0, 1, 3, 6] as const;

export function convertBonusTokens(count: number, totalRounds: number): number {
  if (totalRounds <= 0) return 0;
  const safeCount = Math.max(0, Math.min(totalRounds, count));
  // Map "X of N rounds perfect" onto the 7-cell ratio-based curve.
  const idx = Math.round((safeCount / totalRounds) * (BONUS_TOKEN_TABLE.length - 1));
  return BONUS_TOKEN_TABLE[Math.max(0, Math.min(BONUS_TOKEN_TABLE.length - 1, idx))];
}

export function scoreRound(board: Board, tasks: Task[]): RoundResult {
  const placed = board.filter((s): s is NonNullable<typeof s> => s !== null);
  const spheres = placed.length;
  const allColorsUsed = new Set(placed).size === DISTINCT_COLOR_GOAL;

  // Rulebook: every uncompleted task costs −2, regardless of whether the
  // player touched its colors. No engagement carve-out.
  const evaluated: EvaluatedTask[] = tasks.map(task => ({
    ...task,
    passed: evaluateTask(task, board),
    engaged: isTaskEngaged(task, board),
  }));
  const failedCount = evaluated.filter(t => !t.passed).length;
  const allTasksPassed = failedCount === 0;

  // Per-rulebook: bonus token requires all tasks completed AND all 5 colors
  // on the tray. Tokens themselves are cashed in at end-of-game via the
  // conversion table — no per-round points for the token.
  const bonusTokenEarned = allTasksPassed && allColorsUsed;

  const total =
    spheres * SPHERE_POINTS
    - failedCount * FAILED_TASK_PENALTY;

  return {
    spheres,
    allTasksPassed,
    allColorsUsed,
    bonusTokenEarned,
    tasks: evaluated,
    total,
  };
}
