import crypto from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { __setClient } from '../src/services/payments/razorpayProvider.js';
import { __useProvider } from '../src/services/paymentService.js';
import { M, agentFor, app, bookAndPay, bookingBody, connect, disconnect, makeHotel, makeUser, request, resetDb } from './helpers.js';

beforeAll(connect);
afterAll(disconnect);
beforeEach(resetDb);
afterEach(() => __useProvider('mock'));

const KEY_SECRET = 'test_key_secret';
const WEBHOOK_SECRET = 'test_webhook_secret';
const sign = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('hex');

describe('mock (test-mode) payments', () => {
  it('creates an order for the server-side amount and confirms on success', async () => {
    const { category } = await makeHotel({ basePrice: 5000 });
    const a = await agentFor(await makeUser());
    const b = await a.post('/api/bookings').send(bookingBody(category, 3, 5));
    const o = await a.post('/api/payments/orders').send({ bookingId: b.body.data._id });
    expect(o.status).toBe(201);
    expect(o.body.data.amount).toBe(11200);
    expect(o.body.data.testMode).toBe(true);
    const p = await a.post('/api/payments/mock/complete').send({ orderId: o.body.data.orderId, outcome: 'success' });
    expect(p.body.data.status).toBe('confirmed');
    const booking = await M.Booking.findById(b.body.data._id);
    expect(booking.paymentStatus).toBe('paid');
    expect(booking.invoice.number).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(await M.RoomNight.countDocuments({ booking: booking._id, expiresAt: null })).toBe(2);
    const payment = await M.Payment.findOne({ booking: booking._id });
    expect(payment.isTest).toBe(true);
  });

  it('does not treat a failed payment as paid', async () => {
    const { category } = await makeHotel();
    const a = await agentFor(await makeUser());
    const b = await a.post('/api/bookings').send(bookingBody(category));
    const o = await a.post('/api/payments/orders').send({ bookingId: b.body.data._id });
    await a.post('/api/payments/mock/complete').send({ orderId: o.body.data.orderId, outcome: 'failure' });
    const booking = await M.Booking.findById(b.body.data._id);
    expect(booking.status).toBe('pending');
    expect(booking.paymentStatus).toBe('failed');
    expect((await M.Payment.findOne({ booking: booking._id })).status).toBe('failed');
  });

  it('refuses orders for other users’ bookings or confirmed bookings', async () => {
    const { category } = await makeHotel();
    const owner = await agentFor(await makeUser());
    const id = await bookAndPay(owner, category);
    expect((await owner.post('/api/payments/orders').send({ bookingId: id })).status).toBe(422);
    const b = await owner.post('/api/bookings').send(bookingBody(category, 20, 22));
    const other = await agentFor(await makeUser());
    expect((await other.post('/api/payments/orders').send({ bookingId: b.body.data._id })).status).toBe(404);
  });

  it('processes a queued refund exactly once', async () => {
    const { hotel, category } = await makeHotel();
    const guest = await agentFor(await makeUser());
    const id = await bookAndPay(guest, category, 10, 12);
    await guest.post(`/api/bookings/${id}/cancel`).send({});
    const manager = await makeUser('manager');
    await M.StaffAssignment.create({ user: manager._id, hotel: hotel._id, role: 'manager' });
    const m = await agentFor(manager);
    const queue = await m.get('/api/manage/refunds');
    expect(queue.body.data).toHaveLength(1);
    const { payment, refund } = queue.body.data[0];
    const done = await m.post(`/api/manage/payments/${payment._id}/refunds/${refund._id}/process`);
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('refunded');
    expect((await M.Booking.findById(id)).paymentStatus).toBe('refunded');
    expect((await m.post(`/api/manage/payments/${payment._id}/refunds/${refund._id}/process`)).status).toBe(422);
  });
});

