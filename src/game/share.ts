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

// Resolve the share URL at call time so tests and dev builds work. Priority:
//   1. VITE_SHARE_URL — set in Vercel / .env to override for prod (e.g. the
//      eventual real domain). Must be prefixed `VITE_` to be exposed by Vite.
//   2. window.location.origin — correct for whatever host is currently loaded,
//      so the dev server, preview deployments, and unset prod all "just work".
//   3. Hardcoded fallback for SSR / non-browser environments (never hit today).
function shareUrl(): string {
  const envUrl = import.meta.env.VITE_SHARE_URL;
  if (typeof envUrl === 'string' && envUrl.length > 0) return envUrl;
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'https://spheroids.app';
}

export function buildShareText(
  dateStr: string,
  finalScore: number,
  rounds: ShareRound[],
): string {
  // Framed-style: title with `#` prefix, a stats line (cards when we can tell —
  // single-round dailies have one fixed count worth showing), then the emoji
  // grid and URL. Blank line before the URL so it renders cleanly in Discord /
  // iMessage / Slack previews.
  const lines = [`Spheroids #${dateStr}`];
  if (rounds.length === 1) {
    // 1-round dailies: expose the card count so two people's scores can be
    // compared in context (scoring a 12 on a 4-card day is not a 12 on 8 cards).
    lines.push(`${rounds[0].taskCount} cards · Score ${finalScore}`);
  } else {
    lines.push(`Score: ${finalScore}`);
  }
  if (rounds.length > 0) {
    lines.push(rounds.map(emojiFor).join(' '));
  }
  lines.push('', shareUrl());
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
