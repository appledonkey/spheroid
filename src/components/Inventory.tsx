import { COLORS, COLOR_DISPLAY_NAME, sphereGradientStyle } from '../constants/colors';
import { INVENTORY_PER_COLOR } from '../game/tasks';
import type { Color, Inventory as InventoryType } from '../types';

export type InventoryProps = {
  inventory: InventoryType;
  selectedColor: Color | null;
  onSelect: (color: Color) => void;
  onFinishRound: () => void;
  // When false, "Finish Round" is disabled (e.g. during the dealing /
  // countdown pre-round). Color selection stays enabled so the player can
  // pre-pick while they wait.
  canFinish?: boolean;
};

export function Inventory({
  inventory, selectedColor, onSelect, onFinishRound, canFinish = true,
}: InventoryProps) {
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
          return (
            <button
              key={color}
              onClick={() => !out && onSelect(color)}
              disabled={out}
              style={{ touchAction: 'manipulation' }}
              aria-label={`${COLOR_DISPLAY_NAME[color]} — ${count} remaining`}
              className={`inventory-rack relative flex items-center justify-center gap-1 lg:gap-2 p-1 lg:p-1.5 rounded-xl border-2 transition-all active:scale-95 ${
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
        Tap a ball to pick that color, then tap a slot on the board to place it. Tap a placed sphere to remove it. Drag the board to rotate.
      </p>
    </div>
  );
}
