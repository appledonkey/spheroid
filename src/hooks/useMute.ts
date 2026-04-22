import { useState } from 'react';
import { setMuted as setSfxMuted } from '../audio/sfx';

const KEY = 'spheroids.audio.muted';

function loadMuted(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

// Reactive mute flag backed by localStorage. Also keeps the sfx module's
// master-mute flag in sync so non-React call sites get the right answer.
export function useMute(): [boolean, (next: boolean) => void] {
  const [muted, setMutedState] = useState<boolean>(() => {
    const m = loadMuted();
    setSfxMuted(m);
    return m;
  });

  const update = (next: boolean) => {
    setMutedState(next);
    setSfxMuted(next);
    try {
      localStorage.setItem(KEY, String(next));
    } catch {
      // ignore quota / privacy-mode errors
    }
  };

  return [muted, update];
}
