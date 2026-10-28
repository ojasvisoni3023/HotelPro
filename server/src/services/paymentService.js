import config from '../config/index.js';
import { Booking, Payment, WebhookEvent } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { fromMinorUnits, round2 } from '../utils/money.js';
import logger from '../utils/logger.js';
import { confirmAfterPayment } from './bookingService.js';
import { sendEmail, templates } from './emailService.js';
import { notify } from './notificationService.js';
import { mockProvider } from './payments/mockProvider.js';
import { razorpayProvider } from './payments/razorpayProvider.js';

const providers = { razorpay: razorpayProvider, mock: mockProvider };
let activeName = config.payment.provider;

export function provider() {
  return providers[activeName];
}

/** Test hook: switch provider without reloading config. */
export function __useProvider(name) {
  activeName = name;
}

export function publicPaymentConfig() {
  return { ...provider().publicConfig(), currency: config.payment.currency };
}

/* ------------------------------------------------------------------ orders */

export async function createOrderForBooking(user, bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking || String(booking.guest) !== String(user._id)) throw ApiError.notFound('Booking not found');
  if (booking.status !== 'pending') {
    throw ApiError.unprocessable(
      booking.status === 'expired' ? 'Your reservation hold expired. Please search again to rebook.' : 'This booking does not need payment',
      { code: 'NOT_PAYABLE' }
    );
  }
  if (!['unpaid', 'failed'].includes(booking.paymentStatus)) throw ApiError.unprocessable('This booking does not need payment', { code: 'NOT_PAYABLE' });
  if (booking.holdExpiresAt && booking.holdExpiresAt <= new Date()) {
    throw ApiError.unprocessable('Your reservation hold expired. Please search again to rebook.', { code: 'HOLD_EXPIRED' });
  }

  const p = provider();
  // The amount always comes from the booking's server-side price calculation.
  const amount = booking.pricing.total;
  let payment = await Payment.findOne({ booking: booking._id, status: 'created', provider: p.name, amount });
  if (!payment) {
    const order = await p.createOrder({
      amount,
      currency: config.payment.currency,
      receipt: booking.confirmationCode,
      notes: { bookingId: String(booking._id), confirmationCode: booking.confirmationCode },
    });
    payment = await Payment.create({
      booking: booking._id,
      user: user._id,
      hotel: booking.hotel,
      amount: fromMinorUnits(order.amountMinor),
      currency: order.currency,
      provider: p.name,
      isTest: p.isTest(),
      providerOrderId: order.orderId,
    });
  }
  return {
    paymentId: payment._id,
    provider: p.name,
    testMode: payment.isTest,
    keyId: p.publicConfig().keyId,
    orderId: payment.providerOrderId,
    amount: payment.amount,
    amountMinor: Math.round(payment.amount * 100),
    currency: payment.currency,
    holdExpiresAt: booking.holdExpiresAt,
    booking: { id: booking._id, confirmationCode: booking.confirmationCode },
    prefill: { name: booking.guestDetails.name, email: booking.guestDetails.email, contact: booking.guestDetails.phone },
  };
}

/* ---------------------------------------------------------- state changes */

/** Idempotently records a captured payment and confirms the booking. */
export async function markCaptured(payment, { providerPaymentId, method } = {}) {
  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: ['created', 'failed'] } },
    { $set: { status: 'captured', providerPaymentId, method, capturedAt: new Date() }, $unset: { failureReason: 1 } },
    { returnDocument: 'after' }
  );
  if (!updated) return Payment.findById(payment._id); // already captured (duplicate callback/webhook)
  const booking = await confirmAfterPayment(updated.booking, updated);
  logger.info(`Payment captured ${updated.providerOrderId} for booking ${booking?.confirmationCode}`);
  return updated;
}

export async function markFailed(payment, reason) {
  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, status: 'created' },
    { $set: { status: 'failed', failureReason: String(reason ?? 'Payment failed').slice(0, 200) } },
    { returnDocument: 'after' }
  );
  if (!updated) return Payment.findById(payment._id);
  const booking = await Booking.findOneAndUpdate(
    { _id: updated.booking, paymentStatus: 'unpaid' },
    { $set: { paymentStatus: 'failed' } },
    { returnDocument: 'after' }
  );
  if (booking) {
    const url = `${config.clientUrl}/bookings/${booking._id}/pay`;
    await sendEmail({ to: booking.guestDetails.email, ...templates.paymentStatus(booking, 'failed', updated.amount, url) });
    await notify(booking.guest, {
      type: 'payment_failed',
      title: 'Payment failed',
      message: `The payment for ${booking.confirmationCode} did not go through. You can retry while your hold is active.`,
      link: `/bookings/${booking._id}/pay`,
    });
  }
  return updated;
}

