import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  createReservation,
  errorMessage,
  formatDate,
  getAvailability,
  isApiError,
  todayInMedellin,
  type Availability,
  type Reservation,
} from '../api';
import { DatePicker } from '../components/DatePicker';
import { ErrorMessage } from '../components/ErrorMessage';
import { SlotGrid } from '../components/SlotGrid';

// Errores tras los cuales la grilla está desactualizada y debe recargarse (Edge Case "Grilla desactualizada").
const STALE_GRID_CODES = new Set(['SLOT_TAKEN', 'SLOT_IN_PAST', 'OUTSIDE_BOOKING_WINDOW']);

function hourRange(startHour: number): string {
  const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return `${pad(startHour)} a ${pad(startHour + 1)}`;
}

export function CourtAvailabilityPage() {
  const courtId = Number(useParams().courtId);
  const [date, setDate] = useState(todayInMedellin);
  const [data, setData] = useState<Availability | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Reservation | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getAvailability(courtId, date));
    } catch (err) {
      if (!isApiError(err) || err.status !== 401) setError(errorMessage(err));
    }
  }, [courtId, date]);

  useEffect(() => {
    setSelectedHour(null);
    load();
  }, [load]);

  function handleDateChange(next: string) {
    setError(null);
    setConfirmed(null);
    setDate(next);
  }

  function handleSelect(hour: number) {
    setError(null);
    setConfirmed(null);
    setSelectedHour(hour);
  }

  async function handleConfirm() {
    if (selectedHour === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const { reservation } = await createReservation({ courtId, date, startHour: selectedHour });
      setConfirmed(reservation);
      setSelectedHour(null);
      await load();
    } catch (err) {
      if (isApiError(err) && err.status === 401) return; // la sesión expirada la gestiona `auth:expired`
      setError(errorMessage(err));
      if (isApiError(err) && STALE_GRID_CODES.has(err.code)) {
        setSelectedHour(null);
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const courtName = data?.court.name ?? 'Cancha';

  return (
    <section className="space-y-4">
      <Link to="/canchas" className="text-sm text-emerald-700 hover:underline">
        ← Canchas
      </Link>
      <h1 className="text-xl font-semibold">{courtName}</h1>

      {data && (
        <DatePicker value={date} min={data.bookingWindow.from} max={data.bookingWindow.to} onChange={handleDateChange} />
      )}

      {confirmed && (
        <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          ¡Reserva confirmada! {confirmed.court.name}, {formatDate(confirmed.date)}, de {confirmed.startTime} a{' '}
          {confirmed.endTime}.
        </div>
      )}
      <ErrorMessage message={error} />

      {selectedHour !== null && (
        <div className="rounded-lg border border-emerald-300 bg-white p-4 shadow-sm">
          <p className="mb-3">
            Reservar <strong>{courtName}</strong> el <strong>{formatDate(date)}</strong> de{' '}
            <strong>{hourRange(selectedHour)}</strong>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              Confirmar reserva
            </button>
            <button
              type="button"
              onClick={() => setSelectedHour(null)}
              className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
            >
              Volver
            </button>
          </div>
        </div>
      )}

      {data ? (
        <SlotGrid slots={data.slots} selectedHour={selectedHour} onSelect={handleSelect} />
      ) : (
        !error && <p className="text-slate-500">Cargando disponibilidad…</p>
      )}
    </section>
  );
}
