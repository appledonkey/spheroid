import { useEffect, useState } from 'react';
import {
  FAILED_TASK_PENALTY,
  TIME_BONUS_SECONDS_PER_POINT,
  convertBonusTokens,
} from '../game/scoring';
import type { RoundResult as RoundResultType } from '../types';

export type RoundResultProps = {
  roundResult: RoundResultType;
  totalRounds: number;
  totalScore: number;
  bonusTokens: number;
  // Compact per-round log — one entry per completed round. Shown on the
  // game-over screen as a breakdown grid + feeds the share emoji grid.
  roundHistory: Array<{
    total: number;
    bonusTokenEarned: boolean;
    allTasksPassed: boolean;
    taskCount: number;
    passedCount: number;
    spheres: number;
  }>;
  // True if this run is a Daily Challenge — drives the Share button.
  isDaily: boolean;
  // Called when user taps Share on the game-over panel. App owns the
  // actual share/clipboard call so toast + error handling live there.
  onShare: () => void;
  // True if the just-ended game set a new best for its mode.
  isNewBest: boolean;
  // Stored best for the current mode after the just-ended game (= final
  // score if isNewBest, otherwise the previous record).
  modeBest: number | null;
  isGameOver: boolean;
  onNext: () => void;
  onRestart: () => void;
  onBackToMenu: () => void;
};

const LINE_STAGGER_MS = 180;

