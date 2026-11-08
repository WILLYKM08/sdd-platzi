import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Db } from './db.js';
import { sendError } from './errors.js';
import { validateEmail, validatePassword } from './rules.js';

// Ver specs/001-padel-court-booking/research.md (R1, R2).

const SESSION_DAYS = 7;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = 'sid';
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, SCRYPT_PARAMS);
  return timingSafeEqual(actual, expected);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Crea una sesión de 7 días y devuelve el token en claro (solo va a la cookie). */
export function createSession(db: Db, userId: number, now: Date): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    userId,
    now.toISOString(),
    new Date(now.getTime() + SESSION_MS).toISOString(),
  );
  return token;
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MS,
    secure: process.env.NODE_ENV === 'production',
  });
}

export function clearSessionCookie(res: Response): void {
  res.cookie(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
  });
}

/** Lee la cookie `sid` de la cabecera `Cookie` (parseo manual, sin dependencias). */
export function readSidCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === SESSION_COOKIE) {
      const value = part.slice(index + 1).trim();
      return value ? decodeURIComponent(value) : undefined;
    }
  }
  return undefined;
}

/** Middleware: exige una sesión válida (Principio III). Deja `userId` y `tokenHash` en `res.locals`. */
export function requireAuth(db: Db, now: () => Date) {
  const findSession = db.prepare<[string], { user_id: number; expires_at: string }>(
    'SELECT user_id, expires_at FROM sessions WHERE token_hash = ?',
  );
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?');

  return (req: Request, res: Response, next: NextFunction): void => {
    const token = readSidCookie(req);
    if (!token) return sendError(res, 'UNAUTHENTICATED');
    const tokenHash = sha256(token);
    const session = findSession.get(tokenHash);
    if (!session) return sendError(res, 'UNAUTHENTICATED');
    if (new Date(session.expires_at).getTime() <= now().getTime()) {
      deleteSession.run(tokenHash);
      return sendError(res, 'UNAUTHENTICATED');
    }
    res.locals.userId = session.user_id;
    res.locals.tokenHash = tokenHash;
    next();
  };
}

// Hash ficticio para igualar el tiempo de respuesta cuando el correo no existe (FR-005).
let dummyHash: string | undefined;

type UserRow = { id: number; email: string; password_hash: string };

/** Rutas de autenticación, montadas en `/api/auth`. */
export function authRouter(db: Db, now: () => Date) {
  const router = Router();
  const auth = requireAuth(db, now);
  const insertUser = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
  const findUserByEmail = db.prepare<[string], UserRow>('SELECT id, email, password_hash FROM users WHERE email = ?');
  const findUserById = db.prepare<[number], { id: number; email: string }>('SELECT id, email FROM users WHERE id = ?');
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?');

  router.post('/register', (req, res) => {
    const email = validateEmail(req.body?.email);
    if (!email) return sendError(res, 'INVALID_EMAIL');
    const passwordError = validatePassword(req.body?.password);
    if (passwordError) return sendError(res, passwordError);

    let userId: number;
    try {
      userId = Number(insertUser.run(email, hashPassword(req.body.password)).lastInsertRowid);
    } catch (err) {
      if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') return sendError(res, 'EMAIL_TAKEN');
      throw err;
    }
    setSessionCookie(res, createSession(db, userId, now()));
    res.status(201).json({ user: { id: userId, email } });
  });

  router.post('/login', (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return sendError(res, 'INVALID_REQUEST');
    }
    const user = findUserByEmail.get(email.trim().toLowerCase());
    if (!user) {
      dummyHash ??= hashPassword('contraseña-ficticia');
      verifyPassword(password, dummyHash);
      return sendError(res, 'INVALID_CREDENTIALS');
    }
    if (!verifyPassword(password, user.password_hash)) return sendError(res, 'INVALID_CREDENTIALS');
    setSessionCookie(res, createSession(db, user.id, now()));
    res.status(200).json({ user: { id: user.id, email: user.email } });
  });

  router.post('/logout', auth, (_req, res) => {
    deleteSession.run(res.locals.tokenHash);
    clearSessionCookie(res);
    res.status(204).end();
  });

  router.get('/me', auth, (_req, res) => {
    const user = findUserById.get(res.locals.userId);
    if (!user) return sendError(res, 'UNAUTHENTICATED');
    res.json({ user });
  });

  return router;
}
