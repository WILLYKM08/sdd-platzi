// Cliente HTTP único. Ver specs/001-padel-court-booking/contracts/api.md

export type User = { id: number; email: string };
export type Court = { id: number; name: string };
export type Slot = { startHour: number; label: string; status: 'available' | 'reserved'; selectable: boolean };
export type Availability = {
  court: Court;
  date: string;
  bookingWindow: { from: string; to: string };
  slots: Slot[];
};
export type Reservation = {
  id: number;
  court: Court;
  date: string;
  startTime: string;
  endTime: string;
  cancellable?: boolean;
};

export type ApiError = { status: number; code: string; message: string };

export const GENERIC_ERROR_MESSAGE = 'Ocurrió un problema inesperado. Inténtalo de nuevo en unos minutos.';

export function isApiError(err: unknown): err is ApiError {
  return typeof err === 'object' && err !== null && 'code' in err && 'message' in err && 'status' in err;
}

/** Mensaje en español apto para mostrar, sea cual sea el error. */
export function errorMessage(err: unknown): string {
  return isApiError(err) ? err.message : GENERIC_ERROR_MESSAGE;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw { status: 0, code: 'INTERNAL_ERROR', message: GENERIC_ERROR_MESSAGE } satisfies ApiError;
  }

  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  if (response.status === 401 && path !== '/api/auth/login') {
    window.dispatchEvent(new Event('auth:expired'));
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const error = (body as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
  if (error && typeof error.code === 'string' && typeof error.message === 'string') {
    throw { status: response.status, code: error.code, message: error.message } satisfies ApiError;
  }
  throw { status: response.status, code: 'INTERNAL_ERROR', message: GENERIC_ERROR_MESSAGE } satisfies ApiError;
}

/** `2026-11-08` → `domingo, 8 de noviembre de 2026`. */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Fecha de hoy en Medellín (`YYYY-MM-DD`); el backend sigue siendo la referencia. */
export function todayInMedellin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

export function getCourts() {
  return apiFetch<{ courts: Court[] }>('/api/courts');
}

export function getAvailability(courtId: number, date: string) {
  return apiFetch<Availability>(`/api/courts/${courtId}/availability?date=${encodeURIComponent(date)}`);
}

export function createReservation(slot: { courtId: number; date: string; startHour: number }) {
  return apiFetch<{ reservation: Reservation }>('/api/reservations', {
    method: 'POST',
    body: JSON.stringify(slot),
  });
}

export function getMyReservations() {
  return apiFetch<{ upcoming: Reservation[]; history: Reservation[] }>('/api/reservations/me');
}

export function cancelReservation(id: number) {
  return apiFetch<void>(`/api/reservations/${id}`, { method: 'DELETE' });
}

/** Ventana de reserva estimada en el navegador (hoy..hoy+13, Medellín) hasta recibir la del servidor. */
export function clientBookingWindow(): { from: string; to: string } {
  const from = todayInMedellin();
  const [y, m, d] = from.split('-').map(Number);
  const to = new Date(Date.UTC(y, m - 1, d + 13)).toISOString().slice(0, 10);
  return { from, to };
}
