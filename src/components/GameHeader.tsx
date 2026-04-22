export type GameHeaderProps = {
  round: number;
  totalRounds: number;
  totalScore: number;
  timer: number;
  isPlaying: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onMenuClick: () => void;
};

export function GameHeader({
  round, totalRounds, totalScore, timer, isPlaying, muted, onToggleMute, onMenuClick,
}: GameHeaderProps) {
  return (
    <header className="grid grid-cols-3 items-center bg-white px-3 py-2 lg:p-3 shadow-sm border-b lg:border lg:rounded-xl border-slate-200 lg:m-3 lg:mb-2">
      <div className="flex flex-col justify-self-start">
        <span className="text-[10px] lg:text-xs text-slate-500 font-semibold uppercase tracking-wider">Round {round} / {totalRounds}</span>
        <span className="text-base lg:text-xl font-bold text-slate-800">Score: {totalScore}</span>
      </div>
      <div className="flex flex-col items-center justify-self-center">
        <span className="text-[10px] lg:text-xs text-slate-500 font-semibold uppercase tracking-wider">Time</span>
        <span className={`text-xl lg:text-2xl font-mono font-bold tabular-nums ${
          isPlaying && timer > 0 && timer <= 5 ? 'animate-timer-warning'
          : isPlaying && timer <= 10 ? 'text-rose-500'
          : 'text-slate-800'
        }`}>
          0:{timer.toString().padStart(2, '0')}
        </span>
      </div>
      <div className="flex items-center gap-2 lg:gap-3 justify-self-end">
        <button
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          aria-pressed={muted}
          style={{ touchAction: 'manipulation' }}
          className="w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center active:scale-95 transition-transform shrink-0">
          {muted ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          )}
        </button>
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          style={{ touchAction: 'manipulation' }}
          className="w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center active:scale-95 transition-transform shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </header>
  );
}
