import { useEffect, useId, useRef, useState } from 'react';
import { COLORS, COLOR_GRADIENTS, sphereGradientStyle } from '../constants/colors';
import { describeTask } from '../game/rules';
import { sfx } from '../audio/sfx';
import type { Color, Task, TaskStatus } from '../types';

// ---------- Ball primitives ----------

// One canonical sphere size for every "main" ball across every card type.
// Pass size='duo' on layouts that show two spheres side-by-side (TOUCH,
// NO_TOUCH, MORE/LESS_THAN) — they share the card width with each other
// plus an op, so a smaller sphere keeps the composition balanced.
type SphereSize = 'solo' | 'duo';
const Sphere = ({ c, size = 'solo' }: { c: Color; size?: SphereSize }) => (
  <div className={`${size === 'duo' ? 'task-sphere-duo' : 'task-sphere'} rounded-full shadow-md shrink-0`}
       style={{ background: sphereGradientStyle(c) }} />
);

// Smaller A-colored ball used in the position-rule icons.
const SmallSphere = ({ c }: { c: Color }) => (
  <div
    className="task-sphere-sm rounded-full shadow-sm shrink-0"
    style={{ background: sphereGradientStyle(c) }} />
);

// SVG helpers for vector ball rendering (crisp slice/diagonal edges vs the
// rasterized conic/linear gradients CSS provides).
const polar = (cx: number, cy: number, r: number, deg: number) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const pieSlicePath = (cx: number, cy: number, r: number, startDeg: number, endDeg: number): string => {
  const s = polar(cx, cy, r, startDeg);
  const e = polar(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y} Z`;
};

// Shared <defs> — a gloss highlight (top-left) and a darker edge (bottom-
// right) — used by both OmniBall and SplitBall to recreate the ceramic feel.
function BallGradientDefs({ id }: { id: string }) {
  return (
    <defs>
      <radialGradient id={`${id}-gloss`} cx="38%" cy="32%" r="55%">
        <stop offset="0%" stopColor="white" stopOpacity="0.6" />
        <stop offset="35%" stopColor="white" stopOpacity="0.12" />
        <stop offset="100%" stopColor="white" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${id}-edge`} cx="62%" cy="68%" r="55%">
        <stop offset="55%" stopColor="black" stopOpacity="0" />
        <stop offset="100%" stopColor="black" stopOpacity="0.4" />
      </radialGradient>
    </defs>
  );
}

// "Omni" ball: 5-color pie standing in for "any color" on position cards.
// Rendered as SVG so the slice boundaries have native path anti-aliasing
// (CSS conic-gradient looks jagged at small sizes).
const OmniBall = () => {
  const id = useId();
  return (
    <svg
      viewBox="0 0 100 100"
      className="task-sphere-sm shrink-0"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}>
      <BallGradientDefs id={id} />
      {COLORS.map((c, i) => (
        <path
          key={c}
          d={pieSlicePath(50, 50, 49, i * 72, (i + 1) * 72)}
          fill={COLOR_GRADIENTS[c].base} />
      ))}
      <circle cx="50" cy="50" r="49" fill={`url(#${id}-edge)`} />
      <circle cx="50" cy="50" r="49" fill={`url(#${id}-gloss)`} />
    </svg>
  );
};

// Single-color ball with a target number embedded in its face. Used for
// EXACT tasks so the "= N" visual language matches SplitBall's inside-the-
// ball number style — same font, same stroke, same slot in the composition.
// Keeps the card-vocabulary uniform when both EXACT and SUM appear in a deal.
const NumberedBall = ({ c, n }: { c: Color; n: number }) => {
  const id = useId();
  const { base } = COLOR_GRADIENTS[c];
  return (
    <svg
      viewBox="0 0 100 100"
      className="task-sphere shrink-0"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}>
      <BallGradientDefs id={id} />
      <circle cx="50" cy="50" r="49" fill={base} />
      <circle cx="50" cy="50" r="49" fill={`url(#${id}-edge)`} />
      <circle cx="50" cy="50" r="49" fill={`url(#${id}-gloss)`} />
      <text
        x="50" y="52"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="44"
        fontWeight="800"
        fill="white"
        stroke="black"
        strokeWidth="3.5"
        style={{ paintOrder: 'stroke' }}>
        {n}
      </text>
    </svg>
  );
};

