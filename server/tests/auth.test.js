import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import config from '../src/config/index.js';
import { M, PASSWORD, agentFor, app, connect, disconnect, lastEmailLink, makeUser, request, resetDb } from './helpers.js';

beforeAll(connect);
afterAll(disconnect);
beforeEach(resetDb);

const cookieName = config.cookie.name;

describe('registration', () => {
  it('rejects invalid input with field-level errors', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'A', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['body.name', 'body.email', 'body.password']));
  });

  it('requires a letter and a number in the password', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Asha', email: 'asha@test.example', password: 'onlyletters' });
    expect(res.status).toBe(400);
  });

  it('creates a guest, hashes the password, and never trusts a supplied role', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Asha Rao', email: 'Asha@Test.example', password: 'Secur3pass', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('guest');
    expect(res.body.data.user.passwordHash).toBeUndefined();
    const stored = await M.User.findOne({ email: 'asha@test.example' }).select('+passwordHash');
    expect(stored.role).toBe('guest');
    expect(stored.passwordHash).not.toBe('Secur3pass');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored.emailVerified).toBe(false);
  });

  it('rejects a duplicate email', async () => {
    await makeUser('guest', { email: 'dup@test.example' });
    const res = await request(app).post('/api/auth/register').send({ name: 'Dup', email: 'dup@test.example', password: 'Secur3pass' });
    expect(res.status).toBe(409);
  });
});

describe('login and sessions', () => {
  it('rejects wrong passwords with a generic message', async () => {
    const u = await makeUser();
    const res = await request(app).post('/api/auth/login').send({ email: u.email, password: 'Wrong-pass-1' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Incorrect email or password');
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@test.example', password: 'Wrong-pass-1' });
    expect(unknown.body.error.message).toBe('Incorrect email or password');
    expect(await M.AuditLog.countDocuments({ action: 'auth.login_failed' })).toBe(2);
  });

  it('rejects malformed login bodies, including operator injection', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: { $ne: null }, password: 'x' });
    expect(res.status).toBe(400);
  });

  it('sets an httpOnly session cookie and resolves /me', async () => {
    const u = await makeUser();
    const res = await request(app).post('/api/auth/login').send({ email: u.email, password: PASSWORD });
    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith(`${cookieName}=`));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie.split(';')[0]);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(u.email);
  });

  it('rejects missing, tampered, foreign-signed and expired tokens', async () => {
    const u = await makeUser();
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    const forged = jwt.sign({ sub: String(u._id), v: 0 }, 'some-other-secret-that-is-long-enough-123');
    expect((await request(app).get('/api/auth/me').set('Cookie', `${cookieName}=${forged}`)).status).toBe(401);
    const expired = jwt.sign({ sub: String(u._id), v: 0, exp: Math.floor(Date.now() / 1000) - 10 }, config.jwt.secret);
    expect((await request(app).get('/api/auth/me').set('Cookie', `${cookieName}=${expired}`)).status).toBe(401);
    const valid = jwt.sign({ sub: String(u._id), v: 0 }, config.jwt.secret);
    expect((await request(app).get('/api/auth/me').set('Cookie', `${cookieName}=${valid}x`)).status).toBe(401);
    const none = jwt.sign({ sub: String(u._id), v: 0 }, '', { algorithm: 'none' });
    expect((await request(app).get('/api/auth/me').set('Cookie', `${cookieName}=${none}`)).status).toBe(401);
  });

  it('revokes other sessions after a password change', async () => {
    const u = await makeUser();
    const a1 = await agentFor(u);
    const a2 = await agentFor(u);
    const res = await a1.post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'N3w-password' });
    expect(res.status).toBe(200);
    expect((await a1.get('/api/auth/me')).status).toBe(200); // this session was re-issued
    expect((await a2.get('/api/auth/me')).status).toBe(401); // the other one is revoked
  });

  it('blocks suspended accounts', async () => {
    const u = await makeUser('guest', { status: 'suspended' });
    const res = await request(app).post('/api/auth/login').send({ email: u.email, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
});

describe('email verification and password reset', () => {
  it('verifies an email with the emailed one-time token', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ name: 'Ira Sen', email: 'ira@test.example', password: 'Secur3pass' });
    const token = lastEmailLink('ira@test.example', 'verify-email');
    expect(token).toBeTruthy();
    expect((await request(app).post('/api/auth/verify-email').send({ token: 'x'.repeat(43) })).status).toBe(400);
    const ok = await request(app).post('/api/auth/verify-email').send({ token });
    expect(ok.status).toBe(200);
    expect((await M.User.findOne({ email: 'ira@test.example' })).emailVerified).toBe(true);
    // Single use.
    expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(400);
  });

  it('resets a password with an expiring token and does not reveal unknown emails', async () => {
    const u = await makeUser();
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@test.example' });
    const known = await request(app).post('/api/auth/forgot-password').send({ email: u.email });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    const token = lastEmailLink(u.email, 'reset-password');
    const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'Brand-new-9' });
    expect(res.status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: 'Brand-new-9' })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: PASSWORD })).status).toBe(401);
  });

  it('rejects an expired reset token', async () => {
    const u = await makeUser();
    await request(app).post('/api/auth/forgot-password').send({ email: u.email });
    const token = lastEmailLink(u.email, 'reset-password');
    await M.User.updateOne({ _id: u._id }, { resetTokenExpires: new Date(Date.now() - 1000) });
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'Brand-new-9' })).status).toBe(400);
  });
});

describe('profile', () => {
  it('cannot be used to change role or email', async () => {
    const u = await makeUser();
    const agent = await agentFor(u);
    const res = await agent.patch('/api/auth/profile').send({ name: 'New Name', role: 'admin' });
    expect(res.status).toBe(400);
    const ok = await agent.patch('/api/auth/profile').send({ name: 'New Name', address: { city: 'Pune' } });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.name).toBe('New Name');
    expect((await M.User.findById(u._id)).role).toBe('guest');
  });
});
