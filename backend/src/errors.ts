import type { Response } from 'express';

// Catálogo de errores. Ver specs/001-padel-court-booking/contracts/api.md#catálogo-de-errores
export const ERRORS = {
  INVALID_REQUEST: { status: 400, message: 'La solicitud no es válida. Revisa los datos e inténtalo de nuevo.' },
  INVALID_EMAIL: { status: 400, message: 'Ingresa un correo electrónico válido.' },
  PASSWORD_TOO_SHORT: { status: 400, message: 'La contraseña debe tener al menos 8 caracteres.' },
  PASSWORD_TOO_LONG: { status: 400, message: 'La contraseña no puede tener más de 128 caracteres.' },
  INVALID_DATE: { status: 400, message: 'La fecha seleccionada no es válida.' },
  INVALID_SLOT: { status: 400, message: 'El horario seleccionado no es válido.' },
  SLOT_IN_PAST: { status: 400, message: 'No puedes reservar un horario que ya pasó.' },
  OUTSIDE_BOOKING_WINDOW: { status: 400, message: 'Solo puedes reservar desde hoy y hasta 14 días en adelante' },
  UNAUTHENTICATED: { status: 401, message: 'Tu sesión expiró o no has iniciado sesión. Inicia sesión para continuar.' },
  INVALID_CREDENTIALS: { status: 401, message: 'Correo o contraseña incorrectos' },
  COURT_NOT_FOUND: { status: 404, message: 'La cancha seleccionada no existe.' },
  RESERVATION_NOT_FOUND: { status: 404, message: 'No encontramos esa reserva.' },
  NOT_FOUND: { status: 404, message: 'El recurso solicitado no existe.' },
  EMAIL_TAKEN: { status: 409, message: 'Este correo ya está registrado' },
  SLOT_TAKEN: { status: 409, message: 'La cancha ya fue reservada en este horario' },
  ACTIVE_RESERVATION_EXISTS: {
    status: 409,
    message: 'Ya tienes una reserva activa. Solo puedes agregar la hora inmediatamente anterior o posterior en la misma cancha',
  },
  MAX_CONSECUTIVE_REACHED: { status: 409, message: 'Ya alcanzaste el máximo de 2 horas seguidas' },
  RESERVATION_STARTED: { status: 409, message: 'Esta reserva ya comenzó y no puede cancelarse' },
  TOO_MANY_ATTEMPTS: { status: 429, message: 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.' },
  INTERNAL_ERROR: { status: 500, message: 'Ocurrió un problema inesperado. Inténtalo de nuevo en unos minutos.' },
} as const;

export type ErrorCode = keyof typeof ERRORS;

export type AppError = Error & { code: ErrorCode };

/** Crea un error de negocio para lanzar (p. ej. dentro de una transacción). */
export function appError(code: ErrorCode): AppError {
  return Object.assign(new Error(code), { code });
}

export function isAppError(err: unknown): err is AppError {
  if (!(err instanceof Error)) return false;
  const code: unknown = (err as Error & { code?: unknown }).code;
  return typeof code === 'string' && code in ERRORS;
}

export function sendError(res: Response, code: ErrorCode): void {
  const { status, message } = ERRORS[code];
  res.status(status).json({ error: { code, message } });
}
