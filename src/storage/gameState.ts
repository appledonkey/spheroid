import type {
  Board, Color, GameState, Inventory, RoundResult, Settings, Task,
} from '../types';

const KEY = 'spheroids.gameState';
// Bumped when the snapshot shape changes — older snapshots are ignored.
const SNAPSHOT_VERSION = 2;

export type GameSnapshot = {
  version: number;
  gameState: GameState;
  round: number;
  totalScore: number;
  bonusTokens: number;
  gameSeed: number;
  isDaily: boolean;
  tasks: Task[];
  board: Board;
  inventory: Inventory;
  selectedColor: Color | null;
  timer: number;
  countdown: number;
  activeSettings: Settings;
  roundResult: RoundResult | null;
};

export function saveGameSnapshot(snapshot: Omit<GameSnapshot, 'version'>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: SNAPSHOT_VERSION, ...snapshot }));
  } catch {
    // quota / privacy-mode — swallow
  }
}

export function loadGameSnapshot(): GameSnapshot | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameSnapshot;
    if (parsed.version !== SNAPSHOT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearGameSnapshot(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
