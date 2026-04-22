export type SettingRowProps = {
  label: string;
  value: number;
  suffix?: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
};

export function SettingRow({ label, value, suffix = '', min, max, step = 1, onChange }: SettingRowProps) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  return (
    <div className="flex items-center justify-between bg-slate-50 rounded-lg px-2.5 py-1 min-w-0 gap-1.5">
      <span className="text-xs font-semibold text-slate-700 truncate">{label}</span>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={dec}
          disabled={value <= min}
          style={{ touchAction: 'manipulation' }}
          className="w-7 h-7 rounded-md bg-white border border-slate-300 text-slate-700 font-bold text-base leading-none disabled:opacity-30 active:scale-95 transition-transform">
          −
        </button>
        <span className="font-bold text-slate-900 w-10 text-sm text-center tabular-nums">{value}{suffix}</span>
        <button
          onClick={inc}
          disabled={value >= max}
          style={{ touchAction: 'manipulation' }}
          className="w-7 h-7 rounded-md bg-white border border-slate-300 text-slate-700 font-bold text-base leading-none disabled:opacity-30 active:scale-95 transition-transform">
          +
        </button>
      </div>
    </div>
  );
}
