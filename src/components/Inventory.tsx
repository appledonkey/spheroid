import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COLORS, COLOR_DISPLAY_NAME, sphereGradientStyle } from '../constants/colors';
import { INVENTORY_PER_COLOR } from '../game/tasks';
import type { Color, Inventory as InventoryType } from '../types';

// Drag threshold in px — pointers that never travel farther than this from
// the down point are treated as taps (setSelectedColor, existing behavior).
// Taps stay the primary interaction; drag is layered on top.
const DRAG_THRESHOLD_PX = 6;

export type InventoryProps = {
  inventory: InventoryType;
  selectedColor: Color | null;
  onSelect: (color: Color) => void;
  onFinishRound: () => void;
  // When false, "Finish Round" is disabled (e.g. during the dealing /
  // countdown pre-round). Color selection stays enabled so the player can
  // pre-pick while they wait.
  canFinish?: boolean;
  // Populated by Board3D — ask "what slot is under (clientX, clientY)?"
  // Used on pointer-up to figure out where a dragged ball should land.
  // When null/undefined, drag-to-drop is disabled (taps still work).
  hitTestRef?: React.MutableRefObject<((cx: number, cy: number) => number | null) | null>;
  // Called when a drag release lands on a valid slot. App handles the
  // actual placement (same path as tap-then-slot-click).
  onPlaceFromDrag?: (slotId: number, color: Color) => void;
};

type DragState = {
  color: Color;
  startX: number;
  startY: number;
  x: number;
  y: number;
  // True once the pointer has traveled past DRAG_THRESHOLD_PX. Below it, we
  // still call the release a "tap" and use the select-color flow.
  dragging: boolean;
};

export function Inventory({
  inventory, selectedColor, onSelect, onFinishRound, canFinish = true,
  hitTestRef, onPlaceFromDrag,
}: InventoryProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  // Latest drag state accessible from inside the window listeners without
  // stale-closure issues. Updated every render.
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  // Window-level pointer listeners while a drag is active so we still see
  // move/up events even when the pointer leaves the inventory button.
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const dragging = d.dragging || (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX);
      setDrag({ ...d, x: e.clientX, y: e.clientY, dragging });
    };
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.dragging) {
        // Drag release: hit-test the 3D board. If it returns a slot, App
        // re-uses its placement path (rules check + sfx + animation).
        const slotId = hitTestRef?.current?.(e.clientX, e.clientY) ?? null;
        if (slotId !== null && onPlaceFromDrag) onPlaceFromDrag(slotId, d.color);
      } else {
        // Never crossed the threshold — treat as a tap and fall back to the
        // existing select-color flow (tap again on a slot to place).
        onSelect(d.color);
      }
      setDrag(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag, hitTestRef, onPlaceFromDrag, onSelect]);

  const startDrag = (color: Color, e: React.PointerEvent) => {
    if (inventory[color] === 0) return;
    e.preventDefault();
    setDrag({
      color,
      startX: e.clientX, startY: e.clientY,
      x: e.clientX, y: e.clientY,
      dragging: false,
    });
  };

  return (
    <div className="bg-white p-2 lg:p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-2 lg:gap-3 lg:flex-1 lg:min-h-0">
      {/* Label now lives in App.tsx for layout uniformity with the left
          "Conditions" panel — this card is just the racks + Finish Round. */}

      {/* Color racks — each shows the literal N balls remaining for that
          color. Mobile: horizontal strip (5 columns). Desktop: vertical
          stack (1 column per color, racks fill the column height evenly). */}
      <div className="grid grid-cols-5 lg:grid-cols-1 gap-1.5 lg:gap-2 lg:flex-1 lg:min-h-0 lg:[grid-auto-rows:minmax(60px,120px)]">
        {COLORS.map(color => {
          const count = inventory[color];
          const selected = selectedColor === color;
          const out = count === 0;
          const isDraggingThis = drag?.color === color && drag.dragging;
          return (
            <button
              key={color}
              onPointerDown={(e) => startDrag(color, e)}
              // Keyboard fallback (pointer listeners handle the mouse/touch
              // paths). Space / Enter still selects the color.
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !out) {
                  e.preventDefault();
                  onSelect(color);
                }
              }}
              disabled={out}
              // touchAction:none so the browser doesn't try to scroll/zoom
              // during a drag — we need every pointermove event.
              style={{ touchAction: 'none' }}
              aria-label={`${COLOR_DISPLAY_NAME[color]} — ${count} remaining`}
              className={`inventory-rack relative flex items-center justify-center gap-1 lg:gap-2 p-1 lg:p-1.5 rounded-xl border-2 transition-all active:scale-95 ${
                isDraggingThis ? 'opacity-50' : ''
              } ${
                selected
                  ? 'border-slate-900 bg-slate-50 shadow-md lg:ring-2 lg:ring-slate-900 lg:ring-offset-0'
                  : out
                  ? 'border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed'
                  : 'border-slate-200 bg-white hover:border-slate-400 hover:shadow'
              }`}>
              {Array.from({ length: INVENTORY_PER_COLOR }, (_, i) => {
                // Deplete left-to-right: leftmost balls disappear first as the
                // player spends them, so remaining balls stay right-aligned.
                const present = i >= INVENTORY_PER_COLOR - count;
                return present ? (
                  <div
                    key={i}
                    className="inventory-ball rounded-full shadow-md shrink-0"
                    style={{ background: sphereGradientStyle(color) }} />
                ) : (
                  <div
                    key={i}
                    className="inventory-ball rounded-full border-2 border-dashed border-slate-300 shrink-0" />
                );
              })}
            </button>
          );
        })}
      </div>

      <button
        onClick={canFinish ? onFinishRound : undefined}
        disabled={!canFinish}
        style={{ touchAction: 'manipulation' }}
        className={`w-full flex items-center justify-center py-2 lg:py-2.5 px-3 rounded-xl border-2 transition-all active:scale-[0.98] ${
          canFinish
            ? 'border-slate-900 bg-slate-900 text-white'
            : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
        }`}>
        <span className="text-xs lg:text-sm font-bold uppercase tracking-wide">Finish Round</span>
      </button>

      <p className="hidden lg:block text-xs text-slate-500 mt-3 leading-relaxed">
        Tap a ball to pick that color, then tap a slot — or drag the ball directly onto a slot. Tap a placed sphere to remove it. Drag the board to rotate.
      </p>

      {/* Ghost ball — portaled to <body> so it follows the cursor globally
          while a drag is in progress, regardless of container overflow. */}
      {drag?.dragging && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            left: drag.x,
            top: drag.y,
            transform: 'translate(-50%, -50%)',
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: sphereGradientStyle(drag.color),
            pointerEvents: 'none',
            zIndex: 9999,
            boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
            opacity: 0.9,
          }} />,
        document.body,
      )}
    </div>
  );
}
