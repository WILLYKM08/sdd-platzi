import { Router, type RequestHandler } from 'express';
import type { Db } from './db.js';
import { appError, sendError } from './errors.js';
import { checkActiveRule, consecutiveRunLength, parseSlotInput, type SlotInput } from './rules.js';
import { addDays, formatHour, isWithinWindow, slotEnd, slotStart, todayInMedellin } from './time.js';

type Court = { id: number; name: string };
type SlotRow = { court_id: number; date: string; start_hour: number };

export type CreatedReservation = {
  id: number;
  court: Court;
  date: string;
  startTime: string;
  endTime: string;
};

export type CreateReservation = (userId: number, slot: SlotInput, now: Date) => CreatedReservation;

/**
 * Devuelve la función que crea reservas sin posibilidad de doble reserva
 * (Principio II, FR-016..019), con sus sentencias preparadas una sola vez para `db`.
 * Todas las validaciones, en el orden de data-model.md, y la inserción ocurren en
 * una única transacción IMMEDIATE; la restricción UNIQUE es la red de seguridad.
 * La función lanza `appError` con el código correspondiente si la reserva no procede.
 */
export function makeCreateReservation(db: Db): CreateReservation {
  const findCourt = db.prepare<[number], Court>('SELECT id, name FROM courts WHERE id = ?');
  const slotTaken = db.prepare<[number, string, number], unknown>(
    'SELECT 1 FROM reservations WHERE court_id = ? AND date = ? AND start_hour = ?',
  );
  const userReservationsSince = db.prepare<[number, string], SlotRow>(
    'SELECT court_id, date, start_hour FROM reservations WHERE user_id = ? AND date >= ?',
  );
  const insert = db.prepare<[number, number, string, number]>(
    'INSERT INTO reservations (user_id, court_id, date, start_hour) VALUES (?, ?, ?, ?)',
  );

  const transaction = db.transaction((userId: number, slot: SlotInput, now: Date): CreatedReservation => {
    const court = findCourt.get(slot.courtId);
    if (!court) throw appError('COURT_NOT_FOUND');
    if (slotStart(slot.date, slot.startHour) <= now) throw appError('SLOT_IN_PAST');
    if (!isWithinWindow(slot.date, now)) throw appError('OUTSIDE_BOOKING_WINDOW');

    if (slotTaken.get(slot.courtId, slot.date, slot.startHour)) throw appError('SLOT_TAKEN');

    // Reservas del usuario desde ayer (Medellín). Basta: las activas (fin > ahora)
    // empezaron como muy pronto ayer, y el bloque nuevo es de hoy en adelante, así que
    // sus posibles vecinos para una racha también quedan dentro del rango.
    const mine = userReservationsSince
      .all(userId, addDays(todayInMedellin(now), -1))
      .map((r) => ({ courtId: r.court_id, date: r.date, startHour: r.start_hour }));

    // Dos comprobaciones complementarias del FR-019 (ver research.md R5):
    // - checkActiveRule: cuántas reservas activas hay y si el bloque es contiguo. Con 2
    //   activas responde MAX_CONSECUTIVE_REACHED aunque el bloque nuevo no sea contiguo
    //   (escenario US2-8), algo que la racha sola no detectaría.
    // - consecutiveRunLength: incluye reservas ya finalizadas, para impedir encadenar una
    //   tercera hora seguida cuando la primera ya terminó.
    const active = mine.filter((r) => slotEnd(r.date, r.startHour) > now);
    const ruleError = checkActiveRule(active, slot);
    if (ruleError) throw appError(ruleError);

    const sameCourt = mine.filter((r) => r.courtId === slot.courtId);
    if (consecutiveRunLength(sameCourt, slot) > 2) throw appError('MAX_CONSECUTIVE_REACHED');

    try {
      const { lastInsertRowid } = insert.run(userId, slot.courtId, slot.date, slot.startHour);
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

  return (userId, slot, now) => transaction.immediate(userId, slot, now);
}

type MyReservation = CreatedReservation & { cancellable: boolean };

/** Rutas de reservas, montadas en `/api/reservations`. */
export function reservationsRouter(db: Db, now: () => Date, auth: RequestHandler) {
  const router = Router();
  const courtExists = db.prepare<[number], unknown>('SELECT 1 FROM courts WHERE id = ?');
  const createReservation = makeCreateReservation(db);

  router.post('/', auth, (req, res) => {
    const slot = parseSlotInput(req.body);
    if (!slot) {
      // Una cancha entera pero inexistente es 404 aunque el resto venga mal formado.
      const courtId = (req.body as { courtId?: unknown } | undefined)?.courtId;
      if (Number.isInteger(courtId) && !courtExists.get(courtId as number)) return sendError(res, 'COURT_NOT_FOUND');
      return sendError(res, 'INVALID_SLOT');
    }
    const reservation = createReservation(res.locals.userId, slot, now());
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
    const upcoming: MyReservation[] = [];
    const history: MyReservation[] = [];
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
