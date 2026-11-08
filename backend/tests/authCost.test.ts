import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Se envuelve `scrypt` para contar cuántos hashes calcula cada petición.
vi.mock('node:crypto', async (importActual) => {
  const actual = await importActual<typeof import('node:crypto')>();
  return { ...actual, scrypt: vi.fn(actual.scrypt) };
});

const crypto = await import('node:crypto');
const { makeTestApp } = await import('./helpers.js');
const scrypt = vi.mocked(crypto.scrypt);

const NOW = '2026-11-07T15:00:00Z';

beforeEach(() => {
  scrypt.mockClear();
});

describe('costo de hash en autenticación', () => {
  it('un registro con correo ya existente no calcula ningún hash', async () => {
    const { app } = makeTestApp(NOW);
    await request(app).post('/api/auth/register').send({ email: 'ana@example.com', password: 'secreta123' });
    expect(scrypt).toHaveBeenCalledTimes(1);

    scrypt.mockClear();
    const res = await request(app).post('/api/auth/register').send({ email: 'ANA@example.com', password: 'otraclave1' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
    expect(scrypt).not.toHaveBeenCalled();
  });

  it('crear la app no lanza cálculos de hash en segundo plano', () => {
    makeTestApp(NOW);
    makeTestApp(NOW);
    expect(scrypt).not.toHaveBeenCalled();
  });

  it('un login con correo inexistente justo tras arrancar cuesta un solo hash y responde 401', async () => {
    const { app } = makeTestApp(NOW);
    const res = await request(app).post('/api/auth/login').send({ email: 'nadie@example.com', password: 'secreta123' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(scrypt).toHaveBeenCalledTimes(1);
  });
});
