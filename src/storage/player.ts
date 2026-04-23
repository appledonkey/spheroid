// Remembered display name across sessions. Seeded into the Create / Join
// form so repeat players don't have to re-type every time. Unset on first
// launch; we don't bother with a default name — the input is required.

const KEY = 'spheroids.player.name';

export function loadPlayerName(): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, name);
  } catch {
    // ignore
  }
}
