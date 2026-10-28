import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { M, agentFor, app, assign, bookAndPay, bookingBody, connect, disconnect, makeHotel, makeUser, request, resetDb } from './helpers.js';

beforeAll(connect);
afterAll(disconnect);
beforeEach(resetDb);

async function scenario({ inOffset = 0, outOffset = 2 } = {}) {
  const { hotel, category, rooms } = await makeHotel({ rooms: 2 });
  const staffUser = await makeUser('staff');
  await assign(staffUser, hotel);
  const guestUser = await makeUser('guest');
  const guest = await agentFor(guestUser);
  const bookingId = await bookAndPay(guest, category, inOffset, outOffset);
  return { hotel, category, rooms, staff: await agentFor(staffUser), guest, bookingId };
}

describe('front desk', () => {
  it('lists today’s arrivals and checks a guest in and out', async () => {
    const { hotel, staff, bookingId } = await scenario();
    const desk = await staff.get(`/api/operations/front-desk?hotel=${hotel._id}`);
    expect(desk.body.data.arrivals.map((b) => b._id)).toContain(bookingId);

    const ci = await staff.post(`/api/operations/bookings/${bookingId}/check-in`).send({});
    expect(ci.status).toBe(200);
    expect(ci.body.data.status).toBe('checked_in');
    const booking = await M.Booking.findById(bookingId);
    expect((await M.Room.findById(booking.room)).status).toBe('occupied');

    const co = await staff.post(`/api/operations/bookings/${bookingId}/check-out`);
    expect(co.status).toBe(200);
    expect(co.body.data.status).toBe('checked_out');
    expect((await M.Room.findById(booking.room)).status).toBe('cleaning');
    const task = await M.HousekeepingTask.findOne({ booking: bookingId });
    expect(task.type).toBe('checkout_clean');

    const done = await staff.patch(`/api/operations/housekeeping/${task._id}`).send({ status: 'done' });
    expect(done.status).toBe(200);
    expect((await M.Room.findById(booking.room)).status).toBe('available');
  });

  it('refuses check-in before the arrival date', async () => {
    const { staff, bookingId } = await scenario({ inOffset: 3, outOffset: 5 });
    const res = await staff.post(`/api/operations/bookings/${bookingId}/check-in`).send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TOO_EARLY');
  });

  it('refuses check-in for unpaid bookings', async () => {
    const { hotel, category } = await makeHotel();
    const s = await makeUser('staff');
    await assign(s, hotel);
    const guest = await agentFor(await makeUser());
    const b = await guest.post('/api/bookings').send(bookingBody(category, 0, 1));
    expect(b.status).toBe(201);
    const res = await (await agentFor(s)).post(`/api/operations/bookings/${b.body.data._id}/check-in`).send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_TRANSITION'); // unpaid bookings stay pending
  });

  it('lets a guest raise a service request that staff can resolve', async () => {
    const { staff, guest, bookingId } = await scenario();
    const sr = await guest.post('/api/service-requests').send({ bookingId, type: 'housekeeping', description: 'Extra towels please' });
    expect(sr.status).toBe(201);
    const list = await staff.get('/api/operations/service-requests?status=open');
    expect(list.body.data).toHaveLength(1);
    const upd = await staff.patch(`/api/operations/service-requests/${sr.body.data._id}`).send({ status: 'resolved', staffNote: 'Delivered' });
    expect(upd.status).toBe(200);
    expect(upd.body.data.status).toBe('resolved');
    const notes = await M.Notification.find({ type: 'service_request_update' });
    expect(notes).toHaveLength(1);
  });

  it('does not let a guest raise requests on someone else’s booking', async () => {
    const { bookingId } = await scenario();
    const other = await agentFor(await makeUser());
    const res = await other.post('/api/service-requests').send({ bookingId, type: 'other', description: 'Let me in please' });
    expect(res.status).toBe(404);
  });
});

describe('dashboards use stored data', () => {
  it('computes manager analytics from bookings and payments', async () => {
    const { hotel } = await scenario({ inOffset: 0, outOffset: 2 });
    const manager = await makeUser('manager');
    await assign(manager, hotel);
    const m = await agentFor(manager);
    const res = await m.get(`/api/manage/analytics?hotel=${hotel._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.revenue.paid).toBeGreaterThan(0);
    expect(res.body.data.revenue.testModeRevenue).toBe(res.body.data.revenue.paid);
    expect(res.body.data.occupancy.sellableRooms).toBe(2);
    expect(res.body.data.bookings.byStatus.confirmed).toBe(1);
  });
});

describe('API basics', () => {
  it('exposes a health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.db).toBe('connected');
  });

  it('returns JSON 404s for unknown routes and rejects malformed JSON', async () => {
    expect((await request(app).get('/api/nope')).status).toBe(404);
    const bad = await request(app).post('/api/auth/login').set('content-type', 'application/json').send('{"email":');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_JSON');
  });

  it('blocks cross-site state-changing requests', async () => {
    const res = await request(app).post('/api/auth/logout').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });
});
