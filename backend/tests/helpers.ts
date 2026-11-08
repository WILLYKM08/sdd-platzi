import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { createSession, hashPassword } from '../src/auth.js';
import { openDb, type Db } from '../src/db.js';

/** Crea la app sobre una base temporal única, con un reloj controlable. */
export function makeTestApp(nowIso: string) {
  const db = openDb(join(tmpdir(), `padel-${randomUUID()}.test.db`));
  let current = new Date(nowIso);
  const now = () => current;
  const setNow = (iso: string) => {
    current = new Date(iso);
  };
  const app = createApp({ db, now });
  return { app, db, now, setNow };
}

// La contraseña se hashea una sola vez: scrypt es deliberadamente lento.
const PASSWORD_HASH = await hashPassword('secreta123');

/** Inserta un usuario con sesión y devuelve su id y la cabecera Cookie lista para usar. */
export function createUserWithSession(db: Db, email: string, now: Date) {
  const { lastInsertRowid } = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, PASSWORD_HASH);
  const userId = Number(lastInsertRowid);
  const token = createSession(db, userId, now);
  return { userId, cookie: `sid=${token}` };
}

export function insertReservation(
  db: Db,
  r: { userId: number; courtId: number; date: string; startHour: number },
): number {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO reservations (user_id, court_id, date, start_hour) VALUES (?, ?, ?, ?)')
    .run(r.userId, r.courtId, r.date, r.startHour);
  return Number(lastInsertRowid);
}
