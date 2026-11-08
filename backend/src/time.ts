// Funciones puras de tiempo. Medellín es UTC−5 fijo, sin horario de verano.
// Ver specs/001-padel-court-booking/research.md (R4).

const MEDELLIN_OFFSET_HOURS = 5;
const HOUR_MS = 60 * 60 * 1000;
const BOOKING_WINDOW_DAYS = 14;

const medellinDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Fecha de hoy en Medellín como `YYYY-MM-DD`. */
export function todayInMedellin(now: Date): string {
  return medellinDateFormat.format(now);
}

/** `true` si `s` tiene formato `YYYY-MM-DD` y es una fecha real. */
export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Suma `n` días a una fecha `YYYY-MM-DD`. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Instante absoluto en que empieza el bloque (`date` y `startHour` en hora de Medellín). */
export function slotStart(date: string, startHour: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, startHour + MEDELLIN_OFFSET_HOURS));
}

/** Instante absoluto en que termina el bloque (inicio + 1 h). */
export function slotEnd(date: string, startHour: number): Date {
  return new Date(slotStart(date, startHour).getTime() + HOUR_MS);
}

/** Ventana de reserva: hoy y los 13 días siguientes (FR-010). */
export function bookingWindow(now: Date): { from: string; to: string } {
  const from = todayInMedellin(now);
  return { from, to: addDays(from, BOOKING_WINDOW_DAYS - 1) };
}

export function isWithinWindow(date: string, now: Date): boolean {
  const { from, to } = bookingWindow(now);
  return date >= from && date <= to;
}

/** `14` → `"14:00"`; `24` → `"24:00"` (solo como fin del último bloque). */
export function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

/** `14` → `"14:00–15:00"`; `23` → `"23:00–24:00"`. */
export function slotLabel(h: number): string {
  return `${formatHour(h)}–${formatHour(h + 1)}`;
}
