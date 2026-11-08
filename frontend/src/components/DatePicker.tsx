import { useId } from 'react';

type Props = {
  value: string;
  min: string;
  max: string;
  onChange: (date: string) => void;
};

/** Calendario nativo: las fechas fuera de `min`..`max` quedan deshabilitadas (FR-010). */
export function DatePicker({ value, min, max, onChange }: Props) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        Fecha
      </label>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="mt-1 rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-600 focus:outline-none"
      />
    </div>
  );
}
