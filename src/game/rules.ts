// Canonical rule definitions. Other code should import from here — do not
// reimplement placement / adjacency checks elsewhere.
import { ADJACENCIES, NUM_SLOTS, SLOT_LAYER, SUPPORTED_BY } from '../constants/geometry';
import { COLOR_DISPLAY_NAME } from '../constants/colors';
import type { Board, Color, Task } from '../types';

export function checkPlacementRules(id: number, b: Board): boolean {
  if (b[id] !== null) return false;
  if (id === 10) return b[7] !== null && b[8] !== null && b[9] !== null;
  if (id === 7)  return b[0] !== null && b[1] !== null && b[2] !== null;
  if (id === 8)  return b[0] !== null && b[3] !== null && b[4] !== null;
  if (id === 9)  return b[0] !== null && b[5] !== null && b[6] !== null;
  return true;
}

export function checkRemovalRules(id: number, b: Board): boolean {
  if (b[id] === null) return false;
  if (id === 10) return true;
  if (id === 7 || id === 8 || id === 9) return b[10] === null;
  if (id === 0) return b[7] === null && b[8] === null && b[9] === null;
  if (id === 1 || id === 2) return b[7] === null;
  if (id === 3 || id === 4) return b[8] === null;
  if (id === 5 || id === 6) return b[9] === null;
  return true;
}

export function showEmptySlot(id: number, b: Board): boolean {
  if (b[id] !== null) return false;
  if (SLOT_LAYER[id] === 0) return true;
  return checkPlacementRules(id, b);
}

// TOUCH and NO_TOUCH allow c1 === c2 — the same logic evaluates correctly
// for "A must touch A" / "A may not touch A" since the loop scans every A
// slot and checks its neighbours for A.
//
// Strict TOUCH (different colours): every A must be adjacent to at least one
// B, AND every B must be adjacent to at least one A — intentionally demanding.
export function evaluateTask(task: Task, board: Board): boolean {
  const placed = board.filter(s => s !== null);

  if (task.type === 'EXACT') {
    return placed.filter(c => c === task.c).length === task.n;
  }

  if (task.type === 'TOUCH') {
    const c1 = placed.filter(c => c === task.c1).length;
    const c2 = placed.filter(c => c === task.c2).length;
    if (c1 === 0 && c2 === 0) return true;
    if (c1 === 0 || c2 === 0) return false;
    for (let i = 0; i < NUM_SLOTS; i++) {
      if (board[i] === task.c1) {
        const adj = ADJACENCIES[i].map(j => board[j]);
        if (!adj.includes(task.c2)) return false;
      }
      if (board[i] === task.c2) {
        const adj = ADJACENCIES[i].map(j => board[j]);
        if (!adj.includes(task.c1)) return false;
      }
    }
    return true;
  }

  if (task.type === 'NO_TOUCH') {
    const c1 = placed.filter(c => c === task.c1).length;
    const c2 = placed.filter(c => c === task.c2).length;
    if (c1 === 0 || c2 === 0) return true;
    for (let i = 0; i < NUM_SLOTS; i++) {
      if (board[i] === task.c1) {
        const adj = ADJACENCIES[i].map(j => board[j]);
        if (adj.includes(task.c2)) return false;
      }
    }
    return true;
  }

  if (task.type === 'NOT_ON_TOP') {
    // Color c may not appear in any stacked slot (layers 1+).
    for (let i = 0; i < NUM_SLOTS; i++) {
      if (SLOT_LAYER[i] > 0 && board[i] === task.c) return false;
    }
    return true;
  }

  if (task.type === 'NOT_UNDER') {
    // Wherever c is placed, no slot resting on it may be occupied.
    for (let i = 0; i < NUM_SLOTS; i++) {
      if (board[i] !== task.c) continue;
      for (const above of SUPPORTED_BY[i]) {
        if (board[above] !== null) return false;
      }
    }
    return true;
  }

  if (task.type === 'MORE_THAN') {
    return placed.filter(c => c === task.c1).length
         > placed.filter(c => c === task.c2).length;
  }

  if (task.type === 'LESS_THAN') {
    return placed.filter(c => c === task.c1).length
         < placed.filter(c => c === task.c2).length;
  }

  if (task.type === 'SUM') {
    const sum = placed.filter(c => c === task.c1).length
              + placed.filter(c => c === task.c2).length;
    return sum === task.n;
  }

  return false;
}

// Colors that, when placed, "engage" a task — i.e. make its live indicator
// meaningful. Used for the neutral-vs-pass/fail distinction on cards and for
// scoring (only engaged-but-failed tasks incur a penalty).
function relevantColors(task: Task): Color[] {
  switch (task.type) {
    case 'EXACT':
    case 'NOT_ON_TOP':
    case 'NOT_UNDER':
      return [task.c];
    default:
      return [task.c1, task.c2];
  }
}

// True iff the player has placed at least one of the task's relevant colors.
// An un-engaged task scores 0 — it was never in play.
export function isTaskEngaged(task: Task, board: Board): boolean {
  const rel = relevantColors(task);
  return board.some(c => c !== null && rel.includes(c));
}

// Plain-English description of a task — used by the in-game info popover and
// (potentially) in How to Play examples. Color labels go through
// COLOR_DISPLAY_NAME so the text says "red" / "yellow" / etc. instead of the
// stylized internal names (coral / amber / ...).
export function describeTask(task: Task): string {
  const name = (c: Color): string => COLOR_DISPLAY_NAME[c];
  const Cap = (c: Color): string => {
    const n = name(c);
    return n[0].toUpperCase() + n.slice(1);
  };
  switch (task.type) {
    case 'EXACT':
      return `Place exactly ${task.n} ${name(task.c)} sphere${task.n === 1 ? '' : 's'}.`;
    case 'TOUCH':
      return task.c1 === task.c2
        ? `Every ${name(task.c1)} sphere must touch at least one other ${name(task.c1)}.`
        : `Every ${name(task.c1)} must touch a ${name(task.c2)}, and every ${name(task.c2)} must touch a ${name(task.c1)}.`;
    case 'NO_TOUCH':
      return task.c1 === task.c2
        ? `No two ${name(task.c1)} spheres may be adjacent.`
        : `No ${name(task.c1)} may touch any ${name(task.c2)}.`;
    case 'NOT_ON_TOP':
      return `${Cap(task.c)} must stay on the base — can't rest on top of another sphere.`;
    case 'NOT_UNDER':
      return `Nothing may rest on top of a ${name(task.c)} sphere.`;
    case 'MORE_THAN':
      return `You must place more ${name(task.c1)} than ${name(task.c2)}.`;
    case 'LESS_THAN':
      return `You must place fewer ${name(task.c1)} than ${name(task.c2)}.`;
    case 'SUM':
      return `Total number of ${name(task.c1)} + ${name(task.c2)} must equal exactly ${task.n}.`;
  }
}

// null = task hasn't been engaged yet (no relevant colors placed); show neutral.
export function liveTaskStatus(task: Task, board: Board): 'live-pass' | 'live-fail' | null {
  if (!isTaskEngaged(task, board)) return null;
  return evaluateTask(task, board) ? 'live-pass' : 'live-fail';
}
