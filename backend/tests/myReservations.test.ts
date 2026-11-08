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
  return { ...ctx, ana, beto };
}

describe('GET /api/reservations/me', () => {
  it('exige sesión', async () => {
    const { app } = makeTestApp(NOW);
    expect((await request(app).get('/api/reservations/me')).status).toBe(401);
  });

  it('separa próximas e historial y solo incluye las propias', async () => {
    const { app, db, ana, beto } = setup();
    insertReservation(db, { userId: ana.userId, courtId: 3, date: TOMORROW, startHour: 15 });
    insertReservation(db, { userId: ana.userId, courtId: 3, date: TOMORROW, startHour: 14 });
    insertReservation(db, { userId: ana.userId, courtId: 1, date: '2026-11-01', startHour: 9 });
    insertReservation(db, { userId: ana.userId, courtId: 2, date: TODAY, startHour: 14 }); // en curso
    insertReservation(db, { userId: beto.userId, courtId: 5, date: TOMORROW, startHour: 8 });

    const res = await request(app).get('/api/reservations/me').set('Cookie', ana.cookie);
    expect(res.status).toBe(200);
    expect(res.body.upcoming).toEqual([
      { id: expect.any(Number), court: { id: 3, name: 'Cancha Belén' }, date: TOMORROW, startTime: '14:00', endTime: '15:00', cancellable: true },
      { id: expect.any(Number), court: { id: 3, name: 'Cancha Belén' }, date: TOMORROW, startTime: '15:00', endTime: '16:00', cancellable: true },
    ]);
    expect(res.body.history.map((r: { date: string; startTime: string; cancellable: boolean }) => [r.date, r.startTime, r.cancellable])).toEqual([
      [TODAY, '14:00', false],
      ['2026-11-01', '09:00', false],
    ]);
    expect(JSON.stringify(res.body)).not.toContain('Cancha Envigado');
  });

  it('usuario sin reservas recibe listas vacías', async () => {
    const { app, beto } = setup();
    const res = await request(app).get('/api/reservations/me').set('Cookie', beto.cookie);
    expect(res.body).toEqual({ upcoming: [], history: [] });
  });
});

describe('DELETE /api/reservations/:id', () => {
  it('cancela una reserva propia futura y libera el bloque para todos', async () => {
    const { app, db, ana, beto } = setup();
    const id = insertReservation(db, { userId: ana.userId, courtId: 3, date: TOMORROW, startHour: 14 });
    const res = await request(app).delete(`/api/reservations/${id}`).set('Cookie', ana.cookie);
    expect(res.status).toBe(204);
    const grid = await request(app).get(`/api/courts/3/availability?date=${TOMORROW}`).set('Cookie', beto.cookie);
    expect(grid.body.slots[14]).toMatchObject({ status: 'available', selectable: true });
  });

  it('una reserva ajena o inexistente responde 404 sin borrar nada', async () => {
    const { app, db, ana, beto } = setup();
    const id = insertReservation(db, { userId: beto.userId, courtId: 3, date: TOMORROW, startHour: 14 });
    for (const target of [id, 9999]) {
      const res = await request(app).delete(`/api/reservations/${target}`).set('Cookie', ana.cookie);
      expect(res.status).toBe(404);
      expect(res.body.error).toEqual({ code: 'RESERVATION_NOT_FOUND', message: 'No encontramos esa reserva.' });
    }
    expect(db.prepare('SELECT COUNT(*) AS n FROM reservations').get()).toEqual({ n: 1 });
  });

  it('no permite cancelar una reserva ya iniciada', async () => {
    const { app, db, ana } = setup();
    const id = insertReservation(db, { userId: ana.userId, courtId: 3, date: TODAY, startHour: 14 });
    const res = await request(app).delete(`/api/reservations/${id}`).set('Cookie', ana.cookie);
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: 'RESERVATION_STARTED', message: 'Esta reserva ya comenzó y no puede cancelarse' });
  });

  it('cancelar una de dos contiguas conserva la otra y permite volver a reservar la contigua', async () => {
    const { app, ana } = setup();
    const book = (startHour: number, courtId = 3) =>
      request(app).post('/api/reservations').set('Cookie', ana.cookie).send({ courtId, date: TOMORROW, startHour });
    expect((await book(14)).status).toBe(201);
    const second = await book(15);
    expect(second.status).toBe(201);

    expect((await request(app).delete(`/api/reservations/${second.body.reservation.id}`).set('Cookie', ana.cookie)).status).toBe(204);
    const mine = await request(app).get('/api/reservations/me').set('Cookie', ana.cookie);
    expect(mine.body.upcoming.map((r: { startTime: string }) => r.startTime)).toEqual(['14:00']);
    expect((await book(13)).status).toBe(201);
  });

  it('tras cancelar la reserva activa se puede reservar en otra cancha', async () => {
    const { app, ana } = setup();
    const first = await request(app).post('/api/reservations').set('Cookie', ana.cookie).send({ courtId: 3, date: TOMORROW, startHour: 14 });
    await request(app).delete(`/api/reservations/${first.body.reservation.id}`).set('Cookie', ana.cookie);
    const other = await request(app).post('/api/reservations').set('Cookie', ana.cookie).send({ courtId: 1, date: TOMORROW, startHour: 18 });
    expect(other.status).toBe(201);
  });
});
