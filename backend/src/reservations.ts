import { Router } from 'express';
import { requireAuth } from './auth.js';
import type { Db } from './db.js';
import { appError, sendError } from './errors.js';
import { checkActiveRule, parseSlotInput, type SlotInput } from './rules.js';
import { addDays, formatHour, isWithinWindow, slotEnd, slotStart, todayInMedellin } from './time.js';

type Court = { id: number; name: string };

export type CreatedReservation = {
  id: number;
  court: Court;
  date: string;
  startTime: string;
  endTime: string;
};

/**
 * Crea una reserva sin posibilidad de doble reserva (Principio II, FR-016, FR-017, FR-019).
 * Verificación de colisión + regla de reserva activa + inserción en una única
 * transacción IMMEDIATE; la restricción UNIQUE es la red de seguridad.
 * Lanza `appError` con el código correspondiente si la reserva no procede.
 */
export function createReservationTx(db: Db, userId: number, slot: SlotInput, now: Date): CreatedReservation {
  const run = db.transaction(() => {
    const court = db.prepare<[number], Court>('SELECT id, name FROM courts WHERE id = ?').get(slot.courtId);
    if (!court) throw appError('COURT_NOT_FOUND');

    const taken = db
      .prepare('SELECT 1 FROM reservations WHERE court_id = ? AND date = ? AND start_hour = ?')
      .get(slot.courtId, slot.date, slot.startHour);
    if (taken) throw appError('SLOT_TAKEN');

    // Reservas activas del usuario: aquellas cuyo fin aún no llega (incluye la en curso).
    const active = db
      .prepare<[number, string], { court_id: number; date: string; start_hour: number }>(
        'SELECT court_id, date, start_hour FROM reservations WHERE user_id = ? AND date >= ?',
      )
      // Una reserva activa empezó como muy pronto ayer (Medellín): basta buscar desde ahí.
      .all(userId, addDays(todayInMedellin(now), -1))
      .map((r) => ({ courtId: r.court_id, date: r.date, startHour: r.start_hour }))
      .filter((r) => slotEnd(r.date, r.startHour) > now);
    const ruleError = checkActiveRule(active, slot);
    if (ruleError) throw appError(ruleError);

    try {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO reservations (user_id, court_id, date, start_hour) VALUES (?, ?, ?, ?)')
        .run(userId, slot.courtId, slot.date, slot.startHour);
      return {
        id: Number(lastInsertRowid),
        court,
        date: slot.date,
        startTime: formatHour(slot.startHour),
        endTime: formatHour(slot.startHour + 1),
      };
    } catch (err) {
      if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') throw appError('SLOT_TAKEN');
      throw err;
    }
  });
  return run.immediate();
}

/** Rutas de reservas, montadas en `/api/reservations`. */
export function reservationsRouter(db: Db, now: () => Date) {
  const router = Router();
  const auth = requireAuth(db, now);
  const courtExists = db.prepare('SELECT 1 FROM courts WHERE id = ?');

  // Orden de validaciones: data-model.md "Reglas de validación al crear una reserva".
  router.post('/', auth, (req, res) => {
    const courtId = (req.body as { courtId?: unknown } | undefined)?.courtId;
    if (Number.isInteger(courtId) && !courtExists.get(courtId)) return sendError(res, 'COURT_NOT_FOUND');
    const slot = parseSlotInput(req.body);
    if (!slot) return sendError(res, 'INVALID_SLOT');
    const current = now();
    if (slotStart(slot.date, slot.startHour) <= current) return sendError(res, 'SLOT_IN_PAST');
    if (!isWithinWindow(slot.date, current)) return sendError(res, 'OUTSIDE_BOOKING_WINDOW');

    const reservation = createReservationTx(db, res.locals.userId, slot, current);
    res.status(201).json({ reservation });
  });

  const listMine = db.prepare<
    [number],
    { id: number; date: string; start_hour: number; court_id: number; court_name: string }
  >(
    `SELECT r.id, r.date, r.start_hour, c.id AS court_id, c.name AS court_name
       FROM reservations r JOIN courts c ON c.id = r.court_id
      WHERE r.user_id = ?
      ORDER BY r.date, r.start_hour`,
  );

  // Panel "Mis Reservas" (FR-021, FR-022): solo las del usuario de la sesión (FR-008).
  router.get('/me', auth, (_req, res) => {
    const current = now();
    const upcoming: Array<CreatedReservation & { cancellable: boolean }> = [];
    const history: Array<CreatedReservation & { cancellable: boolean }> = [];
    for (const r of listMine.all(res.locals.userId)) {
      const pending = slotStart(r.date, r.start_hour) > current;
      (pending ? upcoming : history).push({
        id: r.id,
        court: { id: r.court_id, name: r.court_name },
        date: r.date,
        startTime: formatHour(r.start_hour),
        endTime: formatHour(r.start_hour + 1),
        cancellable: pending,
      });
    }
    history.reverse();
    res.json({ upcoming, history });
  });

  const findMine = db.prepare<[number, number], { date: string; start_hour: number }>(
    'SELECT date, start_hour FROM reservations WHERE id = ? AND user_id = ?',
  );
  const deleteMine = db.prepare('DELETE FROM reservations WHERE id = ? AND user_id = ?');

  // Cancelación hasta la hora de inicio (FR-023..025). Ajena o inexistente → 404 sin distinción (FR-008).
  router.delete('/:id', auth, (req, res) => {
    const id = Number(req.params.id);
    const reservation = Number.isInteger(id) ? findMine.get(id, res.locals.userId) : undefined;
    if (!reservation) return sendError(res, 'RESERVATION_NOT_FOUND');
    if (slotStart(reservation.date, reservation.start_hour) <= now()) return sendError(res, 'RESERVATION_STARTED');
    deleteMine.run(id, res.locals.userId);
    res.status(204).end();
  });

  return router;
}
