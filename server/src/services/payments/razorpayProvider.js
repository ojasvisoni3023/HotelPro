import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import config from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { fromMinorUnits, toMinorUnits } from '../../utils/money.js';
import { safeEqualHex } from '../../utils/tokens.js';

let client = null;
function rzp() {
  if (!client) {
    client = new Razorpay({ key_id: config.payment.razorpay.keyId, key_secret: config.payment.razorpay.keySecret });
  }
  return client;
}

/** Allows tests to inject a fake SDK client. */
export function __setClient(fake) {
  client = fake;
}

function sdkError(err, fallback) {
  const msg = err?.error?.description || err?.message || fallback;
  return ApiError.unavailable(`Payment provider error: ${msg}`, { code: 'PROVIDER_ERROR' });
}

export const razorpayProvider = {
  name: 'razorpay',
  isTest: () => String(config.payment.razorpay.keyId ?? '').startsWith('rzp_test_'),

  publicConfig() {
    return { provider: 'razorpay', keyId: config.payment.razorpay.keyId, testMode: this.isTest() };
  },

  async createOrder({ amount, currency, receipt, notes }) {
    try {
      const order = await rzp().orders.create({ amount: toMinorUnits(amount), currency, receipt, notes });
      return { orderId: order.id, amountMinor: order.amount, currency: order.currency };
    } catch (err) {
      throw sdkError(err, 'could not create order');
    }
  },

  /** Signature from Checkout: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
  verifyCheckoutSignature({ orderId, paymentId, signature }) {
    const expected = crypto
      .createHmac('sha256', config.payment.razorpay.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return safeEqualHex(expected, signature);
  },

  /** Webhook signature: HMAC_SHA256(raw request body, webhook secret). */
  verifyWebhookSignature(rawBody, signature) {
    const secret = config.payment.razorpay.webhookSecret;
    if (!secret || !signature) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return safeEqualHex(expected, signature);
  },

  /** Authoritative server-side lookup; captures an authorized payment if auto-capture is off. */
  async fetchCapturedPayment(paymentId, expected) {
    let p;
    try {
      p = await rzp().payments.fetch(paymentId);
      if (p.status === 'authorized') {
        p = await rzp().payments.capture(paymentId, p.amount, p.currency);
      }
    } catch (err) {
      throw sdkError(err, 'could not verify payment');
    }
    return {
      status: p.status, // created | authorized | captured | refunded | failed
      orderId: p.order_id,
      amount: fromMinorUnits(p.amount),
      currency: p.currency,
      method: p.method,
      matches: p.order_id === expected.orderId && p.amount === toMinorUnits(expected.amount) && p.currency === expected.currency,
    };
  },

  async refund(paymentId, amount, notes) {
    try {
      const r = await rzp().payments.refund(paymentId, { amount: toMinorUnits(amount), notes });
      return { refundId: r.id, status: r.status === 'processed' ? 'processed' : 'processing' };
    } catch (err) {
      throw sdkError(err, 'refund failed');
    }
  },
};
