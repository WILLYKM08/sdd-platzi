import { useCallback, useEffect, useState } from 'react';
import { cancelReservation, errorMessage, formatDate, getMyReservations, isApiError, type Reservation } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';

type Lists = { upcoming: Reservation[]; history: Reservation[] };

function ReservationItem({ reservation, onCancel }: { reservation: Reservation; onCancel?: () => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div>
        <p className="font-medium">{reservation.court.name}</p>
        <p className="text-sm text-slate-600">
          {formatDate(reservation.date)} · {reservation.startTime}–{reservation.endTime}
        </p>
      </div>
      {onCancel && reservation.cancellable && (
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Cancelar
        </button>
      )}
    </li>
  );
}

export function MyReservationsPage() {
  const [lists, setLists] = useState<Lists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toCancel, setToCancel] = useState<Reservation | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLists(await getMyReservations());
    } catch (err) {
      if (!isApiError(err) || err.status !== 401) setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const closeDialog = useCallback(() => setToCancel(null), []);

  async function handleConfirmCancel() {
    if (!toCancel) return;
    setBusy(true);
    setError(null);
    let failure: unknown = null;
    try {
      await cancelReservation(toCancel.id);
    } catch (err) {
      failure = err;
    }

    // Sesión expirada: `auth:expired` ya redirige al login; no se toca más el estado.
    if (isApiError(failure) && failure.status === 401) return;

    setBusy(false);
    setToCancel(null);
    if (failure) setError(errorMessage(failure));
    // Se recarga en ambos casos: tras cancelar, o para reflejar el estado real si falló
    // (p. ej. la reserva ya comenzó).
    await load();
  }

  const empty = lists && lists.upcoming.length === 0 && lists.history.length === 0;

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Mis Reservas</h1>
      <ErrorMessage message={error} />
      {!lists && !error && <p className="text-slate-500">Cargando…</p>}
      {empty && <p className="rounded-lg bg-white px-4 py-6 text-center text-slate-600">Aún no tienes reservas</p>}
      {lists && !empty && (
        <>
          <div>
            <h2 className="mb-2 font-semibold">Próximas</h2>
            {lists.upcoming.length === 0 ? (
              <p className="text-sm text-slate-500">No tienes reservas próximas.</p>
            ) : (
              <ul className="space-y-2">
                {lists.upcoming.map((r) => (
                  <ReservationItem key={r.id} reservation={r} onCancel={() => setToCancel(r)} />
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className="mb-2 font-semibold">Historial</h2>
            {lists.history.length === 0 ? (
              <p className="text-sm text-slate-500">Aún no tienes reservas en el historial.</p>
            ) : (
              <ul className="space-y-2">
                {lists.history.map((r) => (
                  <ReservationItem key={r.id} reservation={r} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
      <ConfirmDialog
        open={toCancel !== null}
        title="Cancelar reserva"
        message={
          toCancel
            ? `¿Cancelar la reserva de ${toCancel.court.name} el ${formatDate(toCancel.date)} de ${toCancel.startTime} a ${toCancel.endTime}?`
            : ''
        }
        confirmLabel="Sí, cancelar"
        cancelLabel="No, volver"
        busy={busy}
        onConfirm={handleConfirmCancel}
        onCancel={closeDialog}
      />
    </section>
  );
}
