import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { M, agentFor, app, assign, bookAndPay, connect, disconnect, makeHotel, makeUser, request, resetDb } from './helpers.js';

beforeAll(connect);
afterAll(disconnect);
beforeEach(resetDb);

describe('role-based access control', () => {
  it('requires authentication for protected routes', async () => {
    for (const path of ['/api/bookings/mine', '/api/admin/users', '/api/operations/front-desk', '/api/manage/reservations']) {
      expect((await request(app).get(path)).status).toBe(401);
    }
  });

  it('keeps guests out of staff, manager and admin APIs', async () => {
    const agent = await agentFor(await makeUser('guest'));
    expect((await agent.get('/api/admin/users')).status).toBe(403);
    expect((await agent.get('/api/operations/front-desk')).status).toBe(403);
    expect((await agent.get('/api/manage/refunds')).status).toBe(403);
    expect((await agent.post('/api/hotels').send({})).status).toBe(403);
  });

  it('keeps staff out of admin and manager-only functions', async () => {
    const { hotel } = await makeHotel();
    const staff = await makeUser('staff');
    await assign(staff, hotel);
    const agent = await agentFor(staff);
    expect((await agent.get('/api/admin/users')).status).toBe(403);
    expect((await agent.get('/api/manage/refunds')).status).toBe(403);
    expect((await agent.patch(`/api/hotels/${hotel._id}`).send({ tagline: 'x' })).status).toBe(403);
    expect((await agent.get(`/api/operations/front-desk?hotel=${hotel._id}`)).status).toBe(200);
  });

  it('limits staff and managers to their assigned hotels', async () => {
    const { hotel: mine } = await makeHotel();
    const { hotel: other } = await makeHotel();
    const manager = await makeUser('manager');
    const staff = await makeUser('staff');
    await assign(manager, mine);
    await assign(staff, mine);
    const m = await agentFor(manager);
    const s = await agentFor(staff);
    expect((await m.patch(`/api/hotels/${mine._id}`).send({ tagline: 'Updated' })).status).toBe(200);
    expect((await m.patch(`/api/hotels/${other._id}`).send({ tagline: 'Hijack' })).status).toBe(403);
    expect((await m.get(`/api/manage/reservations?hotel=${other._id}`)).status).toBe(403);
    expect((await s.get(`/api/operations/front-desk?hotel=${other._id}`)).status).toBe(403);
    expect((await s.get(`/api/rooms?hotel=${other._id}`)).status).toBe(403);
  });

  it('does not let managers change hotel status or assign managers', async () => {
    const { hotel } = await makeHotel();
    const manager = await makeUser('manager');
    await assign(manager, hotel);
    const other = await makeUser('manager');
    const m = await agentFor(manager);
    expect((await m.patch(`/api/hotels/${hotel._id}`).send({ status: 'inactive' })).status).toBe(403);
    expect((await m.post('/api/manage/assignments').send({ hotel: String(hotel._id), email: other.email, role: 'manager' })).status).toBe(403);
  });

  it('hides other guests’ bookings (404, not 403)', async () => {
    const { category } = await makeHotel();
    const owner = await agentFor(await makeUser('guest'));
    const id = await bookAndPay(owner, category);
    const stranger = await agentFor(await makeUser('guest'));
    expect((await stranger.get(`/api/bookings/${id}`)).status).toBe(404);
    expect((await stranger.post(`/api/bookings/${id}/cancel`).send({})).status).toBe(404);
    expect((await stranger.get(`/api/bookings/${id}/invoice`)).status).toBe(404);
  });

  it('lets assigned hotel staff view, but not cancel, a guest booking', async () => {
    const { hotel, category } = await makeHotel();
    const staff = await makeUser('staff');
    await assign(staff, hotel);
    const id = await bookAndPay(await agentFor(await makeUser('guest')), category);
    const s = await agentFor(staff);
    expect((await s.get(`/api/bookings/${id}`)).status).toBe(200);
    expect((await s.post(`/api/bookings/${id}/cancel`).send({})).status).toBe(404);
  });

  it('prevents privilege escalation and self-demotion by admins', async () => {
    const admin = await makeUser('admin');
    const a = await agentFor(admin);
    const res = await a.patch(`/api/admin/users/${admin._id}`).send({ role: 'guest' });
    expect(res.status).toBe(422);
    const guest = await makeUser('guest');
    const g = await agentFor(guest);
    expect((await g.patch(`/api/admin/users/${guest._id}`).send({ role: 'admin' })).status).toBe(403);
  });

  it('logs role changes and revokes the promoted user’s old session', async () => {
    const admin = await makeUser('admin');
    const target = await makeUser('guest');
    const t = await agentFor(target);
    const a = await agentFor(admin);
    const res = await a.patch(`/api/admin/users/${target._id}`).send({ role: 'staff' });
    expect(res.status).toBe(200);
    expect((await t.get('/api/auth/me')).status).toBe(401);
    const log = await M.AuditLog.findOne({ action: 'user.role_change' });
    expect(log.details.before.role).toBe('guest');
    expect(log.details.after.role).toBe('staff');
  });

  it('returns 400 for malformed ids instead of crashing', async () => {
    const agent = await agentFor(await makeUser('guest'));
    const res = await agent.get('/api/bookings/not-an-id');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