export function RoundResult({
  roundResult, totalRounds, totalScore, bonusTokens, roundHistory,
  isNewBest, modeBest, isGameOver, isDaily, onShare,
  onNext, onRestart, onBackToMenu,
}: RoundResultProps) {
  // SMW-style time bonus: ticks up from 0 to the final value over ~0.6–2s.
  // The round total animates in lockstep so the running sum stays consistent.
  const [timeBonusShown, setTimeBonusShown] = useState(0);

  useEffect(() => {
    const target = roundResult.timeBonus;
    if (target <= 0) { setTimeBonusShown(0); return; }
    setTimeBonusShown(0);
    const duration = Math.min(2000, Math.max(600, target * 60));
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setTimeBonusShown(Math.floor(p * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [roundResult.timeBonus]);

  const totalShown = roundResult.total - roundResult.timeBonus + timeBonusShown;
  const secondsLeft = Math.floor(roundResult.timeRemaining);

  // Score-line list — each gets a stagger delay.
  type Line = { icon: JSX.Element; label: string; value: number; tone: 'plus' | 'minus' | 'time' };
  const lines: Line[] = [];

  lines.push({
    icon: <SphereIcon />,
    label: `Spheres placed (${roundResult.spheres})`,
    value: roundResult.spheres,
    tone: 'plus',
  });

  if (roundResult.timeBonus > 0) {
    lines.push({
      icon: <ClockIcon />,
      label: `Time bonus (${secondsLeft}s × 1/${TIME_BONUS_SECONDS_PER_POINT})`,
      value: timeBonusShown,
      tone: 'time',
    });
  }

  const failedTasks = roundResult.tasks
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !t.passed);

  for (const { i } of failedTasks) {
    lines.push({
      icon: <FailIcon />,
      label: `Failed task ${i + 1}`,
      value: -FAILED_TASK_PENALTY,
      tone: 'minus',
    });
  }

  const totalDelay = lines.length * LINE_STAGGER_MS + 120;

  return (
    <div className="bg-white p-3 lg:p-4 rounded-2xl shadow-md border border-slate-200">
      {roundResult.bonusTokenEarned && (
        <div
          className="animate-score-line-in flex items-center justify-center gap-1.5 mb-3 px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-bold uppercase tracking-wider shadow-sm"
          style={{ animationDelay: '0ms' }}>
          <BonusTokenIcon small />
          Bonus token earned!
        </div>
      )}

      {/* On round_over we show the full per-line score breakdown. On game_over
          the round-by-round grid already has the same info, so we skip the
          breakdown to keep the panel short enough to fit without scrolling. */}
      {!isGameOver && (
        <>
          <ul className="space-y-1.5 mb-3">
            {lines.map((line, idx) => (
              <ScoreLine
                key={`${idx}-${line.label}`}
                icon={line.icon}
                label={line.label}
                value={line.value}
                tone={line.tone}
                delayMs={idx * LINE_STAGGER_MS} />
            ))}
          </ul>

          <div
            className="animate-score-total-pop flex items-baseline justify-between px-4 py-3 rounded-xl bg-slate-900 text-white mb-3"
            style={{ animationDelay: `${totalDelay}ms` }}>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Round total</span>
            <span className={`text-3xl font-bold tabular-nums ${totalShown < 0 ? 'text-rose-400' : 'text-emerald-300'}`}>
              {totalShown > 0 ? '+' : ''}{totalShown}
            </span>
          </div>

          {/* Running bonus-token tally — visible from round 1 onwards so players
              can see progress toward the end-game conversion. */}
          <div className="flex items-center justify-between text-xs text-slate-500 mb-3 px-1">
            <span>Bonus tokens</span>
            <span className="flex items-center gap-1 font-semibold text-slate-700 tabular-nums">
              {bonusTokens} / {totalRounds}
            </span>
          </div>
        </>
      )}

      {!isGameOver ? (
        <div className="space-y-2">
          <button onClick={onNext}
            style={{ touchAction: 'manipulation' }}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl transition-colors active:scale-[0.98]">
            Next Round
          </button>
          <button onClick={onBackToMenu}
            style={{ touchAction: 'manipulation' }}
            className="w-full bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2 px-4 rounded-xl border border-slate-300 transition-colors active:scale-[0.98]">
            Back to Menu
          </button>
        </div>
      ) : (
        <GameOverPanel
          totalScore={totalScore}
          bonusTokens={bonusTokens}
          totalRounds={totalRounds}
          roundHistory={roundHistory}
          isNewBest={isNewBest}
          modeBest={modeBest}
          isDaily={isDaily}
          onShare={onShare}
          onRestart={onRestart}
          onBackToMenu={onBackToMenu} />
      )}
    </div>
  );
}

// ---------- Game-over panel ----------

function GameOverPanel({
  totalScore, bonusTokens, totalRounds, roundHistory, isNewBest, modeBest,
  isDaily, onShare, onRestart, onBackToMenu,
}: {
  totalScore: number;
  bonusTokens: number;
  totalRounds: number;
  roundHistory: Array<{
    total: number;
    bonusTokenEarned: boolean;
    allTasksPassed: boolean;
    taskCount: number;
    passedCount: number;
    spheres: number;
  }>;
  isNewBest: boolean;
  modeBest: number | null;
  isDaily: boolean;
  onShare: () => void;
  onRestart: () => void;
  onBackToMenu: () => void;
}) {
  const bonusValue = convertBonusTokens(bonusTokens, totalRounds);
  const finalScore = totalScore + bonusValue;
  const bonusToneSign = bonusValue > 0 ? '+' : bonusValue < 0 ? '−' : '';
  const bonusToneColor =
    bonusValue > 0 ? 'text-emerald-600'
    : bonusValue < 0 ? 'text-rose-600'
    : 'text-slate-700';

  return (
    <div className="space-y-2">
      {roundHistory.length > 0 && (
        <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Round-by-round
          </div>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${Math.min(roundHistory.length, 6)}, minmax(0, 1fr))` }}>
            {roundHistory.map((r, i) => (
              <div
                key={i}
                className={`relative rounded-md py-1 px-1 text-center ${
                  r.bonusTokenEarned
                    ? 'bg-amber-100 border border-amber-300'
                    : r.total < 0
                    ? 'bg-rose-50 border border-rose-200'
                    : 'bg-white border border-slate-200'
                }`}>
                <div className="text-[9px] uppercase tracking-wider text-slate-500">R{i + 1}</div>
                <div className={`text-sm font-bold tabular-nums ${r.total < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                  {r.total > 0 ? '+' : ''}{r.total}
                </div>
                {r.bonusTokenEarned && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 ring-2 ring-white shadow-sm" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* One-line summary replaces the expanded base/tokens/curve panel. Keeps
          all the info (base + token bonus + final = total) but in 1/3 the height. */}
      <div className="flex items-center justify-between text-xs px-2 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
        <span className="text-slate-600 tabular-nums">Base {totalScore}</span>
        <span className={`flex items-center gap-1 font-semibold tabular-nums ${bonusToneColor}`}>
          <BonusTokenIcon small />
          {bonusTokens} × token
          <span className="text-slate-400 font-normal">=</span>
          {bonusToneSign}{Math.abs(bonusValue)}
        </span>
      </div>

      <div className="bg-slate-900 text-white p-3 rounded-xl text-center relative">
        {isNewBest && (
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-900 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow ring-2 ring-slate-900">
            New best!
          </div>
        )}
        <span className="block text-xs text-slate-300 font-bold uppercase tracking-wider">Final</span>
        <span className="block text-4xl lg:text-5xl font-bold text-white tabular-nums leading-tight mt-0.5">{finalScore}</span>
        {modeBest !== null && !isNewBest && (
          <span className="block text-[11px] text-slate-400 tabular-nums">Best: {modeBest}</span>
        )}
      </div>

      {isDaily && (
        <button onClick={onShare}
          style={{ touchAction: 'manipulation' }}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2">
          <ShareIcon />
          Share result
        </button>
      )}

      {/* Side-by-side CTAs to save vertical space. On Daily, "Play Again" is
          still offered — recordDaily will overwrite the current day's score. */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onRestart}
          style={{ touchAction: 'manipulation' }}
          className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-3 rounded-xl transition-colors active:scale-[0.98]">
          Play Again
        </button>
        <button onClick={onBackToMenu}
          style={{ touchAction: 'manipulation' }}
          className="bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-3 rounded-xl border border-slate-300 transition-colors active:scale-[0.98]">
          Menu
        </button>
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

// ---------- Score line row ----------

type ScoreLineProps = {
  icon: JSX.Element;
  label: string;
  value: number;
  tone: 'plus' | 'minus' | 'time';
  delayMs: number;
};

function ScoreLine({ icon, label, value, tone, delayMs }: ScoreLineProps) {
  const valueColor =
    tone === 'minus'  ? 'text-rose-600'
    : tone === 'time'  ? 'text-sky-600'
    : 'text-slate-800';
  const bgTint =
    tone === 'minus'  ? 'bg-rose-50'
    : tone === 'time'  ? 'bg-sky-50'
    : 'bg-slate-50';

  return (
    <li
      className={`animate-score-line-in flex items-center justify-between py-2 px-3 rounded-lg ${bgTint}`}
      style={{ animationDelay: `${delayMs}ms` }}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0">{icon}</span>
        <span className="text-sm text-slate-700 truncate">{label}</span>
      </div>
      <span className={`font-bold tabular-nums text-sm ${valueColor} shrink-0`}>
        {value > 0 ? '+' : value < 0 ? '−' : ''}{Math.abs(value)}
      </span>
    </li>
  );
}

// ---------- Icons ----------

const SphereIcon = () => (
  <div
    className="w-5 h-5 rounded-full shadow-sm"
    style={{ background: 'radial-gradient(circle at 35% 28%, #cbd5e1, #475569 45%, #0f172a 100%)' }} />
);

const ClockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const FailIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="3" strokeLinecap="round">
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

const BonusTokenIcon = ({ small }: { small?: boolean }) => (
  <div
    className={`${small ? 'w-4 h-4' : 'w-5 h-5'} rounded-full shadow-sm shrink-0`}
    style={{
      background: 'conic-gradient(from 0deg, #F43F5E 0deg 72deg, #F59E0B 72deg 144deg, #047857 144deg 216deg, #7C3AED 216deg 288deg, #D6D3D1 288deg 360deg)',
      boxShadow: 'inset -1px -2px 3px rgba(0,0,0,0.3), inset 1px 2px 3px rgba(255,255,255,0.15)',
    }} />
);
