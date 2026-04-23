// Web Audio synthesis for game cues. No asset files — every sound is an
// oscillator (or small sequence of oscillators) with an amplitude envelope.
// Keeps the bundle small and iteration fast; tradeoff is the sounds are
// utilitarian rather than rich.
//
// AudioContext is created lazily on the first play call, which is a
// user-gesture-triggered path (placing a sphere, tapping a button). Mobile
// browsers suspend AudioContext until a user gesture, so we resume() on
// every play.

let ctx: AudioContext | null = null;
let masterMuted = false;
const MASTER_VOLUME = 0.35;

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => { /* ignore — will retry on next call */ });
  }
  return ctx;
}

type ToneOpts = {
  frequency: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
  attack?: number;
  frequencyEnd?: number; // for pitch slides
  startDelay?: number;   // seconds from now to start
};

function playTone(opts: ToneOpts): void {
  if (masterMuted) return;
  const c = ensureCtx();
  if (!c) return;
  const {
    frequency,
    duration,
    type = 'sine',
    volume = 0.2,
    attack = 0.005,
    frequencyEnd,
    startDelay = 0,
  } = opts;
  const start = c.currentTime + startDelay;
  const end = start + duration;

  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  if (frequencyEnd) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, frequencyEnd), end);
  }

  const gain = c.createGain();
  const vol = volume * MASTER_VOLUME;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(vol, start + attack);
  // Exponential decay to near-zero over the remainder of `duration`.
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(start);
  osc.stop(end + 0.02);
}

function playChord(
  frequencies: number[],
  duration: number,
  opts: Omit<ToneOpts, 'frequency' | 'duration'> = {},
): void {
  for (const f of frequencies) {
    playTone({ ...opts, frequency: f, duration });
  }
}

// ---------- Sound vocabulary ----------

// Sphere placed — quick soft click. Layer shifts the pitch so the pyramid
// feels like it's climbing: base = low woody thud, mid = middle click, apex
// = bright bell. Multiplies the base frequency by ~1.25 per layer.
function place(layer: 0 | 1 | 2 = 0): void {
  const base = 520;
  const multiplier = 1 + layer * 0.35;
  playTone({
    frequency: base * multiplier,
    duration: 0.09,
    type: 'triangle',
    volume: 0.25,
    frequencyEnd: (base - 200) * multiplier,
  });
}

// Invalid placement — short low dull thud to signal "nope, can't go there"
// without being annoying. Paired with a red slot flash in Board3D.
function invalid(): void {
  playTone({ frequency: 140, duration: 0.12, type: 'sawtooth', volume: 0.18, frequencyEnd: 100 });
}

// Task-card verdict stamps at the round recap. Pass = crisp high blip,
// fail = short buzz. Fire staggered per card for a "chk-chk-chk" rhythm.
function cardPass(): void {
  playTone({ frequency: 880, duration: 0.08, type: 'triangle', volume: 0.14 });
}
function cardFail(): void {
  playTone({ frequency: 200, duration: 0.09, type: 'sawtooth', volume: 0.14, frequencyEnd: 140 });
}

// Sphere removed — slightly lower, faster decay.
function remove(): void {
  playTone({ frequency: 360, duration: 0.08, type: 'triangle', volume: 0.18, frequencyEnd: 260 });
}

// Countdown tick (5 → 1) — short, slightly rising pitch as it gets closer.
function countdownTick(numberShown: number): void {
  // numberShown: 5, 4, 3, 2, 1 → rising pitch for urgency
  const freq = 480 + (5 - numberShown) * 60;
  playTone({ frequency: freq, duration: 0.07, type: 'square', volume: 0.18 });
}

// GO! — triad stab to kick off the round.
function go(): void {
  playChord([523.25, 659.25, 783.99], 0.28, {
    type: 'triangle',
    volume: 0.22,
    attack: 0.01,
  });
}

// Last-5-seconds beep — fires once per second, each one rising.
function warning(secondsLeft: number): void {
  const freq = 700 + (5 - secondsLeft) * 90;
  playTone({ frequency: freq, duration: 0.12, type: 'square', volume: 0.22 });
}

// Round timer expired — descending buzzer.
function timesUp(): void {
  playTone({ frequency: 700, duration: 0.55, type: 'sawtooth', volume: 0.28, frequencyEnd: 180 });
}

// Bonus token earned — ascending major arpeggio, light and celebratory.
function tokenEarned(): void {
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((f, i) => {
    playTone({
      frequency: f,
      duration: 0.22,
      type: 'triangle',
      volume: 0.18,
      startDelay: i * 0.08,
    });
  });
}

// Game over — held major chord, reflective.
function gameOver(): void {
  playChord([261.63, 329.63, 392.0, 523.25], 1.1, {
    type: 'sine',
    volume: 0.14,
    attack: 0.05,
  });
}

// New best — full ascending run, brighter than normal game over.
function newBest(): void {
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51]; // C5 E5 G5 C6 E6
  notes.forEach((f, i) => {
    playTone({
      frequency: f,
      duration: 0.28,
      type: 'triangle',
      volume: 0.24,
      startDelay: i * 0.09,
    });
  });
  // A chord pad underneath for body.
  playChord([261.63, 329.63, 392.0], 1.3, {
    type: 'sine',
    volume: 0.12,
    attack: 0.1,
    startDelay: 0,
  });
}

export const sfx = {
  place,
  remove,
  invalid,
  cardPass,
  cardFail,
  countdownTick,
  go,
  warning,
  timesUp,
  tokenEarned,
  gameOver,
  newBest,
};

export function setMuted(m: boolean): void {
  masterMuted = m;
}
export function isMuted(): boolean {
  return masterMuted;
}
