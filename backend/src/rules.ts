import { isValidDate, slotStart } from './time.js';

// Reglas de negocio y validaciones de entrada como funciones puras.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Devuelve el correo normalizado (trim + minúsculas) o `null` si no es válido (FR-002). */
export function validateEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) return null;
  return normalized;
}

/** Valida la longitud de la contraseña (FR-003). */
export function validatePassword(password: unknown): null | 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG' {
  if (typeof password !== 'string' || password.length < 8) return 'PASSWORD_TOO_SHORT';
  if (password.length > 128) return 'PASSWORD_TOO_LONG';
  return null;
}

export type SlotInput = { courtId: number; date: string; startHour: number };

/** Valida el cuerpo de `POST /api/reservations`: solo bloques enteros de 1 hora (FR-015). */
export function parseSlotInput(body: unknown): SlotInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const { courtId, date, startHour } = body as Record<string, unknown>;
  if (!Number.isInteger(courtId)) return null;
  if (!isValidDate(date)) return null;
  if (!Number.isInteger(startHour) || (startHour as number) < 0 || (startHour as number) > 23) return null;
  return { courtId: courtId as number, date, startHour: startHour as number };
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Regla de reserva activa (FR-019): máximo una, salvo un segundo bloque contiguo
 * (inmediatamente anterior o posterior) en la misma cancha. La contigüidad se
 * compara en instantes absolutos, por lo que cruza la medianoche.
 */
export function checkActiveRule(
  active: SlotInput[],
  candidate: SlotInput,
): null | 'ACTIVE_RESERVATION_EXISTS' | 'MAX_CONSECUTIVE_REACHED' {
  if (active.length === 0) return null;
  if (active.length >= 2) return 'MAX_CONSECUTIVE_REACHED';
  const [existing] = active;
  const gap = Math.abs(
    slotStart(candidate.date, candidate.startHour).getTime() - slotStart(existing.date, existing.startHour).getTime(),
  );
  if (existing.courtId === candidate.courtId && gap === HOUR_MS) return null;
  return 'ACTIVE_RESERVATION_EXISTS';
}
