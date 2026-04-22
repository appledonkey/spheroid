// Daily Challenge share text — framed.wtf-style spoiler-free grid.
// One emoji per round: ⭐️ perfect (bonus token), 🟩 all tasks passed,
// 🟨 partial, 🟥 all failed. Score + date header so the share still
// carries meaningful info even if the grid all reads the same.

export type ShareRound = {
  total: number;
  bonusTokenEarned: boolean;
  // True iff every task on the card passed for this round.
  allTasksPassed: boolean;
  // Total tasks on the card. When 0 failed = allTasksPassed, some failed = partial.
  taskCount: number;
  passedCount: number;
  // Spheres placed. Zero = player skipped the round (no attempt) — we render
  // that as ⬛ to distinguish from 🟥 (tried and failed everything).
  spheres: number;
};

export function buildShareText(
  dateStr: string,
  finalScore: number,
  rounds: ShareRound[],
): string {
  // Framed-style: title with `#` prefix, score line, space-separated emoji
  // grid, then a blank line before the URL so it renders cleanly in Discord /
  // iMessage / Slack previews. If rounds is empty (back-compat entry from the
  // pre-schema-v2 storage), omit the grid line entirely so the share doesn't
  // have a weird blank gap.
  const lines = [`Spheroids #${dateStr}`, `Score: ${finalScore}`];
  if (rounds.length > 0) {
    lines.push(rounds.map(emojiFor).join(' '));
  }
  lines.push('', 'https://spheroids.app');
  return lines.join('\n');
}

function emojiFor(r: ShareRound): string {
  if (r.spheres === 0) return '⬛';
  if (r.bonusTokenEarned) return '⭐️';
  if (r.allTasksPassed) return '🟩';
  if (r.passedCount > 0) return '🟨';
  return '🟥';
}

// Tries Web Share API first (mobile), falls back to clipboard. Returns which
// path succeeded so the caller can tailor the confirmation toast.
export type ShareResult = 'shared' | 'copied' | 'failed';

export async function shareText(text: string): Promise<ShareResult> {
  // Only use the Web Share API on touch devices — on Windows/macOS desktop
  // it pops the native OS share sheet (Nearby Sharing, Teams, etc.) which is
  // overkill and unfamiliar for this flow. Clipboard-and-paste is what Wordle
  // / Framed users expect on desktop. Touch pointer + no-hover ≈ phone/tablet.
  const isTouchDevice =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  if (isTouchDevice && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'failed';
      // Otherwise fall through to clipboard.
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  return 'failed';
}
