import express, { type NextFunction, type Request, type Response } from 'express';
import { authRouter } from './auth.js';
import { courtsRouter } from './courts.js';
import { reservationsRouter } from './reservations.js';
import type { Db } from './db.js';
import { isAppError, sendError } from './errors.js';

export type AppContext = { db: Db; now: () => Date };

export function createApp({ db, now }: AppContext) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/api/auth', authRouter(db, now));
  app.use('/api/courts', courtsRouter(db, now));
  app.use('/api/reservations', reservationsRouter(db, now));

  app.use('/api', (_req, res) => sendError(res, 'NOT_FOUND'));

  // Error handler final: nunca filtra detalles internos (Principio V).
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // Errores del parser JSON (mal formado, demasiado grande, etc.): petición inválida.
    const parserError = err as { type?: unknown; status?: unknown };
    if (typeof parserError?.type === 'string' && typeof parserError.status === 'number' && parserError.status < 500) {
      return sendError(res, 'INVALID_REQUEST');
    }
    if (isAppError(err)) {
      return sendError(res, err.code);
    }
    console.error(err);
    sendError(res, 'INTERNAL_ERROR');
  });

  return app;
}