// Diagonally split ball with a target number on top. Used for SUM tasks.
// SVG version: two semicircle paths split on the 45° axis, clean edge vs
// the old linear-gradient diagonal which stair-stepped at small sizes.
const SplitBall = ({ c1, c2, n }: { c1: Color; c2: Color; n: number }) => {
  const id = useId();
  const a = COLOR_GRADIENTS[c1];
  const b = COLOR_GRADIENTS[c2];
  // Split line runs perpendicular to a 135° gradient direction — between
  // the NE point (45°) and the SW point (225°) on the circle.
  const p1 = polar(50, 50, 49, 45);
  const p2 = polar(50, 50, 49, 225);
  const halfA = `M ${p1.x} ${p1.y} A 49 49 0 0 0 ${p2.x} ${p2.y} Z`; // top-left half
  const halfB = `M ${p1.x} ${p1.y} A 49 49 0 0 1 ${p2.x} ${p2.y} Z`; // bottom-right half
  return (
    <svg
      viewBox="0 0 100 100"
      className="task-sphere shrink-0"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}>
      <BallGradientDefs id={id} />
      <path d={halfA} fill={a.base} />
      <path d={halfB} fill={b.base} />
      <circle cx="50" cy="50" r="49" fill={`url(#${id}-edge)`} />
      <circle cx="50" cy="50" r="49" fill={`url(#${id}-gloss)`} />
      <text
        x="50" y="52"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="44"
        fontWeight="800"
        fill="white"
        stroke="black"
        strokeWidth="3.5"
        style={{ paintOrder: 'stroke' }}>
        {n}
      </text>
    </svg>
  );
};

// Down-arrow with a red ✕ overlay — "this direction of stacking is forbidden".
const ForbiddenDownIcon = () => (
  <div className="task-icon-sm relative shrink-0">
    <svg viewBox="0 0 24 24" className="w-full h-full">
      <path d="M12 3v14M6 13l6 6 6-6" stroke="#334155" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="3" y1="3" x2="21" y2="21" stroke="#e11d48" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="21" y1="3" x2="3" y2="21" stroke="#e11d48" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  </div>
);

// Stacked position rule:
//   position='top'    → NOT_ON_TOP: A over Omni, crossed arrow — A can't go on top of anything
//   position='bottom' → NOT_UNDER:  Omni over A, crossed arrow — nothing may sit on A
const PositionStackIcon = ({ c, position }: { c: Color; position: 'top' | 'bottom' }) => (
  <div className="flex flex-col items-center gap-0.5 shrink-0">
    {position === 'top' ? <SmallSphere c={c} /> : <OmniBall />}
    <ForbiddenDownIcon />
    {position === 'top' ? <OmniBall /> : <SmallSphere c={c} />}
  </div>
);

// ---------- Card ----------

export type TaskCardProps = {
  task: Task;
  status: TaskStatus;
  // Position in the grid, used to stagger the deal-in animation on mount.
  // When undefined, no animation is applied.
  dealIndex?: number;
};

// How much each subsequent card waits before starting its own deal-in.
// Kept in sync with App.tsx's pre-round scheduling (DEAL_STAGGER_MS constant).
const DEAL_STAGGER_MS = 200;

// Per-card stagger for the round-end stamp. Smaller than the deal-in stagger
// because the recap moment is higher-urgency — users want their score fast.
const STAMP_STAGGER_MS = 110;

