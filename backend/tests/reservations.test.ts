import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createUserWithSession, insertReservation, makeTestApp } from './helpers.js';

// 2026-11-07 14:20 en Medellín.
const NOW = '2026-11-07T19:20:00Z';
const TODAY = '2026-11-07';
const TOMORROW = '2026-11-08';

function setup() {
  const ctx = makeTestApp(NOW);
  const ana = createUserWithSession(ctx.db, 'ana@example.com', new Date(NOW));
  const beto = createUserWithSession(ctx.db, 'beto@example.com', new Date(NOW));
  const book = (cookie: string, body: object) => request(ctx.app).post('/api/reservations').set('Cookie', cookie).send(body);
  return { ...ctx, ana, beto, book };
}

describe('POST /api/reservations', () => {
  it('exige sesión y no inserta nada sin ella', async () => {
    const { app, db } = makeTestApp(NOW);
    const res = await request(app).post('/api/reservations').send({ courtId: 1, date: TOMORROW, startHour: 10 });
    expect(res.status).toBe(401);
    expect(db.prepare('SELECT COUNT(*) AS n FROM reservations').get()).toEqual({ n: 0 });
  });

  it('crea la reserva y la devuelve con cancha, fecha y hora (FR-020)', async () => {
    const { book, ana, app } = setup();
    const res = await book(ana.cookie, { courtId: 3, date: TOMORROW, startHour: 14 });
    expect(res.status).toBe(201);
    expect(res.body.reservation).toEqual({
      id: expect.any(Number),
      court: { id: 3, name: 'Cancha Belén' },
      date: TOMORROW,
      startTime: '14:00',
      endTime: '15:00',
    });
    const grid = await request(app).get(`/api/courts/3/availability?date=${TOMORROW}`).set('Cookie', ana.cookie);
    expect(grid.body.slots[14].status).toBe('reserved');
  });

  it('rechaza bloques parciales o inválidos', async () => {
    const { book, ana } = setup();
    for (const startHour of [10.5, 24, -1, '10']) {
      const res = await book(ana.cookie, { courtId: 1, date: TOMORROW, startHour });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_SLOT');
    }
    const court = await book(ana.cookie, { courtId: 9, date: TOMORROW, startHour: 10 });
    expect(court.status).toBe(404);
    expect(court.body.error.code).toBe('COURT_NOT_FOUND');
  });

  it('rechaza fechas pasadas y bloques ya iniciados (FR-018)', async () => {
    const { book, ana } = setup();
    const past = await book(ana.cookie, { courtId: 1, date: '2026-11-06', startHour: 20 });
    expect(past.status).toBe(400);
    expect(past.body.error.code).toBe('SLOT_IN_PAST');
    const inProgress = await book(ana.cookie, { courtId: 1, date: TODAY, startHour: 14 });
    expect(inProgress.status).toBe(400);
    expect(inProgress.body.error).toEqual({ code: 'SLOT_IN_PAST', message: 'No puedes reservar un horario que ya pasó.' });
  });

  it('aplica la ventana de 14 días', async () => {
    const { book, ana, beto } = setup();
    const outside = await book(ana.cookie, { courtId: 1, date: '2026-11-21', startHour: 10 });
    expect(outside.status).toBe(400);
    expect(outside.body.error).toEqual({
      code: 'OUTSIDE_BOOKING_WINDOW',
      message: 'Solo puedes reservar desde hoy y hasta 14 días en adelante',
    });
    expect((await book(beto.cookie, { courtId: 1, date: '2026-11-20', startHour: 10 })).status).toBe(201);
  });

  it('rechaza un bloque ya reservado (FR-016)', async () => {
    const { book, ana, beto } = setup();
    expect((await book(ana.cookie, { courtId: 3, date: TOMORROW, startHour: 14 })).status).toBe(201);
    const res = await book(beto.cookie, { courtId: 3, date: TOMORROW, startHour: 14 });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: 'SLOT_TAKEN', message: 'La cancha ya fue reservada en este horario' });
  });

  it('aplica la regla de una reserva activa con excepción contigua (US2-6, US2-7, US2-8)', async () => {
    const { book, ana } = setup();
    expect((await book(ana.cookie, { courtId: 3, date: TOMORROW, startHour: 14 })).status).toBe(201);

    const otherCourt = await book(ana.cookie, { courtId: 1, date: TOMORROW, startHour: 18 });
    expect(otherCourt.status).toBe(409);
    expect(otherCourt.body.error).toEqual({
      code: 'ACTIVE_RESERVATION_EXISTS',
      message: 'Ya tienes una reserva activa. Solo puedes agregar la hora inmediatamente anterior o posterior en la misma cancha',
    });
    expect((await book(ana.cookie, { courtId: 3, date: TOMORROW, startHour: 17 })).body.error.code).toBe(
      'ACTIVE_RESERVATION_EXISTS',
    );

    expect((await book(ana.cookie, { courtId: 3, date: TOMORROW, startHour: 15 })).status).toBe(201);

    const third = await book(ana.cookie, { courtId: 3, date: TOMORROW, startHour: 16 });
    expect(third.status).toBe(409);
    expect(third.body.error).toEqual({ code: 'MAX_CONSECUTIVE_REACHED', message: 'Ya alcanzaste el máximo de 2 horas seguidas' });
  });

  it('si el bloque contiguo está ocupado por otro usuario responde con el mensaje de colisión', async () => {
    const { book, ana, beto } = setup();
    expect((await book(ana.cookie, { courtId: 3, date: TOMORROW, startHour: 14 })).status).toBe(201);
    expect((await book(beto.cookie, { courtId: 3, date: TOMORROW, startHour: 15 })).status).toBe(201);
    const res = await book(ana.cookie, { courtId: 3, date: TOMORROW, startHour: 15 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_TAKEN');
  });

  it('una reserva en curso cuenta como activa; al terminar deja de contar', async () => {
    const { book, ana, db, setNow } = setup();
    insertReservation(db, { userId: ana.userId, courtId: 2, date: TODAY, startHour: 14 }); // en curso a las 14:20
    expect((await book(ana.cookie, { courtId: 1, date: TOMORROW, startHour: 10 })).body.error.code).toBe(
      'ACTIVE_RESERVATION_EXISTS',
    );
    expect((await book(ana.cookie, { courtId: 2, date: TODAY, startHour: 15 })).status).toBe(201);
    setNow('2026-11-07T21:00:00Z'); // 16:00: ambas terminaron
    expect((await book(ana.cookie, { courtId: 1, date: TOMORROW, startHour: 10 })).status).toBe(201);
  });
});

