import { COLORS } from '../constants/colors';
import type { Color, Difficulty, Settings, Task } from '../types';

export const MAX_TASKS = 8;  // Hard cap on card count (classic + escalation)

// Inventory starts at INVENTORY_PER_COLOR of each color — matters for
// detecting numeric contradictions between EXACT and SUM cards.
export const INVENTORY_PER_COLOR = 3;

// Classic is the baked-in standard variant — non-customizable. These values
// are applied at game start via `startRound` override and do not overwrite
// the user's stored settings, so Escalation customizations persist.
export const CLASSIC_PRESET = {
  numTasks: 6,
  roundTime: 120,
  totalRounds: 3,
} as const;

// Pseudo-random roll in [0, 1) seeded by (round, gameSeed). Deterministic
// within a single game (so round N always produces the same count on replay
// of the *same* game), but varies across games when gameSeed changes.
const seededRoll = (round: number, gameSeed: number): number => {
  const x = Math.sin(round * 12.9898 + gameSeed * 78.233 + 17.17) * 43758.5453;
  return x - Math.floor(x);
};

// Small linear-congruential PRNG. Fully deterministic given the seed; used
// when we need the *same hand* to be generated from the same seed (daily
// challenge, and so that round state can be recreated if we ever need it).
export function makeRng(seed: number): () => number {
  let state = (seed | 0) || 1;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

// Combine gameSeed with round index so each round gets a distinct-but-
// deterministic seed for its hand generation.
export function roundSeed(gameSeed: number, round: number): number {
  return ((gameSeed * 31) ^ (round * 2654435761)) >>> 0;
}

export const cardsForRound = (
  settings: Settings,
  round: number,
  gameSeed: number = 0,
): number => {
  if (settings.mode === 'classic') return settings.numTasks;

  const start = settings.escalationStart;
  if (settings.escalationGrowth === 'every') {
    return Math.min(MAX_TASKS, start + (round - 1));
  }
  if (settings.escalationGrowth === 'every-other') {
    return Math.min(MAX_TASKS, start + Math.floor((round - 1) / 2));
  }
  // 'random' — ~60% chance to add a card each round after R1
  let count = start;
  for (let r = 2; r <= round; r++) {
    if (seededRoll(r, gameSeed) > 0.4) count++;
  }
  return Math.min(MAX_TASKS, count);
};

// Which colors a task references — for the per-color mention cap used in
// generator sampling. Same-color TOUCH/NO_TOUCH counts the color twice.
function taskColors(task: Task): Color[] {
  switch (task.type) {
    case 'EXACT':
    case 'NOT_ON_TOP':
    case 'NOT_UNDER':
      return [task.c];
    default:
      return [task.c1, task.c2];
  }
}

// True if adding `task` to `picked` would produce an unsatisfiable hand.
// Catches the contradictions that our pool can generate:
//   • EXACT(c, n) + SUM(c, c', k)       where k − n is outside [0, INVENTORY_PER_COLOR]
//   • EXACT(a) + EXACT(b) + SUM(a, b)   where the two EXACTs don't sum to the SUM target
//   • Duplicate-EXACT / duplicate-SUM / duplicate-MORE/LESS for a color / pair
//
// Pool-level safeguards (one-per-pair, one-per-color) already prevent most
// direct duplicates; this check covers the numeric cases that slip through.
function wouldContradict(task: Task, picked: Task[]): boolean {
  if (task.type === 'EXACT') {
    // No two EXACTs may target the same color.
    for (const p of picked) {
      if (p.type === 'EXACT' && p.c === task.c) return true;
    }
    // Must also be consistent with any already-picked SUM card.
    for (const p of picked) {
      if (p.type !== 'SUM') continue;
      if (p.c1 !== task.c && p.c2 !== task.c) continue;
      const otherColor = p.c1 === task.c ? p.c2 : p.c1;
      const otherExact = picked.find(
        (q): q is Extract<Task, { type: 'EXACT' }> => q.type === 'EXACT' && q.c === otherColor,
      );
      if (otherExact) {
        // Both summands fixed — their sum must match the SUM's target.
        if (otherExact.n + task.n !== p.n) return true;
      } else {
        // The other color is flexible — but its required count must be
        // achievable given the starting inventory.
        const need = p.n - task.n;
        if (need < 0 || need > INVENTORY_PER_COLOR) return true;
      }
    }
  }

  if (task.type === 'SUM') {
    // Reject if either color has an EXACT that makes the SUM unreachable.
    for (const c of [task.c1, task.c2] as const) {
      const e = picked.find(
        (p): p is Extract<Task, { type: 'EXACT' }> => p.type === 'EXACT' && p.c === c,
      );
      if (!e) continue;
      const otherColor = c === task.c1 ? task.c2 : task.c1;
      const otherE = picked.find(
        (p): p is Extract<Task, { type: 'EXACT' }> => p.type === 'EXACT' && p.c === otherColor,
      );
      if (otherE) {
        if (e.n + otherE.n !== task.n) return true;
      } else {
        const need = task.n - e.n;
        if (need < 0 || need > INVENTORY_PER_COLOR) return true;
      }
    }
    // No two SUM cards for the same (unordered) pair.
    for (const p of picked) {
      if (p.type !== 'SUM') continue;
      const samePair =
        (p.c1 === task.c1 && p.c2 === task.c2) ||
        (p.c1 === task.c2 && p.c2 === task.c1);
      if (samePair) return true;
    }
  }

  if (task.type === 'MORE_THAN' || task.type === 'LESS_THAN') {
    // No two comparison cards for the same unordered pair (MORE(a,b) and
    // LESS(a,b) are the same constraint; MORE(a,b) + MORE(b,a) contradicts).
    for (const p of picked) {
      if (p.type !== 'MORE_THAN' && p.type !== 'LESS_THAN') continue;
      const samePair =
        (p.c1 === task.c1 && p.c2 === task.c2) ||
        (p.c1 === task.c2 && p.c2 === task.c1);
      if (samePair) return true;
    }
  }

  if (task.type === 'TOUCH' || task.type === 'NO_TOUCH') {
    for (const p of picked) {
      if (p.type !== 'TOUCH' && p.type !== 'NO_TOUCH') continue;
      const samePair =
        (p.c1 === task.c1 && p.c2 === task.c2) ||
        (p.c1 === task.c2 && p.c2 === task.c1);
      if (samePair) return true;
    }
  }

  if (task.type === 'NOT_ON_TOP' || task.type === 'NOT_UNDER') {
    for (const p of picked) {
      if ((p.type === 'NOT_ON_TOP' || p.type === 'NOT_UNDER') && p.c === task.c) return true;
    }
  }

  return false;
}

// Generates `count` unique task cards with no direct contradictions and no
// color overload. Pool includes:
//   • EXACT (per color)
//   • TOUCH / NO_TOUCH for each distinct pair (random which)
//   • Same-color TOUCH / NO_TOUCH (per color, random which)
//   • NOT_ON_TOP / NOT_UNDER (per color)
//   • MORE_THAN or LESS_THAN (per unordered pair, random which)
//   • SUM = n (per unordered pair, random n in 2..5)
// Sampling applies a per-color mention cap AND a contradiction check so a
// hand is always satisfiable and no single color dominates.
// Task types considered "harder" for the difficulty filter — they involve
// counting, math, or position reasoning beyond simple adjacency/placement.
const HARDER_TYPES = new Set<Task['type']>(['SUM', 'MORE_THAN', 'LESS_THAN', 'NOT_UNDER']);

export const generateTasks = (
  count = 6,
  difficulty: Difficulty = 'normal',
  seed?: number,
): Task[] => {
  // Optional seed makes the output deterministic — used by daily challenge
  // and anything else that needs reproducible hands.
  const rand = seed !== undefined ? makeRng(seed) : Math.random;
  const pool: Task[] = [];

  for (const c of COLORS) {
    pool.push({ type: 'EXACT', c, n: 1 + Math.floor(rand() * 2) });
  }

  for (let i = 0; i < COLORS.length; i++) {
    for (let j = i + 1; j < COLORS.length; j++) {
      const type: 'TOUCH' | 'NO_TOUCH' = rand() < 0.5 ? 'TOUCH' : 'NO_TOUCH';
      pool.push({ type, c1: COLORS[i], c2: COLORS[j] });
    }
  }

  for (const c of COLORS) {
    const type: 'TOUCH' | 'NO_TOUCH' = rand() < 0.5 ? 'TOUCH' : 'NO_TOUCH';
    pool.push({ type, c1: c, c2: c });
  }

  for (const c of COLORS) {
    const type: 'NOT_ON_TOP' | 'NOT_UNDER' = rand() < 0.5 ? 'NOT_ON_TOP' : 'NOT_UNDER';
    pool.push({ type, c });
  }

  for (let i = 0; i < COLORS.length; i++) {
    for (let j = i + 1; j < COLORS.length; j++) {
      const ascending = rand() < 0.5;
      const [c1, c2] = ascending ? [COLORS[i], COLORS[j]] : [COLORS[j], COLORS[i]];
      const type: 'MORE_THAN' | 'LESS_THAN' = rand() < 0.5 ? 'MORE_THAN' : 'LESS_THAN';
      pool.push({ type, c1, c2 });
    }
  }

  for (let i = 0; i < COLORS.length; i++) {
    for (let j = i + 1; j < COLORS.length; j++) {
      const n = 2 + Math.floor(rand() * 4);
      pool.push({ type: 'SUM', c1: COLORS[i], c2: COLORS[j], n });
    }
  }

  // Difficulty tuning:
  //   easy   — remove the counting/math types entirely
  //   expert — keep, and duplicate them so they're ~2x as likely to be picked
  //   normal — pool unchanged
  if (difficulty === 'easy') {
    for (let i = pool.length - 1; i >= 0; i--) {
      if (HARDER_TYPES.has(pool[i].type)) pool.splice(i, 1);
    }
  } else if (difficulty === 'expert') {
    const extras: Task[] = [];
    for (const t of pool) {
      if (HARDER_TYPES.has(t.type)) extras.push(t);
    }
    pool.push(...extras);
  }

  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const cap = Math.max(3, Math.ceil((count * 2) / COLORS.length));
  const mentions: Record<Color, number> = { coral: 0, amber: 0, pine: 0, iris: 0, pearl: 0 };
  const picked: Task[] = [];

  for (const task of pool) {
    if (picked.length >= count) break;
    const cs = taskColors(task);
    if (cs.some(c => mentions[c] >= cap)) continue;
    if (wouldContradict(task, picked)) continue;
    picked.push(task);
    cs.forEach(c => { mentions[c]++; });
  }

  // Fallback — if the contradiction + cap filters left us short, fill with
  // anything that at least doesn't contradict. (Mention cap is relaxed here.)
  if (picked.length < count) {
    for (const task of pool) {
      if (picked.length >= Math.min(count, pool.length)) break;
      if (picked.includes(task)) continue;
      if (wouldContradict(task, picked)) continue;
      picked.push(task);
    }
  }

  return picked;
};