export function TaskCard({ task, status, dealIndex }: TaskCardProps) {
  // Tap the card to flip it over and see the rule in plain English. Tap
  // again to flip back. Each card manages its own flip state independently.
  const [flipped, setFlipped] = useState(false);

  // Transient animation class driven by status transitions. `null` is the
  // resting state; any non-null value applies the corresponding animation.
  // Cleared by onAnimationEnd below.
  type Fx = 'live-pass' | 'live-fail' | 'stamp-pass' | 'stamp-fail' | null;
  const [fx, setFx] = useState<Fx>(null);
  const prevStatusRef = useRef<TaskStatus>(status);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev === status) return;
    // Round-end verdict — stagger so cards stamp in sequence rather than
    // all at once. Caller drives the visual order via dealIndex. Each stamp
    // fires a short chime/thud so the recap has an audible rhythm.
    if (status === 'pass' || status === 'fail') {
      const delay = (dealIndex ?? 0) * STAMP_STAGGER_MS;
      const t = setTimeout(() => {
        setFx(status === 'pass' ? 'stamp-pass' : 'stamp-fail');
        if (status === 'pass') sfx.cardPass();
        else sfx.cardFail();
      }, delay);
      return () => clearTimeout(t);
    }
    // Live-status flip during play — flash without delay.
    if (status === 'live-pass' && prev !== 'live-pass') {
      setFx('live-pass');
    } else if (status === 'live-fail' && prev !== 'live-fail') {
      setFx('live-fail');
    }
  }, [status, dealIndex]);

  const renderIcon = () => {
    if (task.type === 'EXACT') {
      // Number lives inside the ball to match SplitBall (SUM). Single hero
      // element centered in the card — same visual slot as the NumberedBall
      // / SplitBall composition across cards that carry a count.
      return (
        <div className="flex items-center justify-center h-full">
          <NumberedBall c={task.c} n={task.n} />
        </div>
      );
    }

    if (task.type === 'TOUCH' || task.type === 'NO_TOUCH') {
      // TOUCH  \u2192 solid emerald line between the balls ("these are joined").
      // NO_TOUCH \u2192 dark line with a bold red X overlaid centered on it —
      // "no-smoking-sign" iconography: the connection is visibly struck out,
      // which reads instantly as a prohibition. The X is slightly wider than
      // the line so the crossing is obvious at any card size.
      const op = task.type === 'TOUCH'
        ? <div className="task-op-line bg-emerald-500 rounded-full shrink-0" />
        : (
          <div className="relative shrink-0 flex items-center justify-center">
            <div className="task-op-line bg-slate-800 rounded-full" />
            <svg className="task-op-x absolute" viewBox="0 0 24 24" aria-hidden>
              <line x1="4" y1="4" x2="20" y2="20" stroke="#ef4444" strokeWidth="5" strokeLinecap="round" />
              <line x1="20" y1="4" x2="4" y2="20" stroke="#ef4444" strokeWidth="5" strokeLinecap="round" />
            </svg>
          </div>
        );
      return (
        // Extra inner padding + a wider gap here — the two-ball layout was
        // pushing the spheres right to the card edges, which made the cards
        // feel cramped. px-3 pulls them inward, gap-2 gives the op visual
        // room to breathe, and duo-sized spheres stay proportionally
        // balanced with the op.
        <div className="flex items-center justify-center h-full gap-2 px-3">
          <Sphere c={task.c1} size="duo" />
          {op}
          <Sphere c={task.c2} size="duo" />
        </div>
      );
    }

    if (task.type === 'NOT_ON_TOP' || task.type === 'NOT_UNDER') {
      return (
        <div className="flex items-center justify-center h-full">
          <PositionStackIcon c={task.c} position={task.type === 'NOT_ON_TOP' ? 'top' : 'bottom'} />
        </div>
      );
    }

    if (task.type === 'MORE_THAN' || task.type === 'LESS_THAN') {
      return (
        // Matches TOUCH/NO_TOUCH inner padding so all two-ball layouts have
        // consistent edge breathing. Duo-sized spheres for the same reason.
        <div className="flex items-center justify-center h-full gap-2 px-3">
          <Sphere c={task.c1} size="duo" />
          <span className="font-bold task-num leading-none text-slate-800">
            {task.type === 'MORE_THAN' ? '>' : '<'}
          </span>
          <Sphere c={task.c2} size="duo" />
        </div>
      );
    }

    if (task.type === 'SUM') {
      return (
        <div className="flex items-center justify-center h-full">
          <SplitBall c1={task.c1} c2={task.c2} n={task.n} />
        </div>
      );
    }

    return null;
  };

  let cls = 'border-slate-300 bg-white';
  if (status === 'pass') cls = 'border-emerald-500 bg-emerald-50';
  if (status === 'fail') cls = 'border-rose-500 bg-rose-50';

  // Map fx state → animation class. One active class at a time; onAnimationEnd
  // clears it so the next transition can re-fire.
  const fxClass = fx === 'live-pass'   ? 'animate-task-live-pass'
                 : fx === 'live-fail'  ? 'animate-task-live-fail'
                 : fx === 'stamp-pass' ? 'animate-task-stamp-pass'
                 : fx === 'stamp-fail' ? 'animate-task-stamp-fail'
                 : '';

  return (
    <div
      // Outer wrapper owns the grid-cell size, the deal-in animation, and
      // the 3D perspective for the flip. Two inner faces flip together
      // around a shared Y-axis via transform: preserve-3d.
      className={`relative h-16 lg:h-full min-h-[64px] [perspective:1000px] ${dealIndex !== undefined ? 'task-card-deal' : ''}`}
      style={dealIndex !== undefined ? { animationDelay: `${dealIndex * DEAL_STAGGER_MS}ms` } : undefined}>
      <div
        onClick={() => setFlipped(f => !f)}
        role="button"
        tabIndex={0}
        aria-label={flipped ? 'Flip card back to icon' : 'Flip card to see rule description'}
        style={{ touchAction: 'manipulation' }}
        className={`relative w-full h-full cursor-pointer transition-transform duration-500 [transform-style:preserve-3d] ${flipped ? '[transform:rotateY(180deg)]' : ''}`}>

        {/* Front — icon */}
        <div
          onAnimationEnd={(e) => {
            // Only clear for our own fx animations, not deal-in or CSS
            // transitions bubbling up from children.
            if (e.animationName.startsWith('task-live-') || e.animationName.startsWith('task-stamp-')) {
              setFx(null);
            }
          }}
          className={`task-card absolute inset-0 px-1.5 py-1 rounded-lg border-2 shadow-sm flex flex-col items-center justify-center transition-colors [backface-visibility:hidden] ${cls} ${fxClass}`}>
          {renderIcon()}
          {status === 'fail' && <span className="text-rose-600 font-bold mt-0.5 text-xs">−2</span>}
          {status === 'live-pass' && (
            <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow flex items-center justify-center text-white text-[8px] font-bold leading-none">
              ✓
            </div>
          )}
          {status === 'live-fail' && (
            <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-amber-500 border-2 border-white shadow flex items-center justify-center text-white text-[10px] font-bold leading-none">
              !
            </div>
          )}
        </div>

        {/* Back — plain-English description */}
        <div
          className="task-card absolute inset-0 px-2 py-1.5 rounded-lg border-2 border-slate-300 bg-slate-50 shadow-sm flex items-center justify-center text-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <p className="text-slate-700 text-[10px] lg:text-xs leading-snug font-medium">
            {describeTask(task)}
          </p>
        </div>
      </div>
    </div>
  );
}
