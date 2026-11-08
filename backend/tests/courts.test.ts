import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createUserWithSession, insertReservation, makeTestApp } from './helpers.js';

// 2026-11-07 14:20 en Medellín.
const NOW = '2026-11-07T19:20:00Z';
const TODAY = '2026-11-07';
const TOMORROW = '2026-11-08';

describe('GET /api/courts', () => {
  it('es público y devuelve exactamente las 5 canchas', async () => {
    const { app } = makeTestApp(NOW);
    const res = await request(app).get('/api/courts');
    expect(res.status).toBe(200);
    expect(res.body.courts).toEqual([
      { id: 1, name: 'Cancha Laureles' },
      { id: 2, name: 'Cancha El Poblado' },
      { id: 3, name: 'Cancha Belén' },
      { id: 4, name: 'Cancha Robledo' },
      { id: 5, name: 'Cancha Envigado' },
    ]);
  });

  it('no permite crear ni eliminar canchas (FR-009)', async () => {
    const { app, db } = makeTestApp(NOW);
    const { cookie } = createUserWithSession(db, 'ana@example.com', new Date(NOW));
    expect((await request(app).post('/api/courts').set('Cookie', cookie).send({ name: 'Nueva' })).status).toBe(404);
    expect((await request(app).delete('/api/courts/1').set('Cookie', cookie)).status).toBe(404);
    expect((await request(app).put('/api/courts/1').set('Cookie', cookie).send({ name: 'X' })).status).toBe(404);
  });
});

describe('GET /api/courts/:courtId/availability', () => {
  it('exige sesión', async () => {
    const { app } = makeTestApp(NOW);
    const res = await request(app).get(`/api/courts/1/availability?date=${TOMORROW}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('valida cancha y fecha', async () => {
    const { app, db } = makeTestApp(NOW);
    const { cookie } = createUserWithSession(db, 'ana@example.com', new Date(NOW));
    const court = await request(app).get(`/api/courts/9/availability?date=${TOMORROW}`).set('Cookie', cookie);
    expect(court.status).toBe(404);
    expect(court.body.error.code).toBe('COURT_NOT_FOUND');
    for (const query of ['', '?date=2026-02-30', '?date=mañana']) {
      const res = await request(app).get(`/api/courts/1/availability${query}`).set('Cookie', cookie);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_DATE');
    }
  });

  it('devuelve 24 bloques con etiquetas en formato 24 h y la ventana de reserva', async () => {
    const { app, db } = makeTestApp(NOW);
    const { cookie } = createUserWithSession(db, 'ana@example.com', new Date(NOW));
    const res = await request(app).get(`/api/courts/3/availability?date=${TOMORROW}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.court).toEqual({ id: 3, name: 'Cancha Belén' });
    expect(res.body.date).toBe(TOMORROW);
    expect(res.body.bookingWindow).toEqual({ from: TODAY, to: '2026-11-20' });
    expect(res.body.slots).toHaveLength(24);
    expect(res.body.slots.map((s: { startHour: number }) => s.startHour)).toEqual([...Array(24).keys()]);
    expect(res.body.slots[0]).toEqual({ startHour: 0, label: '00:00–01:00', status: 'available', selectable: true });
    expect(res.body.slots[23].label).toBe('23:00–24:00');
  });

  it('marca como no seleccionables los bloques cuyo inicio ya pasó', async () => {
    const { app, db } = makeTestApp(NOW);
    const { cookie } = createUserWithSession(db, 'ana@example.com', new Date(NOW));
    const res = await request(app).get(`/api/courts/1/availability?date=${TODAY}`).set('Cookie', cookie);
    const selectable = res.body.slots.map((s: { selectable: boolean }) => s.selectable);
    expect(selectable.slice(0, 15).every((v: boolean) => v === false)).toBe(true); // 00:00..14:00
    expect(selectable.slice(15).every((v: boolean) => v === true)).toBe(true); // 15:00..23:00
  });

  it('muestra los bloques reservados sin revelar al titular (FR-013)', async () => {
    const { app, db } = makeTestApp(NOW);
    const ana = createUserWithSession(db, 'ana@example.com', new Date(NOW));
    const beto = createUserWithSession(db, 'beto@example.com', new Date(NOW));
    insertReservation(db, { userId: ana.userId, courtId: 3, date: TOMORROW, startHour: 14 });
    const res = await request(app).get(`/api/courts/3/availability?date=${TOMORROW}`).set('Cookie', beto.cookie);
    expect(res.body.slots[14]).toEqual({ startHour: 14, label: '14:00–15:00', status: 'reserved', selectable: false });
    expect(JSON.stringify(res.body)).not.toMatch(/user|ana@|email/i);
  });

  it('una fecha válida fuera de la ventana responde 200 sin bloques seleccionables', async () => {
    const { app, db } = makeTestApp(NOW);
    const { cookie } = createUserWithSession(db, 'ana@example.com', new Date(NOW));
    const res = await request(app).get('/api/courts/1/availability?date=2026-11-21').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.slots.every((s: { selectable: boolean }) => !s.selectable)).toBe(true);
  });
});

describe('rendimiento (SC-005)', () => {
  it('la grilla responde en < 200 ms con la ventana llena de reservas', async () => {
    const { app, db } = makeTestApp(NOW);
    const { userId, cookie } = createUserWithSession(db, 'carga@example.com', new Date(NOW));
    const insert = db.prepare('INSERT INTO reservations (user_id, court_id, date, start_hour) VALUES (?, ?, ?, ?)');
    db.transaction(() => {
      for (let court = 1; court <= 5; court++)
        for (let day = 0; day < 14; day++)
          for (let hour = 0; hour < 20; hour++) {
            const date = `2026-11-${String(7 + day).padStart(2, '0')}`;
            insert.run(userId, court, date, hour);
          }
    })();
    await request(app).get(`/api/courts/3/availability?date=${TOMORROW}`).set('Cookie', cookie); // calentamiento
    const start = performance.now();
    const res = await request(app).get(`/api/courts/3/availability?date=${TOMORROW}`).set('Cookie', cookie);
    const elapsed = performance.now() - start;
    expect(res.status).toBe(200);
    expect(res.body.slots.filter((s: { status: string }) => s.status === 'reserved')).toHaveLength(20);
    expect(elapsed).toBeLessThan(200);
  });
});
