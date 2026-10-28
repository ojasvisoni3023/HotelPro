import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import config from '../src/config/index.js';
import { refundQuote } from '../src/services/bookingService.js';
import { quoteStay } from '../src/services/pricingService.js';
import { addDays, parseDateOnly, todayInZone } from '../src/utils/dates.js';
import { M, agentFor, app, bookAndPay, bookingBody, connect, day, disconnect, makeHotel, makeUser, request, resetDb } from './helpers.js';

beforeAll(connect);
afterAll(disconnect);
beforeEach(resetDb);

describe('price calculation', () => {
  it('sums nightly rates, applies seasonal pricing and tax on the server', () => {
    const category = {
      basePrice: 4000,
      seasonalRates: [{ name: 'Festival', startDate: parseDateOnly('2027-01-02'), endDate: parseDateOnly('2027-01-02'), price: 6000 }],
    };
    const q = quoteStay(category, parseDateOnly('2027-01-01'), parseDateOnly('2027-01-04'), 12);
    expect(q.nights).toBe(3);
    expect(q.nightly.map((n) => n.rate)).toEqual([4000, 6000, 4000]);
    expect(q.subtotal).toBe(14000);
    expect(q.taxes).toBe(1680);
    expect(q.total).toBe(15680);
  });

  it('rounds tax to paise', () => {
    const q = quoteStay({ basePrice: 999.99, seasonalRates: [] }, parseDateOnly('2027-03-01'), parseDateOnly('2027-03-02'), 12);
    expect(q.taxes).toBe(120);
    expect(q.total).toBe(1119.99);
  });
});

describe('search and availability', () => {
  it('returns room types with live availability and server quotes', async () => {
    const { hotel } = await makeHotel({ rooms: 2, basePrice: 5000 });
    const res = await request(app).get(`/api/search?location=${encodeURIComponent('testpur')}&checkIn=${day(2)}&checkOut=${day(4)}&guests=2`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].hotel._id).toBe(String(hotel._id));
    expect(res.body.data[0].availableRooms).toBe(2);
    expect(res.body.data[0].quote.total).toBe(11200);
  });

  it('filters by capacity and price', async () => {
    await makeHotel({ rooms: 1, basePrice: 5000, maxGuests: 2 });
    expect((await request(app).get(`/api/search?guests=3`)).body.data).toHaveLength(0);
    expect((await request(app).get(`/api/search?maxPrice=4000`)).body.data).toHaveLength(0);
    expect((await request(app).get(`/api/search?minPrice=4000&maxPrice=6000`)).body.data).toHaveLength(1);
  });

  it('rejects invalid date ranges', async () => {
    expect((await request(app).get(`/api/search?checkIn=${day(5)}&checkOut=${day(3)}`)).status).toBe(400);
    expect((await request(app).get(`/api/search?checkIn=${day(-2)}&checkOut=${day(1)}`)).status).toBe(400);
    expect((await request(app).get(`/api/search?checkIn=2026-02-30&checkOut=2026-03-02`)).status).toBe(400);
    expect((await request(app).get(`/api/search?checkIn=${day(1)}`)).status).toBe(400);
  });
});

