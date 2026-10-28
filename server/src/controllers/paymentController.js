import { Payment } from '../models/index.js';
import { assertHotelAccess } from '../services/accessService.js';
import { audit } from '../services/auditService.js';
import * as paymentService from '../services/paymentService.js';
import ApiError from '../utils/ApiError.js';
import { created, ok, pageMeta, pageParams } from '../utils/respond.js';
import { paymentView } from './bookingController.js';

export async function config(_req, res) {
  ok(res, paymentService.publicPaymentConfig());
}

export async function createOrder(req, res) {
  const order = await paymentService.createOrderForBooking(req.user, req.valid.body.bookingId);
  created(res, order);
}

export async function verifyRazorpay(req, res) {
  if (paymentService.provider().name !== 'razorpay') throw ApiError.notFound('Route not found');
  const b = req.valid.body;
  const booking = await paymentService.verifyRazorpayCheckout(req.user, {
    orderId: b.razorpay_order_id,
    paymentId: b.razorpay_payment_id,
    signature: b.razorpay_signature,
  });
  ok(res, { bookingId: booking._id, status: booking.status, paymentStatus: booking.paymentStatus });
}

export async function completeMock(req, res) {
  const booking = await paymentService.completeMockPayment(req.user, req.valid.body);
  ok(res, { bookingId: booking._id, status: booking.status, paymentStatus: booking.paymentStatus, testMode: true });
}

export async function razorpayWebhook(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const result = await paymentService.handleRazorpayWebhook(raw, req.get('x-razorpay-signature'), req.get('x-razorpay-event-id'));
  res.status(200).json({ success: true, data: result });
}

export async function myPayments(req, res) {
  const { page, limit, skip } = pageParams(req.query, { defaultLimit: 20 });
  const filter = { user: req.user._id };
  const [items, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate({ path: 'booking', select: 'confirmationCode hotel checkIn checkOut', populate: { path: 'hotel', select: 'name' } }).lean(),
    Payment.countDocuments(filter),
  ]);
  ok(res, items.map((p) => ({ ...paymentView(p), booking: p.booking })), pageMeta({ page, limit }, total));
}

export async function processRefund(req, res) {
  const payment = await Payment.findById(req.valid.params.paymentId).lean();
  if (!payment) throw ApiError.notFound('Payment not found');
  await assertHotelAccess(req.user, payment.hotel, ['admin', 'manager']);
  const updated = await paymentService.processRefund(req.user, req.valid.params.paymentId, req.valid.params.refundId);
  await audit(req, { category: 'admin', action: 'refund.process', entityType: 'Payment', entityId: payment._id, details: { refundId: req.valid.params.refundId } });
  ok(res, paymentView(updated));
}

export async function rejectRefund(req, res) {
  const payment = await Payment.findById(req.valid.params.paymentId).lean();
  if (!payment) throw ApiError.notFound('Payment not found');
  await assertHotelAccess(req.user, payment.hotel, ['admin', 'manager']);
  const updated = await paymentService.rejectRefund(req.user, req.valid.params.paymentId, req.valid.params.refundId, req.valid.body.note);
  await audit(req, { category: 'admin', action: 'refund.reject', entityType: 'Payment', entityId: payment._id, details: { refundId: req.valid.params.refundId, note: req.valid.body.note } });
  ok(res, paymentView(updated));
}
