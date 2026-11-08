// Hilo de la prueba multiconexión (SC-003). Cada hilo usa su propia conexión SQLite.
import { parentPort, workerData } from 'node:worker_threads';
import { openDb } from '../src/db.js';
import { isAppError } from '../src/errors.js';
import { makeCreateReservation } from '../src/reservations.js';

type Data = {
  dbPath: string;
  userId: number;
  slot: { courtId: number; date: string; startHour: number };
  nowIso: string;
  barrier: SharedArrayBuffer;
};

const { dbPath, userId, slot, nowIso, barrier } = workerData as Data;
const db = openDb(dbPath, { init: false });
const createReservation = makeCreateReservation(db);
const gate = new Int32Array(barrier);

// Espera a que el hilo principal libere la barrera para arrancar todos a la vez.
Atomics.wait(gate, 0, 0);

try {
  createReservation(userId, slot, new Date(nowIso));
  parentPort!.postMessage({ ok: true });
} catch (err) {
  parentPort!.postMessage(
    isAppError(err) ? { ok: false, code: err.code } : { ok: false, code: 'UNEXPECTED', message: String(err) },
  );
} finally {
  db.close();
}
