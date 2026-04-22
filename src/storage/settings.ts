import type { Difficulty, EscalationGrowth, GameMode, Settings } from '../types';

const KEY = 'spheroids.settings';

export const DEFAULT_SETTINGS: Settings = {
  mode: 'classic',
  numTasks: 6,
  roundTime: 60,
  totalRounds: 6,
  escalationStart: 4,
  escalationGrowth: 'every',
  escalationHints: true,
  escalationDifficulty: 'normal',
};

export const SETTINGS_RANGES = {
  numTasks:        { min: 4,  max: 8,   step: 1 },
  roundTime:       { min: 15, max: 180, step: 15 },
  totalRounds:     { min: 1,  max: 10,  step: 1 },
  escalationStart: { min: 4,  max: 8,   step: 1 },
} as const;

const clamp = (v: unknown, lo: number, hi: number, fb: number): number =>
  (typeof v === 'number' && v >= lo && v <= hi) ? v : fb;

const validMode = (v: unknown): GameMode =>
  (v === 'classic' || v === 'escalation') ? v : DEFAULT_SETTINGS.mode;

const validGrowth = (v: unknown): EscalationGrowth =>
  (v === 'every' || v === 'every-other' || v === 'random') ? v : DEFAULT_SETTINGS.escalationGrowth;

const validDifficulty = (v: unknown): Difficulty =>
  (v === 'easy' || v === 'normal' || v === 'expert') ? v : DEFAULT_SETTINGS.escalationDifficulty;

export function loadSettings(): Settings {
  if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const stored = JSON.parse(raw) as Partial<Settings>;
    return {
      mode:             validMode(stored.mode),
      numTasks:         clamp(stored.numTasks,        SETTINGS_RANGES.numTasks.min,        SETTINGS_RANGES.numTasks.max,        DEFAULT_SETTINGS.numTasks),
      roundTime:        clamp(stored.roundTime,       SETTINGS_RANGES.roundTime.min,       SETTINGS_RANGES.roundTime.max,       DEFAULT_SETTINGS.roundTime),
      totalRounds:      clamp(stored.totalRounds,     SETTINGS_RANGES.totalRounds.min,     SETTINGS_RANGES.totalRounds.max,     DEFAULT_SETTINGS.totalRounds),
      escalationStart:  clamp(stored.escalationStart, SETTINGS_RANGES.escalationStart.min, SETTINGS_RANGES.escalationStart.max, DEFAULT_SETTINGS.escalationStart),
      escalationGrowth: validGrowth(stored.escalationGrowth),
      escalationHints:  typeof stored.escalationHints === 'boolean' ? stored.escalationHints : DEFAULT_SETTINGS.escalationHints,
      escalationDifficulty: validDifficulty(stored.escalationDifficulty),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Quota or privacy-mode error — ignore
  }
}
