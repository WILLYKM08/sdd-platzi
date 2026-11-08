import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers.js';

const NOW = '2026-11-07T15:00:00Z';

function sidFrom(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const sid = cookies.find((c) => c.startsWith('sid='));
  if (!sid) throw new Error('sin cookie sid');
  return sid.split(';')[0];
}

describe('POST /api/auth/register', () => {
  it('crea la cuenta, normaliza el correo e inicia sesión', async () => {
    const { app } = makeTestApp(NOW);
    const res = await request(app).post('/api/auth/register').send({ email: '  Ana@Example.com ', password: 'secreta123' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ user: { id: expect.any(Number), email: 'ana@example.com' } });
    const cookie = ([] as string[]).concat(res.headers['set-cookie']).find((c) => c.startsWith('sid='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    const me = await request(app).get('/api/auth/me').set('Cookie', sidFrom(res));
    expect(me.status).toBe(200);
  });

  it('rechaza un correo ya registrado sin distinguir mayúsculas', async () => {
    const { app } = makeTestApp(NOW);
    await request(app).post('/api/auth/register').send({ email: 'ana@example.com', password: 'secreta123' });
    const res = await request(app).post('/api/auth/register').send({ email: 'ANA@example.com', password: 'otraclave1' });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: 'EMAIL_TAKEN', message: 'Este correo ya está registrado' });
  });

  it('valida correo y contraseña', async () => {
    const { app } = makeTestApp(NOW);
    const bad = await request(app).post('/api/auth/register').send({ email: 'no-es-correo', password: 'secreta123' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_EMAIL');

    const short = await request(app).post('/api/auth/register').send({ email: 'ana@example.com', password: '1234567' });
    expect(short.status).toBe(400);
    expect(short.body.error.code).toBe('PASSWORD_TOO_SHORT');

    const long = await request(app)
      .post('/api/auth/register')
      .send({ email: 'ana@example.com', password: 'a'.repeat(129) });
    expect(long.status).toBe(400);
    expect(long.body.error.code).toBe('PASSWORD_TOO_LONG');
  });

  it('responde 400 ante JSON mal formado', async () => {
    const { app } = makeTestApp(NOW);
    const res = await request(app).post('/api/auth/register').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });
});

describe('POST /api/auth/login', () => {
  it('inicia sesión con credenciales correctas', async () => {
    const { app } = makeTestApp(NOW);
    await request(app).post('/api/auth/register').send({ email: 'ana@example.com', password: 'secreta123' });
    const res = await request(app).post('/api/auth/login').send({ email: 'ANA@example.com', password: 'secreta123' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('ana@example.com');
    const me = await request(app).get('/api/auth/me').set('Cookie', sidFrom(res));
    expect(me.status).toBe(200);
  });

  it('usa el mismo mensaje genérico para contraseña errónea y correo inexistente', async () => {
    const { app } = makeTestApp(NOW);
    await request(app).post('/api/auth/register').send({ email: 'ana@example.com', password: 'secreta123' });
    const wrong = await request(app).post('/api/auth/login').send({ email: 'ana@example.com', password: 'incorrecta' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nadie@example.com', password: 'secreta123' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Correo o contraseña incorrectos' });
  });

  it('responde 400 si faltan campos', async () => {
    const { app } = makeTestApp(NOW);
    const res = await request(app).post('/api/auth/login').send({ email: 'ana@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });
});

describe('sesión', () => {
  it('GET /api/auth/me sin cookie responde 401', async () => {
    const { app } = makeTestApp(NOW);
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('logout invalida la sesión', async () => {
    const { app } = makeTestApp(NOW);
    const reg = await request(app).post('/api/auth/register').send({ email: 'ana@example.com', password: 'secreta123' });
    const cookie = sidFrom(reg);
    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(204);
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(401);
  });

  it('la sesión expira a los 7 días', async () => {
    const { app, setNow } = makeTestApp(NOW);
    const reg = await request(app).post('/api/auth/register').send({ email: 'ana@example.com', password: 'secreta123' });
    const cookie = sidFrom(reg);
    setNow('2026-11-14T14:59:00Z');
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);
    setNow('2026-11-14T15:01:00Z');
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('cookie de sesión malformada', () => {
  it('responde 401 (no 500) ante un sid con codificación inválida', async () => {
    const { app } = makeTestApp(NOW);
    for (const cookie of ['sid=%E0%A4', 'sid=%', 'sid=abc%zz']) {
      const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });
});
