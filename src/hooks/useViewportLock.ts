import { useEffect } from 'react';

// Locks the page against pull-to-refresh and rubber-band scrolling on mobile.
// Elements marked [data-allow-scroll] and the 3D canvas are exempt (the canvas
// handles its own touch via pointer events).
export function useViewportLock(): void {
  useEffect(() => {
    const block = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-allow-scroll]')) return;
      if (target?.tagName === 'CANVAS') return;
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener('touchmove', block, { passive: false });
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.removeEventListener('touchmove', block);
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, []);
}