/* ----------------------------------------------------------- Razorpay flow */

/**
 * Verifies the result returned by Razorpay Checkout. The browser callback alone never
 * confirms a booking: we check the HMAC signature AND fetch the payment from Razorpay
 * to confirm it is captured for the right order, amount and currency.
 */
export async function verifyRazorpayCheckout(user, { orderId, paymentId, signature }) {
  const payment = await Payment.findOne({ providerOrderId: orderId, provider: 'razorpay' });
  if (!payment || String(payment.user) !== String(user._id)) throw ApiError.notFound('Payment not found');
  if (!razorpayProvider.verifyCheckoutSignature({ orderId, paymentId, signature })) {
    throw ApiError.badRequest('Payment signature verification failed', { code: 'BAD_SIGNATURE' });
  }
  const remote = await razorpayProvider.fetchCapturedPayment(paymentId, {
    orderId,
    amount: payment.amount,
    currency: payment.currency,
  });
  if (!remote.matches) throw ApiError.badRequest('Payment does not match this order', { code: 'PAYMENT_MISMATCH' });
  if (remote.status !== 'captured') {
    if (remote.status === 'failed') await markFailed(payment, 'Declined by payment provider');
    throw ApiError.unprocessable(`Payment is ${remote.status}, not captured`, { code: 'NOT_CAPTURED' });
  }
  await markCaptured(payment, { providerPaymentId: paymentId, method: remote.method });
  return Booking.findById(payment.booking);
}

/** Razorpay webhook. Signature-verified; duplicate deliveries are ignored. */
export async function handleRazorpayWebhook(rawBody, signature, eventIdHeader) {
  if (!razorpayProvider.verifyWebhookSignature(rawBody, signature)) {
    throw ApiError.badRequest('Invalid webhook signature', { code: 'BAD_SIGNATURE' });
  }
  const event = JSON.parse(rawBody.toString('utf8'));
  const eventId = eventIdHeader || `${event.event}:${event.payload?.payment?.entity?.id ?? event.payload?.refund?.entity?.id}:${event.created_at}`;
  if (await WebhookEvent.exists({ provider: 'razorpay', eventId })) return { duplicate: true };

  const paymentEntity = event.payload?.payment?.entity;
  const refundEntity = event.payload?.refund?.entity;

  switch (event.event) {
    case 'payment.captured':
    case 'order.paid': {
      const payment = paymentEntity && (await Payment.findOne({ providerOrderId: paymentEntity.order_id }));
      if (payment) {
        const expected = Math.round(payment.amount * 100);
        if (paymentEntity.amount !== expected || paymentEntity.currency !== payment.currency) {
          logger.error('Webhook amount mismatch — not confirming', { order: paymentEntity.order_id });
        } else {
          await markCaptured(payment, { providerPaymentId: paymentEntity.id, method: paymentEntity.method });
        }
      }
      break;
    }
    case 'payment.failed': {
      const payment = paymentEntity && (await Payment.findOne({ providerOrderId: paymentEntity.order_id }));
      if (payment) await markFailed(payment, paymentEntity.error_description);
      break;
    }
    case 'refund.processed':
    case 'refund.failed': {
      if (refundEntity) await settleProviderRefund(refundEntity.id, event.event === 'refund.processed' ? 'processed' : 'failed');
      break;
    }
    default:
      break;
  }

  try {
    await WebhookEvent.create({ provider: 'razorpay', eventId, type: event.event });
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }
  return { duplicate: false, event: event.event };
}

/* ------------------------------------------------------------ mock flow */

export async function completeMockPayment(user, { orderId, outcome }) {
  if (activeName !== 'mock' || config.isProd) throw ApiError.notFound('Route not found');
  const payment = await Payment.findOne({ providerOrderId: orderId, provider: 'mock' });
  if (!payment || String(payment.user) !== String(user._id)) throw ApiError.notFound('Payment not found');
  if (outcome === 'failure') {
    await markFailed(payment, 'Simulated failure (test mode)');
  } else {
    await markCaptured(payment, { providerPaymentId: `mock_pay_${payment._id}`, method: 'test' });
  }
  return Booking.findById(payment.booking);
}

/* ---------------------------------------------------------------- refunds */

