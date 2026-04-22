import { useEffect, useState } from 'react';

// True while the tab is in the foreground. Flips to false when the user
// switches tabs or locks the screen. Used to pause round timers so time
// doesn't tick down while the player isn't looking.
export function useTabVisible(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : !document.hidden
  );

  useEffect(() => {
    const handler = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  return visible;
}
