export type Color = 'coral' | 'amber' | 'pine' | 'iris' | 'pearl';

export type Board = (Color | null)[];

export type ExactTask = { type: 'EXACT'; c: Color; n: number };
// TOUCH/NO_TOUCH allow c1 === c2 for same-color constraints
// ("orange must touch orange", "orange may not touch orange").
export type TouchTask = { type: 'TOUCH'; c1: Color; c2: Color };
export type NoTouchTask = { type: 'NO_TOUCH'; c1: Color; c2: Color };
// Color c may never sit in a stacked position (layers 1+). Effectively:
// c is restricted to the 7-slot base ring.
export type NotOnTopTask = { type: 'NOT_ON_TOP'; c: Color };
// No sphere may sit directly above a sphere of color c.
// If c is at slot X, every slot that has X as a support must be empty.
export type NotUnderTask = { type: 'NOT_UNDER'; c: Color };
// count(c1) > count(c2)
export type MoreThanTask = { type: 'MORE_THAN'; c1: Color; c2: Color };
// count(c1) < count(c2)
export type LessThanTask = { type: 'LESS_THAN'; c1: Color; c2: Color };
// count(c1) + count(c2) === n
export type SumTask = { type: 'SUM'; c1: Color; c2: Color; n: number };

export type Task =
  | ExactTask
  | TouchTask
  | NoTouchTask
  | NotOnTopTask
  | NotUnderTask
  | MoreThanTask
  | LessThanTask
  | SumTask;

export type GameMode = 'classic' | 'escalation';

export type EscalationGrowth = 'every' | 'every-other' | 'random';

export type Difficulty = 'easy' | 'normal' | 'expert';

export type Settings = {
  mode: GameMode;
  numTasks: number;
  roundTime: number;
  totalRounds: number;
  escalationStart: number;
  escalationGrowth: EscalationGrowth;
  // Escalation only. When false, the per-card live ✓ / ! indicators are
  // hidden during play — users only see pass/fail on the round summary.
  escalationHints: boolean;
  // Escalation only. Controls the hand-generator's pool:
  //   easy   — drops the math-ier card types (SUM, MORE/LESS)
  //   normal — full pool (default)
  //   expert — double-weights the harder types so they show up more often
  escalationDifficulty: Difficulty;
};

export type GameState =
  | 'menu'
  | 'dealing'    // cards animating in, no timer, no interaction
  | 'countdown'  // 3 → 2 → 1 → GO! overlay before play starts
  | 'playing'
  | 'round_over'
  | 'game_over';

export type EvaluatedTask = Task & {
  passed: boolean;
  // True if the player placed any of the task's relevant colors. Un-engaged
  // tasks are not penalised regardless of whether they "passed" vacuously.
  engaged: boolean;
};

export type RoundResult = {
  spheres: number;
  timeBonus: number;
  timeRemaining: number;
  // Per-rulebook: every task must pass to earn the time bonus. No engagement
  // carve-out — failing a task you never touched still counts as failing.
  allTasksPassed: boolean;
  // Used all 5 colors on the tray this round. Combined with allTasksPassed,
  // earns a bonus token that's cashed in at end-of-game via BONUS_TOKEN_TABLE.
  allColorsUsed: boolean;
  bonusTokenEarned: boolean;
  tasks: EvaluatedTask[];
  total: number;
};

export type Inventory = Record<Color, number>;

export type TaskStatus = 'pass' | 'fail' | 'live-pass' | 'live-fail' | null;

// --- Multiplayer (Phase 1: mocked local state) --------------------------
// In Phase 2 these same shapes will be driven by the PartyKit server. Keeping
// them UI-oriented now means the swap is mostly replacing the state source,
// not rewriting every component that consumes them.

export type MultiplayerPhase =
  | 'lobby'      // players joining, ready-upping
  | 'countdown'  // synced 3-2-1-GO before the round starts
  | 'playing'    // your game in progress; roster shows finished state
  | 'waiting'    // you've finished (or timed out); others still playing
  | 'results';   // all done, ranked reveal

export type MultiplayerPlayer = {
  id: string;
  name: string;
  // Host of the room (the player who created it). If they leave mid-lobby,
  // we'd promote — Phase 1 is single-host-only.
  isHost: boolean;
  // Set true when the player taps Ready in the lobby. Host needs all ready
  // before the Start button enables.
  ready: boolean;
  // Populated after the game finishes. Null while still playing.
  finalScore: number | null;
  // Populated once the player completes their round. Used to show "finished"
  // state on the lobby roster during play, and drives the results reveal.
  finished: boolean;
};

export type MultiplayerSettings = {
  numTasks: number;
  roundTime: number;
  totalRounds: number;
  difficulty: Difficulty;
};

export type MultiplayerRoom = {
  code: string;
  phase: MultiplayerPhase;
  players: MultiplayerPlayer[];
  // Host-configurable, server-broadcast. Server validates + clamps.
  settings: MultiplayerSettings;
  // Local player's id, so the UI knows which roster row is "you".
  selfId: string;
};
