export type HowToViewProps = {
  onBack: () => void;
};

// Shared "How to Play" view used by both the pre-game menu and the in-game
// pause menu. Scrolls internally; data-allow-scroll exempts it from the
// viewport touch-lock.
export function HowToView({ onBack }: HowToViewProps) {
  return (
    <div className="flex flex-col max-h-[80vh]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
        <button
          onClick={onBack}
          aria-label="Back"
          style={{ touchAction: 'manipulation' }}
          className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center active:scale-95 transition-transform shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h2 className="text-lg font-bold text-slate-900">How to Play</h2>
      </div>
      <div className="p-4 overflow-y-auto text-slate-700 space-y-4 text-sm leading-relaxed" data-allow-scroll>
        <section>
          <h3 className="font-bold text-slate-900 mb-1">Goal</h3>
          <p>Build a sphere pyramid that satisfies your condition cards before the timer runs out.</p>
        </section>
        <section>
          <h3 className="font-bold text-slate-900 mb-1">Placing spheres</h3>
          <p>Select a color, tap an empty slot to place a sphere. Mid-layer slots require the base triangle below them; the apex requires all three mid-layer spheres. Tap a placed sphere to remove it — only if nothing rests on top.</p>
        </section>
        <section>
          <h3 className="font-bold text-slate-900 mb-1">Condition cards</h3>
          <ul className="list-disc list-outside pl-5 space-y-1">
            <li><strong>= N</strong> — Place exactly N spheres of that color.</li>
            <li><strong>A — B</strong> (green line) — Every A must touch a B, and every B must touch an A. Same-color variants (A — A) mean every A must touch another A.</li>
            <li><strong>A ✕ B</strong> (red X) — No A may touch any B. Same-color (A ✕ A) means no two A's may touch.</li>
            <li><strong>A ↑/</strong> (up arrow slashed) — Color A may never sit on top of another sphere (stays on the base ring).</li>
            <li><strong>A ↓/</strong> (down arrow slashed) — Nothing may rest on top of color A.</li>
            <li><strong>A &gt; B</strong> / <strong>A &lt; B</strong> — More (or fewer) of color A than color B.</li>
            <li><strong>A + B = N</strong> — The total number of A's plus B's equals N exactly.</li>
          </ul>
          <p className="mt-2">A green check on a card means currently passing; an amber "!" means currently failing. (Escalation can hide these live hints.)</p>
        </section>
        <section>
          <h3 className="font-bold text-slate-900 mb-1">Scoring — per round</h3>
          <ul className="list-disc list-outside pl-5 space-y-1">
            <li>+1 per sphere placed on your tray</li>
            <li>−2 for each condition that isn't met (whether or not you touched its colors)</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-slate-900 mb-1">Bonus tokens — end of game</h3>
          <p>Earn a bonus token on any round where <strong>all tasks pass AND all 5 colors are used</strong>. Tokens cash in at game end on a non-linear curve:</p>
          <ul className="list-disc list-outside pl-5 space-y-1 mt-1">
            <li>0 tokens → −6, 1 → −3, 2 → −1</li>
            <li>3 tokens → 0 (break even)</li>
            <li>4 → +1, 5 → +3, 6 → +6</li>
          </ul>
          <p className="mt-2">Consistent perfection is the real win condition — the token curve outweighs per-round scoring.</p>
        </section>
        <section>
          <h3 className="font-bold text-slate-900 mb-1">Modes</h3>
          <ul className="list-disc list-outside pl-5 space-y-1">
            <li><strong>Classic</strong> — fixed card count every round.</li>
            <li><strong>Escalation</strong> — starts at N cards and grows over time (every round, every other round, or random).</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-slate-900 mb-1">Camera</h3>
          <p>Drag the board to rotate the view in 3D.</p>
        </section>
      </div>
    </div>
  );
}