async function finalizeRefund(payment, refund, status, actor, note) {
  refund.status = status;
  refund.processedAt = new Date();
  if (actor) refund.processedBy = actor._id;
  if (note) refund.note = note;
  if (status === 'processed') {
    payment.amountRefunded = round2((payment.amountRefunded ?? 0) + refund.amount);
    payment.status = payment.amountRefunded >= payment.amount ? 'refunded' : 'partially_refunded';
  }
  await payment.save();

  const booking = await Booking.findById(payment.booking);
  if (!booking) return;
  if (status === 'processed') {
    booking.paymentStatus = payment.status === 'refunded' ? 'refunded' : 'partially_refunded';
    await booking.save();
    const url = `${config.clientUrl}/account/bookings/${booking._id}`;
    await sendEmail({ to: booking.guestDetails.email, ...templates.paymentStatus(booking, 'refunded', refund.amount, url) });
    await notify(booking.guest, {
      type: 'refund_processed',
      title: 'Refund processed',
      message: `₹${refund.amount} for ${booking.confirmationCode} has been refunded${payment.isTest ? ' (test mode — no real money moved)' : ''}.`,
      link: `/account/bookings/${booking._id}`,
    });
  } else if (status === 'failed' || status === 'rejected') {
    const stillPending = payment.refunds.some((r) => ['requested', 'processing'].includes(r.status));
    if (!stillPending) {
      booking.paymentStatus = payment.amountRefunded > 0 ? 'partially_refunded' : 'paid';
      await booking.save();
    }
    await notify(booking.guest, {
      type: 'refund_update',
      title: status === 'rejected' ? 'Refund request declined' : 'Refund failed',
      message: `${booking.confirmationCode}: ${note || 'Please contact support.'}`,
      link: `/account/bookings/${booking._id}`,
    });
  }
}

export async function processRefund(actor, paymentId, refundId) {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw ApiError.notFound('Payment not found');
  const refund = payment.refunds.id(refundId);
  if (!refund) throw ApiError.notFound('Refund request not found');
  if (refund.status !== 'requested') throw ApiError.unprocessable(`Refund is already ${refund.status}`);
  if (payment.status !== 'captured' && payment.status !== 'partially_refunded') {
    throw ApiError.unprocessable('Only captured payments can be refunded');
  }
  if (round2(payment.amountRefunded + refund.amount) > payment.amount) throw ApiError.unprocessable('Refund exceeds the amount paid');

  // Claim the request atomically so two admins cannot refund twice.
  const claimed = await Payment.updateOne(
    { _id: payment._id, refunds: { $elemMatch: { _id: refund._id, status: 'requested' } } },
    { $set: { 'refunds.$.status': 'processing', 'refunds.$.processedBy': actor._id } }
  );
  if (!claimed.modifiedCount) throw ApiError.conflict('This refund is already being processed');

  const fresh = await Payment.findById(payment._id);
  const freshRefund = fresh.refunds.id(refundId);
  const p = providers[fresh.provider];
  let result;
  try {
    result = await p.refund(fresh.providerPaymentId, freshRefund.amount, { bookingId: String(fresh.booking) });
  } catch (err) {
    await finalizeRefund(fresh, freshRefund, 'failed', actor, err.message);
    throw err;
  }
  freshRefund.providerRefundId = result.refundId;
  if (result.status === 'processed') {
    await finalizeRefund(fresh, freshRefund, 'processed', actor, fresh.isTest ? 'Test-mode refund — no real money moved' : undefined);
  } else {
    await fresh.save(); // stays "processing" until the refund.processed webhook arrives
  }
  return Payment.findById(fresh._id);
}

export async function rejectRefund(actor, paymentId, refundId, note) {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw ApiError.notFound('Payment not found');
  const refund = payment.refunds.id(refundId);
  if (!refund) throw ApiError.notFound('Refund request not found');
  if (refund.status !== 'requested') throw ApiError.unprocessable(`Refund is already ${refund.status}`);
  await finalizeRefund(payment, refund, 'rejected', actor, note);
  return Payment.findById(payment._id);
}

async function settleProviderRefund(providerRefundId, status) {
  const payment = await Payment.findOne({ 'refunds.providerRefundId': providerRefundId });
  if (!payment) return;
  const refund = payment.refunds.find((r) => r.providerRefundId === providerRefundId);
  if (!refund || refund.status === 'processed' || refund.status === status) return;
  await finalizeRefund(payment, refund, status, null, status === 'failed' ? 'The payment provider reported the refund as failed' : undefined);
}
