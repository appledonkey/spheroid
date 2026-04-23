// Named vibration patterns per game event. Separate module from sfx so the
// call sites stay readable ("haptics.place()" vs ad-hoc navigator.vibrate
// calls with magic numbers).
//
// Respects the same mute flag as audio — silence is silence in both senses.

import { isMuted } from './sfx';

function vib(pattern: number | number[]): void {
  if (isMuted()) return;
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw if called rapidly; swallow.
  }
}

export const haptics = {
  place: () => vib(10),
  remove: () => vib(6),
  // Double-pulse for invalid — distinct from place's single pulse so you can
  // tell by feel alone that the tap didn't land.
  invalid: () => vib([8, 30, 8]),
  countdownTick: () => vib(14),
  go: () => vib(55),
  warning: () => vib([40, 30, 40]),
  timesUp: () => vib([120, 60, 120]),
  tokenEarned: () => vib([20, 25, 20, 25, 40]),
  newBest: () => vib([30, 20, 30, 20, 30, 20, 120]),
  gameOver: () => vib(80),
};
