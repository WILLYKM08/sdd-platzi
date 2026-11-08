import type { Slot } from '../api';

type Props = {
  slots: Slot[];
  selectedHour: number | null;
  onSelect: (startHour: number) => void;
};

function slotClass(slot: Slot, selected: boolean): string {
  const base = 'flex flex-col items-start rounded-md border px-3 py-2 text-left transition';
  if (selected) return `${base} border-emerald-700 bg-emerald-600 text-white`;
  if (slot.status === 'reserved') return `${base} cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500`;
  if (!slot.selectable) return `${base} cursor-not-allowed border-slate-200 bg-white text-slate-400 opacity-60`;
  return `${base} border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-500`;
}

/** Grilla de 24 bloques de 1 hora con su estado (FR-011, FR-012). */
export function SlotGrid({ slots, selectedHour, onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {slots.map((slot) => {
        const selected = slot.startHour === selectedHour;
        return (
          <button
            key={slot.startHour}
            type="button"
            disabled={!slot.selectable}
            aria-pressed={selected}
            onClick={() => onSelect(slot.startHour)}
            className={slotClass(slot, selected)}
          >
            <span className="font-mono text-sm font-medium">{slot.label}</span>
            <span className="text-xs">{slot.status === 'reserved' ? 'Reservado' : 'Disponible'}</span>
          </button>
        );
      })}
    </div>
  );
}
