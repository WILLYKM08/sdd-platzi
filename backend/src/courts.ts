import { Router, type RequestHandler } from 'express';
import type { Db } from './db.js';
import { sendError } from './errors.js';
import { bookingWindow, isValidDate, isWithinWindow, slotLabel, slotStart } from './time.js';

type Court = { id: number; name: string };

/** Rutas de canchas, montadas en `/api/courts`. Catálogo de solo lectura (Principio I). */
export function courtsRouter(db: Db, now: () => Date, auth: RequestHandler) {
  const router = Router();
  const listCourts = db.prepare<[], Court>('SELECT id, name FROM courts ORDER BY id');
  const findCourt = db.prepare<[number], Court>('SELECT id, name FROM courts WHERE id = ?');
  // Solo la hora: la grilla nunca expone al titular (FR-013).
  const reservedHours = db.prepare<[number, string], { start_hour: number }>(
    'SELECT start_hour FROM reservations WHERE court_id = ? AND date = ?',
  );

  router.get('/', (_req, res) => {
    res.json({ courts: listCourts.all() });
  });

  router.get('/:courtId/availability', auth, (req, res) => {
    const courtId = Number(req.params.courtId);
    const court = Number.isInteger(courtId) ? findCourt.get(courtId) : undefined;
    if (!court) return sendError(res, 'COURT_NOT_FOUND');
    const date = req.query.date;
    if (!isValidDate(date)) return sendError(res, 'INVALID_DATE');

    const current = now();
    const inWindow = isWithinWindow(date, current);
    const reserved = new Set(reservedHours.all(court.id, date).map((r) => r.start_hour));
    const slots = Array.from({ length: 24 }, (_, startHour) => {
      const status = reserved.has(startHour) ? 'reserved' : 'available';
      return {
        startHour,
        label: slotLabel(startHour),
        status,
        selectable: status === 'available' && inWindow && slotStart(date, startHour) > current,
      };
    });

    res.json({ court, date, bookingWindow: bookingWindow(current), slots });
  });

  return router;
}
