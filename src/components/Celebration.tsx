import { useEffect, useMemo, useState } from 'react';
import { COLOR_GRADIENTS } from '../constants/colors';
import type { Color } from '../types';

export type CelebrationVariant = 'bonus-token' | 'mp-winner';

export type CelebrationProps = {
  // Changing to a new positive number starts a new celebration. We intentionally
  // key off an incrementing counter rather than a boolean so rapid consecutive
  // triggers (e.g. two bonus tokens in consecutive rounds) each fire cleanly.
  trigger: number;
  variant?: CelebrationVariant;
};

// Lifetime of the overlay. Matches the longest sub-animation (text burst =
// 2s) plus a small tail so the fade-out is fully visible before we unmount.
const OVERLAY_LIFETIME_MS = 2200;

// How many confetti particles we launch. 26 reads as "burst" without
// becoming visual noise; lighter variants can dial down.
const CONFETTI_COUNT = 26;

type Particle = {
  id: number;
  tx: number;      // final x offset (px)
  ty: number;      // final y offset (px)
  rot: number;     // final rotation (deg)
  delay: number;   // ms before this particle starts its flight
  colorCss: string;
};

function buildParticles(variant: CelebrationVariant): Particle[] {
  const colors: Color[] = ['coral', 'amber', 'pine', 'iris', 'pearl'];
  const out: Particle[] = [];
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    // Launch angle spread evenly around a circle with a small per-particle jitter
    // so the burst feels natural rather than mechanical.
    const angle = (i / CONFETTI_COUNT) * Math.PI * 2 + Math.random() * 0.6;
    const radius = 180 + Math.random() * 180;
    const tx = Math.cos(angle) * radius;
    const ty = Math.sin(angle) * radius + 60; // slight downward bias — gravity-ish
    const color = variant === 'mp-winner'
      ? (Math.random() < 0.35 ? '#fbbf24' : COLOR_GRADIENTS[colors[i % 5]].base)
      : COLOR_GRADIENTS[colors[i % 5]].base;
    out.push({
      id: i,
      tx,
      ty,
      rot: (Math.random() - 0.5) * 720,
      delay: Math.floor(Math.random() * 120),
      colorCss: color,
    });
  }
  return out;
}

export function Celebration({ trigger, variant = 'bonus-token' }: CelebrationProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (trigger <= 0) return;
    setActive(true);
    const t = setTimeout(() => setActive(false), OVERLAY_LIFETIME_MS);
    return () => clearTimeout(t);
  }, [trigger]);

  // Rebuild particles on every trigger so back-to-back celebrations don't
  // replay the same burst path. Memoised per trigger id to avoid re-roll on
  // the re-render that active=true causes.
  const particles = useMemo(() => buildParticles(variant), [trigger, variant]);

  if (!active) return null;

  const isMpWinner = variant === 'mp-winner';
  const headline = isMpWinner ? 'WINNER!' : 'BONUS TOKEN!';

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {/* Gold radial vignette — brighter in the center, fades to transparent. */}
      <div className="absolute inset-0 animate-celebrate-vignette"
        style={{
          background: 'radial-gradient(circle at center, rgba(251,191,36,0.5), rgba(251,191,36,0) 60%)',
        }} />

      {/* Confetti burst. Particles position-absolute at viewport center and
          transform out to (tx, ty) via CSS custom properties — lets us
          declare the trajectory inline without per-particle keyframes. */}
      <div className="absolute inset-0">
        {particles.map(p => (
          <div
            key={p.id}
            className="absolute w-3 h-3 lg:w-4 lg:h-4 rounded-full shadow-md animate-celebrate-confetti"
            style={{
              left: '50%',
              top: '50%',
              background: p.colorCss,
              ['--tx' as string]: `${p.tx}px`,
              ['--ty' as string]: `${p.ty}px`,
              ['--rot' as string]: `${p.rot}deg`,
              animationDelay: `${p.delay}ms`,
            } as React.CSSProperties} />
        ))}
      </div>

      {/* Headline text — big, outlined, pops in with a spring overshoot. */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="text-5xl lg:text-8xl font-black tracking-tight animate-celebrate-text"
          style={{
            color: '#fde68a',
            WebkitTextStroke: '3px #78350f',
            paintOrder: 'stroke',
            textShadow: '0 6px 24px rgba(120, 53, 15, 0.6)',
          }}>
          {headline}
        </div>
      </div>
    </div>
  );
}
