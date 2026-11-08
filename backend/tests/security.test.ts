import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createUserWithSession, makeTestApp } from './helpers.js';

const NOW = '2026-11-07T15:00:00Z';
const TOO_MANY = {
  code: 'TOO_MANY_ATTEMPTS',
  message: 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.',
};

async function setupWithAna() {
  const ctx = makeTestApp(NOW);
  await request(ctx.app).post('/api/auth/register').send({ email: 'ana@example.com', password: 'secreta123' });
  const login = (email: string, password: string) => request(ctx.app).post('/api/auth/login').send({ email, password });
  return { ...ctx, login };
}

function sidFrom(res: request.Response): string {
  const sid = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='));
  if (!sid) throw new Error('sin cookie sid');
  return sid;
}

describe('S1: límite de intentos de login (FR-028)', () => {
  it('tras 10 fallos con el mismo correo rechaza el siguiente con 429, aun con la contraseña correcta', async () => {
    const { login } = await setupWithAna();
    for (let i = 0; i < 10; i++) expect((await login('ana@example.com', 'incorrecta1')).status).toBe(401);
    const blocked = await login('ANA@example.com', 'secreta123');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toEqual(TOO_MANY);
  });

  it('pasada la ventana de 15 minutos se puede volver a iniciar sesión', async () => {
    const { login, setNow } = await setupWithAna();
    for (let i = 0; i < 10; i++) await login('ana@example.com', 'incorrecta1');
    expect((await login('ana@example.com', 'secreta123')).status).toBe(429);
    setNow('2026-11-07T15:15:01Z');
    expect((await login('ana@example.com', 'secreta123')).status).toBe(200);
  });

  it('un login exitoso reinicia el contador del correo', async () => {
    const { login } = await setupWithAna();
    for (let i = 0; i < 9; i++) await login('ana@example.com', 'incorrecta1');
    expect((await login('ana@example.com', 'secreta123')).status).toBe(200);
    for (let i = 0; i < 10; i++) expect((await login('ana@example.com', 'incorrecta1')).status).toBe(401);
    expect((await login('ana@example.com', 'incorrecta1')).status).toBe(429);
  });

  it('también limita a 50 fallos por dirección de origen, aunque cambie el correo', async () => {
    const { login } = await setupWithAna();
    const attempts = Array.from({ length: 50 }, (_, i) => login(`nadie${i}@example.com`, 'incorrecta1'));
    expect((await Promise.all(attempts)).every((r) => r.status === 401)).toBe(true);
    const blocked = await login('ana@example.com', 'secreta123');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_ATTEMPTS');
  });
});

describe('S2: cookie Secure por defecto', () => {
  afterEach(() => {
    delete process.env.COOKIE_SECURE;
  });

  it('la cookie de sesión lleva Secure salvo que COOKIE_SECURE=false', async () => {
    const { app } = makeTestApp(NOW);
    const secure = await request(app).post('/api/auth/register').send({ email: 'ana@example.com', password: 'secreta123' });
    expect(sidFrom(secure)).toMatch(/;\s*Secure/i);

    process.env.COOKIE_SECURE = 'false';
    const plain = await request(app).post('/api/auth/login').send({ email: 'ana@example.com', password: 'secreta123' });
    expect(sidFrom(plain)).not.toMatch(/;\s*Secure/i);
  });
});

describe('S3: cabeceras de seguridad', () => {
  it('todas las respuestas de la API incluyen las cabeceras', async () => {
    const { app } = makeTestApp(NOW);
    for (const res of [await request(app).get('/api/courts'), await request(app).get('/api/auth/me'), await request(app).get('/api/nada')]) {
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
      expect(res.headers['referrer-policy']).toBe('no-referrer');
    }
  });
});

describe('S4: higiene de sesiones', () => {
  it('al iniciar sesión se borran las sesiones vencidas', async () => {
    const { app, db, setNow } = makeTestApp(NOW);
    createUserWithSession(db, 'beto@example.com', new Date(NOW));
    createUserWithSession(db, 'carla@example.com', new Date(NOW));
    setNow('2026-11-15T15:00:00Z'); // 8 días después: ambas vencidas
    await request(app).post('/api/auth/register').send({ email: 'ana@example.com', password: 'secreta123' });
    const rows = db.prepare('SELECT expires_at FROM sessions').all() as { expires_at: string }[];
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].expires_at).getTime()).toBeGreaterThan(new Date('2026-11-15T15:00:00Z').getTime());
  });

  it('al iniciar sesión de nuevo, la sesión anterior del navegador deja de ser válida', async () => {
    const { app } = makeTestApp(NOW);
    const first = await request(app).post('/api/auth/register').send({ email: 'ana@example.com', password: 'secreta123' });
    const oldCookie = sidFrom(first).split(';')[0];
    const second = await request(app)
      .post('/api/auth/login')
      .set('Cookie', oldCookie)
      .send({ email: 'ana@example.com', password: 'secreta123' });
    const newCookie = sidFrom(second).split(';')[0];
    expect(newCookie).not.toBe(oldCookie);
    expect((await request(app).get('/api/auth/me').set('Cookie', oldCookie)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Cookie', newCookie)).status).toBe(200);
  });
});