describe('booking creation', () => {
  it('creates a pending booking with a server-computed total and a payment hold', async () => {
    const { category } = await makeHotel({ basePrice: 5000 });
    const agent = await agentFor(await makeUser());
    const res = await agent.post('/api/bookings').send(bookingBody(category, 3, 5));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.pricing.total).toBe(11200);
    expect(res.body.data.confirmationCode).toMatch(/^HP-[A-Z0-9]{7}$/);
    expect(new Date(res.body.data.holdExpiresAt) > new Date()).toBe(true);
    expect(await M.RoomNight.countDocuments({ booking: res.body.data._id })).toBe(2);
  });

  it('ignores/rejects client-supplied prices and statuses', async () => {
    const { category } = await makeHotel();
    const agent = await agentFor(await makeUser());
    const res = await agent.post('/api/bookings').send({ ...bookingBody(category), total: 1, status: 'confirmed' });
    expect(res.status).toBe(400);
  });

  it('enforces capacity, date rules and email verification', async () => {
    const { category } = await makeHotel({ maxGuests: 2 });
    const agent = await agentFor(await makeUser());
    expect((await agent.post('/api/bookings').send(bookingBody(category, 3, 5, { guests: 3 }))).status).toBe(400);
    expect((await agent.post('/api/bookings').send(bookingBody(category, -1, 2))).status).toBe(400);
    expect((await agent.post('/api/bookings').send(bookingBody(category, 3, 3))).status).toBe(400);
    const unverified = await agentFor(await makeUser('guest', { emailVerified: false }));
    const res = await unverified.post('/api/bookings').send(bookingBody(category));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

describe('overlap prevention', () => {
  it('never sells the same room twice for overlapping nights', async () => {
    const { category } = await makeHotel({ rooms: 1 });
    const a = await agentFor(await makeUser());
    const b = await agentFor(await makeUser());
    expect((await a.post('/api/bookings').send(bookingBody(category, 3, 6))).status).toBe(201);
    const clash = await b.post('/api/bookings').send(bookingBody(category, 5, 7));
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('NO_AVAILABILITY');
  });

  it('allows back-to-back stays (check-out day = next check-in day)', async () => {
    const { category } = await makeHotel({ rooms: 1 });
    const a = await agentFor(await makeUser());
    expect((await a.post('/api/bookings').send(bookingBody(category, 3, 5))).status).toBe(201);
    expect((await a.post('/api/bookings').send(bookingBody(category, 5, 7))).status).toBe(201);
  });

  it('lets exactly one of many concurrent requests win the last room', async () => {
    const { category } = await makeHotel({ rooms: 1 });
    const agents = await Promise.all(Array.from({ length: 8 }, async () => agentFor(await makeUser())));
    const results = await Promise.all(agents.map((ag) => ag.post('/api/bookings').send(bookingBody(category, 10, 12))));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
    expect(await M.RoomNight.countDocuments()).toBe(2);
  });

  it('assigns different physical rooms when several are free', async () => {
    const { category } = await makeHotel({ rooms: 2 });
    const a = await agentFor(await makeUser());
    const r1 = await a.post('/api/bookings').send(bookingBody(category, 3, 5));
    const r2 = await a.post('/api/bookings').send(bookingBody(category, 3, 5));
    expect(r1.body.data.room).not.toBe(r2.body.data.room);
    expect((await a.post('/api/bookings').send(bookingBody(category, 3, 5))).status).toBe(409);
  });

  it('releases an expired payment hold so the room can be sold again', async () => {
    const { category } = await makeHotel({ rooms: 1 });
    const a = await agentFor(await makeUser());
    const first = await a.post('/api/bookings').send(bookingBody(category, 3, 5));
    await M.Booking.updateOne({ _id: first.body.data._id }, { holdExpiresAt: new Date(Date.now() - 1000) });
    await M.RoomNight.updateMany({ booking: first.body.data._id }, { expiresAt: new Date(Date.now() - 1000) });
    const second = await a.post('/api/bookings').send(bookingBody(category, 3, 5));
    expect(second.status).toBe(201);
    expect((await M.Booking.findById(first.body.data._id)).status).toBe('expired');
  });

  it('excludes rooms under maintenance from sale', async () => {
    const { category, rooms } = await makeHotel({ rooms: 1 });
    await M.Room.updateOne({ _id: rooms[0]._id }, { status: 'maintenance' });
    const a = await agentFor(await makeUser());
    expect((await a.post('/api/bookings').send(bookingBody(category))).status).toBe(409);
  });
});

describe('cancellation policy', () => {
  const hotel = { checkInTime: '14:00' };
  const settings = { freeCancellationHours: 48, lateCancellationRefundPercent: 50 };
  const T = todayInZone(config.timezone);
  const paid = (offset) => ({ paymentStatus: 'paid', checkIn: addDays(T, offset), pricing: { total: 10000 } });

  it('refunds 100% before the free-cancellation deadline', () => {
    expect(refundQuote(paid(10), hotel, settings)).toMatchObject({ percent: 100, amount: 10000 });
  });
  it('refunds the late percentage inside the deadline but before check-in', () => {
    expect(refundQuote(paid(1), hotel, settings)).toMatchObject({ percent: 50, amount: 5000 });
  });
  it('refunds nothing after check-in time', () => {
    expect(refundQuote(paid(-1), hotel, settings)).toMatchObject({ percent: 0, amount: 0 });
  });
  it('refunds in full when the hotel cancels', () => {
    expect(refundQuote(paid(1), hotel, settings, { initiatedByHotel: true })).toMatchObject({ percent: 100 });
  });
  it('refunds nothing when nothing was paid', () => {
    expect(refundQuote({ ...paid(10), paymentStatus: 'unpaid' }, hotel, settings).amount).toBe(0);
  });
});

describe('booking cancellation', () => {
  it('cancels a paid booking, queues a refund and frees the room', async () => {
    const { category } = await makeHotel({ rooms: 1 });
    const a = await agentFor(await makeUser());
    const id = await bookAndPay(a, category, 10, 12);
    const res = await a.post(`/api/bookings/${id}/cancel`).send({ reason: 'Plans changed' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.paymentStatus).toBe('refund_pending');
    expect(res.body.data.cancellation.refundPercent).toBe(100);
    const payment = await M.Payment.findOne({ booking: id });
    expect(payment.refunds).toHaveLength(1);
    expect(payment.refunds[0].status).toBe('requested'); // not marked successful until processed
    expect(await M.RoomNight.countDocuments({ booking: id })).toBe(0);
    expect((await a.post('/api/bookings').send(bookingBody(category, 10, 12))).status).toBe(201);
  });

  it('cancels an unpaid booking without a refund', async () => {
    const { category } = await makeHotel();
    const a = await agentFor(await makeUser());
    const b = await a.post('/api/bookings').send(bookingBody(category));
    const res = await a.post(`/api/bookings/${b.body.data._id}/cancel`).send({});
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.paymentStatus).toBe('unpaid');
  });

  it('rejects cancelling twice or cancelling a checked-in stay', async () => {
    const { category } = await makeHotel();
    const a = await agentFor(await makeUser());
    const id = await bookAndPay(a, category, 10, 12);
    await a.post(`/api/bookings/${id}/cancel`).send({});
    expect((await a.post(`/api/bookings/${id}/cancel`).send({})).status).toBe(422);
    const id2 = await bookAndPay(a, category, 20, 22);
    await M.Booking.updateOne({ _id: id2 }, { status: 'checked_in' });
    expect((await a.post(`/api/bookings/${id2}/cancel`).send({})).status).toBe(422);
  });
});
