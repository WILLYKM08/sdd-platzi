import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { Db } from './db.js';
import { sendError } from './errors.js';
import { validateEmail, validatePassword } from './rules.js';

// Ver specs/001-padel-court-booking/research.md (R1, R2).

const SESSION_DAYS = 7;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = 'sid';
const SCRYPT_PARAMS: ScryptOptions = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;

/** scrypt asíncrono: el cálculo corre en el pool de libuv y no bloquea el servidor. */
function scryptAsync(password: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keyLength, SCRYPT_PARAMS, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
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

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
});

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_MS });
}

export function clearSessionCookie(res: Response): void {
  res.cookie(SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
}

/**
 * Lee la cookie `sid` de la cabecera `Cookie` (parseo manual, sin dependencias).
 * Un valor con codificación inválida se trata como ausente (→ 401, no 500).
 */
export function readSidCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === SESSION_COOKIE) {
      const value = part.slice(index + 1).trim();
      if (!value) return undefined;
      try {
        return decodeURIComponent(value);
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** Middleware: exige una sesión válida (Principio III). Deja `userId` y `tokenHash` en `res.locals`. */
export function requireAuth(db: Db, now: () => Date): RequestHandler {
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

/** Envuelve un handler asíncrono para que Express 4 reciba sus errores. */
function asyncHandler(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

type UserRow = { id: number; email: string; password_hash: string };

/** Rutas de autenticación, montadas en `/api/auth`. */
export function authRouter(db: Db, now: () => Date, auth: RequestHandler) {
  const router = Router();
  const insertUser = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
  const findUserByEmail = db.prepare<[string], UserRow>('SELECT id, email, password_hash FROM users WHERE email = ?');
  const findUserById = db.prepare<[number], { id: number; email: string }>('SELECT id, email FROM users WHERE id = ?');
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?');

  // Hash ficticio calculado al arrancar: un login con correo inexistente cuesta lo
  // mismo que uno con contraseña errónea, también la primera vez (FR-005).
  const dummyHash = hashPassword(randomBytes(16).toString('hex'));
  dummyHash.catch(() => undefined);

  router.post(
    '/register',
    asyncHandler(async (req, res) => {
      const email = validateEmail(req.body?.email);
      if (!email) return sendError(res, 'INVALID_EMAIL');
      const passwordError = validatePassword(req.body?.password);
      if (passwordError) return sendError(res, passwordError);

      const passwordHash = await hashPassword(req.body.password);
      let userId: number;
      try {
        userId = Number(insertUser.run(email, passwordHash).lastInsertRowid);
      } catch (err) {
        if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') return sendError(res, 'EMAIL_TAKEN');
        throw err;
      }
      setSessionCookie(res, createSession(db, userId, now()));
      res.status(201).json({ user: { id: userId, email } });
    }),
  );

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const { email, password } = req.body ?? {};
      if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
        return sendError(res, 'INVALID_REQUEST');
      }
      const user = findUserByEmail.get(email.trim().toLowerCase());
      const valid = await verifyPassword(password, user ? user.password_hash : await dummyHash);
      if (!user || !valid) return sendError(res, 'INVALID_CREDENTIALS');
      setSessionCookie(res, createSession(db, user.id, now()));
      res.status(200).json({ user: { id: user.id, email: user.email } });
    }),
  );

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