describe('Razorpay verification', () => {
  async function pendingOrder() {
    __useProvider('razorpay');
    const calls = { fetch: 0 };
    let remote = null;
    __setClient({
      orders: { create: async ({ amount, currency }) => ({ id: `order_${crypto.randomBytes(6).toString('hex')}`, amount, currency }) },
      payments: {
        fetch: async () => {
          calls.fetch++;
          return remote;
        },
        capture: async () => remote,
        refund: async () => ({ id: 'rfnd_1', status: 'processed' }),
      },
    });
    const { category } = await makeHotel({ basePrice: 5000 });
    const user = await makeUser();
    const a = await agentFor(user);
    const b = await a.post('/api/bookings').send(bookingBody(category, 3, 5));
    const o = await a.post('/api/payments/orders').send({ bookingId: b.body.data._id });
    expect(o.status).toBe(201);
    return { a, bookingId: b.body.data._id, order: o.body.data, calls, setRemote: (r) => (remote = r) };
  }

  it('rejects a forged checkout signature', async () => {
    const { a, order } = await pendingOrder();
    const res = await a.post('/api/payments/razorpay/verify').send({
      razorpay_order_id: order.orderId,
      razorpay_payment_id: 'pay_fake123',
      razorpay_signature: sign(`${order.orderId}|pay_fake123`, 'wrong-secret'),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_SIGNATURE');
  });

  it('does not confirm when the provider says the payment is not captured', async () => {
    const { a, order, bookingId, setRemote } = await pendingOrder();
    setRemote({ id: 'pay_1', order_id: order.orderId, amount: order.amountMinor, currency: 'INR', status: 'failed' });
    const res = await a.post('/api/payments/razorpay/verify').send({
      razorpay_order_id: order.orderId,
      razorpay_payment_id: 'pay_1',
      razorpay_signature: sign(`${order.orderId}|pay_1`, KEY_SECRET),
    });
    expect(res.status).toBe(422);
    expect((await M.Booking.findById(bookingId)).status).toBe('pending');
  });

  it('rejects an amount mismatch even with a valid signature', async () => {
    const { a, order, bookingId, setRemote } = await pendingOrder();
    setRemote({ id: 'pay_2', order_id: order.orderId, amount: 100, currency: 'INR', status: 'captured' });
    const res = await a.post('/api/payments/razorpay/verify').send({
      razorpay_order_id: order.orderId,
      razorpay_payment_id: 'pay_2',
      razorpay_signature: sign(`${order.orderId}|pay_2`, KEY_SECRET),
    });
    expect(res.status).toBe(400);
    expect((await M.Booking.findById(bookingId)).status).toBe('pending');
  });

  it('confirms after signature + server-side capture check', async () => {
    const { a, order, bookingId, setRemote, calls } = await pendingOrder();
    setRemote({ id: 'pay_3', order_id: order.orderId, amount: order.amountMinor, currency: 'INR', status: 'captured', method: 'upi' });
    const res = await a.post('/api/payments/razorpay/verify').send({
      razorpay_order_id: order.orderId,
      razorpay_payment_id: 'pay_3',
      razorpay_signature: sign(`${order.orderId}|pay_3`, KEY_SECRET),
    });
    expect(res.status).toBe(200);
    expect(calls.fetch).toBe(1);
    const booking = await M.Booking.findById(bookingId);
    expect(booking.status).toBe('confirmed');
    expect(booking.paymentStatus).toBe('paid');
  });
});

describe('Razorpay webhooks', () => {
  async function setup() {
    __useProvider('razorpay');
    __setClient({ orders: { create: async ({ amount, currency }) => ({ id: `order_${crypto.randomBytes(6).toString('hex')}`, amount, currency }) } });
    const { category } = await makeHotel({ basePrice: 5000 });
    const a = await agentFor(await makeUser());
    const b = await a.post('/api/bookings').send(bookingBody(category, 3, 5));
    const o = await a.post('/api/payments/orders').send({ bookingId: b.body.data._id });
    return { bookingId: b.body.data._id, order: o.body.data };
  }
  const event = (type, order, amount) =>
    JSON.stringify({ event: type, created_at: 1700000000, payload: { payment: { entity: { id: 'pay_wh1', order_id: order.orderId, amount, currency: 'INR', method: 'card', status: type === 'payment.failed' ? 'failed' : 'captured' } } } });

  it('rejects an invalid signature', async () => {
    const { order } = await setup();
    const body = event('payment.captured', order, order.amountMinor);
    const res = await request(app)
      .post('/api/payments/webhook/razorpay')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', sign(body, 'not-the-secret'))
      .send(body);
    expect(res.status).toBe(400);
  });

  it('confirms on payment.captured and ignores duplicate deliveries', async () => {
    const { order, bookingId } = await setup();
    const body = event('payment.captured', order, order.amountMinor);
    const send = () =>
      request(app)
        .post('/api/payments/webhook/razorpay')
        .set('content-type', 'application/json')
        .set('x-razorpay-signature', sign(body, WEBHOOK_SECRET))
        .set('x-razorpay-event-id', 'evt_001')
        .send(body);
    const first = await send();
    expect(first.status).toBe(200);
    expect(first.body.data.duplicate).toBe(false);
    const second = await send();
    expect(second.status).toBe(200);
    expect(second.body.data.duplicate).toBe(true);
    const booking = await M.Booking.findById(bookingId);
    expect(booking.status).toBe('confirmed');
    expect(booking.statusHistory.filter((h) => h.status === 'confirmed')).toHaveLength(1);
    expect(await M.WebhookEvent.countDocuments()).toBe(1);
  });

  it('does not confirm when the webhook amount does not match', async () => {
    const { order, bookingId } = await setup();
    const body = event('payment.captured', order, 100);
    await request(app)
      .post('/api/payments/webhook/razorpay')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', sign(body, WEBHOOK_SECRET))
      .set('x-razorpay-event-id', 'evt_002')
      .send(body);
    expect((await M.Booking.findById(bookingId)).status).toBe('pending');
  });

  it('marks the payment failed on payment.failed', async () => {
    const { order, bookingId } = await setup();
    const body = event('payment.failed', order, order.amountMinor);
    await request(app)
      .post('/api/payments/webhook/razorpay')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', sign(body, WEBHOOK_SECRET))
      .set('x-razorpay-event-id', 'evt_003')
      .send(body);
    const booking = await M.Booking.findById(bookingId);
    expect(booking.paymentStatus).toBe('failed');
    expect(booking.status).toBe('pending');
  });
});