describe('máximo de 2 horas seguidas aunque una ya haya terminado (FR-019)', () => {
  it('no permite encadenar una tercera hora consecutiva en la misma cancha', async () => {
    const { book, ana, db, setNow } = setup();
    insertReservation(db, { userId: ana.userId, courtId: 1, date: TOMORROW, startHour: 10 });
    insertReservation(db, { userId: ana.userId, courtId: 1, date: TOMORROW, startHour: 11 });
    setNow('2026-11-08T16:05:00Z'); // mañana 11:05: la de 10:00 ya terminó
    const res = await book(ana.cookie, { courtId: 1, date: TOMORROW, startHour: 12 });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: 'MAX_CONSECUTIVE_REACHED', message: 'Ya alcanzaste el máximo de 2 horas seguidas' });
  });

  it('sí permite reservar después si no se forman más de 2 horas seguidas', async () => {
    const { book, ana, db, setNow } = setup();
    insertReservation(db, { userId: ana.userId, courtId: 1, date: TOMORROW, startHour: 10 });
    setNow('2026-11-08T16:05:00Z'); // 11:05: la de 10:00 terminó y no hay activas
    expect((await book(ana.cookie, { courtId: 1, date: TOMORROW, startHour: 12 })).status).toBe(201);
    expect((await book(ana.cookie, { courtId: 1, date: TOMORROW, startHour: 13 })).status).toBe(201);
  });
});
