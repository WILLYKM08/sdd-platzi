import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, GENERIC_ERROR_MESSAGE } from '../src/api';

function mockFetch(impl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('convierte un error del backend en ApiError con su code y message', async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ error: { code: 'SLOT_TAKEN', message: 'La cancha ya fue reservada en este horario' } }), {
        status: 409,
      }),
    );
    await expect(apiFetch('/api/reservations', { method: 'POST' })).rejects.toEqual({
      status: 409,
      code: 'SLOT_TAKEN',
      message: 'La cancha ya fue reservada en este horario',
    });
  });

  it('usa el mensaje genérico ante un error de red', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(apiFetch('/api/courts')).rejects.toMatchObject({ code: 'INTERNAL_ERROR', message: GENERIC_ERROR_MESSAGE });
  });

  it('usa el mensaje genérico ante un 500 sin cuerpo', async () => {
    mockFetch(async () => new Response('Internal Server Error', { status: 500 }));
    await expect(apiFetch('/api/courts')).rejects.toMatchObject({ status: 500, message: GENERIC_ERROR_MESSAGE });
  });

  it('un 401 dispara auth:expired (salvo en el login)', async () => {
    const listener = vi.fn();
    window.addEventListener('auth:expired', listener);
    const unauthorized = () =>
      new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'x' } }), { status: 401 });

    mockFetch(async () => unauthorized());
    await expect(apiFetch('/api/reservations/me')).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledTimes(1);

    mockFetch(async () => unauthorized());
    await expect(apiFetch('/api/auth/login', { method: 'POST' })).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('auth:expired', listener);
  });

  it('devuelve undefined en un 204', async () => {
    mockFetch(async () => new Response(null, { status: 204 }));
    await expect(apiFetch('/api/reservations/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
