import { useEffect, useState } from 'react';
import type { MultiplayerPlayer } from '../types';

export type MultiplayerResultsProps = {
  players: MultiplayerPlayer[];
  selfId: string;
  onPlayAgain: () => void;
  onBackToMenu: () => void;
};

const REVEAL_STAGGER_MS = 900;

// Ranked reveal: winner appears first, then 2nd, 3rd, etc. Reverse of the
// Jeopardy-style "build to the big score" convention — the user wanted the
// winner-first shape to match how friends would reveal at a game night
// ("who won? ME. now let's laugh at everyone else's scores").
export function MultiplayerResults({ players, selfId, onPlayAgain, onBackToMenu }: MultiplayerResultsProps) {
  // Stable ranked order: highest finalScore first. Ties keep server-order
  // which is stable enough for Phase 1.
  const ranked = [...players].sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    setVisibleCount(0);
    let cancelled = false;
    let i = 0;
    const tick = () => {
      if (cancelled) return;
      i += 1;
      setVisibleCount(i);
      if (i < ranked.length) setTimeout(tick, REVEAL_STAGGER_MS);
    };
    const first = setTimeout(tick, 400);
    return () => { cancelled = true; clearTimeout(first); };
  }, [ranked.length]);

  const winner = ranked[0];
  const selfRank = ranked.findIndex(p => p.id === selfId);

  return (
    <div className="bg-emerald-950 flex flex-col items-center justify-center p-4 fixed inset-0 overflow-hidden"
         style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Results</h2>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto" data-allow-scroll>
          {visibleCount > 0 && winner && (
            <div className="relative bg-gradient-to-b from-amber-50 to-amber-100 border-2 border-amber-400 rounded-xl p-4 text-center animate-score-total-pop animate-winner-halo overflow-hidden">
              {/* Subtle shimmer pass — light sweeping diagonally across the
                  card. Pure CSS, purely decorative. */}
              <div className="pointer-events-none absolute -inset-1 opacity-60 animate-winner-shimmer" />
              <div className="relative text-[11px] font-bold uppercase tracking-wider text-amber-700">Winner</div>
              <div className="relative text-3xl font-bold text-slate-900 my-1">{winner.name}</div>
              <div className="relative text-4xl font-bold tabular-nums text-amber-700">{winner.finalScore ?? 0}</div>
            </div>
          )}

          <ul className="space-y-1.5">
            {ranked.map((p, i) => {
              if (i >= visibleCount) return null;
              const isSelf = p.id === selfId;
              return (
                <li
                  key={p.id}
                  className={`animate-score-line-in flex items-center gap-2.5 rounded-lg px-3 py-2 border ${
                    i === 0
                      ? 'bg-amber-50 border-amber-300'
                      : isSelf
                      ? 'bg-indigo-50 border-indigo-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}>
                  <span className={`font-bold text-sm w-6 text-center tabular-nums ${
                    i === 0 ? 'text-amber-600' : 'text-slate-500'
                  }`}>
                    {i + 1}
                  </span>
                  <span className="font-semibold text-slate-800 text-sm truncate flex-1">{p.name}</span>
                  {isSelf && (
                    <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">You</span>
                  )}
                  <span className={`font-bold tabular-nums text-base ${
                    (p.finalScore ?? 0) < 0 ? 'text-rose-600' : 'text-slate-900'
                  }`}>
                    {(p.finalScore ?? 0) > 0 ? '+' : ''}{p.finalScore ?? 0}
                  </span>
                </li>
              );
            })}
          </ul>

          {visibleCount >= ranked.length && (
            <div className="pt-1 space-y-2">
              {selfRank >= 0 && (
                <p className="text-xs text-center text-slate-500">
                  You finished {ordinal(selfRank + 1)} of {ranked.length}.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onPlayAgain}
                  style={{ touchAction: 'manipulation' }}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-3 rounded-xl transition-colors active:scale-[0.98]">
                  Play Again
                </button>
                <button
                  onClick={onBackToMenu}
                  style={{ touchAction: 'manipulation' }}
                  className="bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-3 rounded-xl border border-slate-300 transition-colors active:scale-[0.98]">
                  Menu
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

// Simple full-screen waiting panel shown after you finish but before the
// last player does. Phase 1 autoresolves after a short timeout.
export function MultiplayerWaiting({ players, selfId }: { players: MultiplayerPlayer[]; selfId: string }) {
  const stillPlaying = players.filter(p => !p.finished && p.id !== selfId);
  return (
    <div className="bg-emerald-950 flex flex-col items-center justify-center p-4 fixed inset-0 overflow-hidden"
         style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden p-6 text-center">
        <div className="w-14 h-14 mx-auto mb-3 relative">
          <div className="absolute inset-0 rounded-full border-4 border-indigo-200" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-600 animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Hold tight</h2>
        <p className="text-sm text-slate-600 mb-3">
          {stillPlaying.length === 0
            ? 'Tallying results…'
            : `Waiting on ${stillPlaying.map(p => p.name).join(', ')}…`}
        </p>
      </div>
    </div>
  );
}
