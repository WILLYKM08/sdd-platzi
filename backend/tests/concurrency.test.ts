import request from 'supertest';
import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { createUserWithSession, makeTestApp } from './helpers.js';

const NOW = '2026-11-07T19:20:00Z';
const SLOT = { courtId: 3, date: '2026-11-08', startHour: 20 };
const ATTEMPTS = 10;

function countRows(db: ReturnType<typeof openDb>) {
  return db
    .prepare('SELECT COUNT(*) AS n FROM reservations WHERE court_id = ? AND date = ? AND start_hour = ?')
    .get(SLOT.courtId, SLOT.date, SLOT.startHour);
}

describe('concurrencia (SC-003)', () => {
  it('(a) 10 peticiones HTTP simultáneas: exactamente 1 éxito', async () => {
    const { app, db } = makeTestApp(NOW);
    const users = Array.from({ length: ATTEMPTS }, (_, i) => createUserWithSession(db, `u${i}@example.com`, new Date(NOW)));
    const responses = await Promise.all(
      users.map((u) => request(app).post('/api/reservations').set('Cookie', u.cookie).send(SLOT)),
    );
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(ATTEMPTS - 1);
    expect(responses.filter((r) => r.status === 409).every((r) => r.body.error.code === 'SLOT_TAKEN')).toBe(true);
    expect(countRows(db)).toEqual({ n: 1 });
  });

  it('(b) 10 hilos con conexiones independientes: exactamente 1 éxito', async () => {
    const { db } = makeTestApp(NOW);
    const users = Array.from({ length: ATTEMPTS }, (_, i) => createUserWithSession(db, `w${i}@example.com`, new Date(NOW)));
    const barrier = new SharedArrayBuffer(4);
    const gate = new Int32Array(barrier);

    // En Node 22, `execArgv: ['--import', 'tsx']` no aplica el cargador dentro de worker_threads
    // (los imports `.js` no se resuelven a `.ts`). Se arranca cada hilo con un bootstrap que
    // carga el archivo TypeScript mediante la API programática de tsx.
    const workerUrl = new URL('./concurrencyWorker.ts', import.meta.url).href;
    const bootstrap = `import('tsx/esm/api').then(({ tsImport }) => tsImport(${JSON.stringify(workerUrl)}, ${JSON.stringify(workerUrl)}))`;
    const workers = users.map(
      (u) =>
        new Worker(bootstrap, {
          eval: true,
          workerData: { dbPath: db.name, userId: u.userId, slot: SLOT, nowIso: NOW, barrier },
        }),
    );
    const online = workers.map((w) => new Promise<void>((resolve) => w.once('online', () => resolve())));
    const results = workers.map(
      (w) =>
        new Promise<{ ok: boolean; code?: string; message?: string }>((resolve, reject) => {
          w.once('message', resolve);
          w.once('error', reject);
        }),
    );

    await Promise.all(online);
    // Pequeño margen para que todos los hilos alcancen Atomics.wait tras cargar sus módulos.
    await new Promise((r) => setTimeout(r, 500));
    Atomics.store(gate, 0, 1);
    Atomics.notify(gate, 0);

    const outcomes = await Promise.all(results);
    await Promise.all(workers.map((w) => w.terminate()));

    expect(outcomes.filter((o) => o.code === 'UNEXPECTED')).toEqual([]);
    expect(outcomes.filter((o) => o.ok)).toHaveLength(1);
    expect(outcomes.filter((o) => !o.ok && o.code === 'SLOT_TAKEN')).toHaveLength(ATTEMPTS - 1);
    expect(countRows(db)).toEqual({ n: 1 });
  }, 20000);

  it('(c) la restricción UNIQUE rechaza un INSERT directo duplicado', () => {
    const { db } = makeTestApp(NOW);
    const { userId } = createUserWithSession(db, 'ana@example.com', new Date(NOW));
    const insert = 'INSERT INTO reservations (user_id, court_id, date, start_hour) VALUES (?, ?, ?, ?)';
    db.prepare(insert).run(userId, SLOT.courtId, SLOT.date, SLOT.startHour);
    const second = openDb(db.name, { init: false });
    expect(() => second.prepare(insert).run(userId, SLOT.courtId, SLOT.date, SLOT.startHour)).toThrow(
      expect.objectContaining({ code: 'SQLITE_CONSTRAINT_UNIQUE' }),
    );
    second.close();
  });
});
