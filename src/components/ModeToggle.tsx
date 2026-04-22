export type ModeToggleOption<T extends string> = { value: T; label: string };

export type ModeToggleProps<T extends string> = {
  value: T;
  onChange: (v: T) => void;
  options: ModeToggleOption<T>[];
  label?: string;
};

export function ModeToggle<T extends string>({ value, onChange, options, label = 'Mode' }: ModeToggleProps<T>) {
  return (
    <div className="flex items-center justify-between bg-slate-50 rounded-lg px-2.5 py-1 gap-2">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <div className="flex gap-0.5 bg-slate-200 rounded-lg p-0.5">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{ touchAction: 'manipulation' }}
            className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all ${
              value === opt.value
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
