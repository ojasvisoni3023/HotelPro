import crypto from 'node:crypto';
import config from '../../config/index.js';

/**
 * LOCAL DEMONSTRATION ONLY. No money moves and nothing is sent to a payment network.
 * Config validation refuses PAYMENT_PROVIDER=mock when NODE_ENV=production, and every
 * mock payment is stored with isTest=true and shown as "Test payment" in the UI.
 */
export const mockProvider = {
  name: 'mock',
  isTest: () => true,

  publicConfig() {
    return { provider: 'mock', keyId: null, testMode: true };
  },

  async createOrder({ amount, currency }) {
    if (config.isProd) throw new Error('Mock payments are disabled in production');
    return { orderId: `mock_order_${crypto.randomBytes(9).toString('hex')}`, amountMinor: Math.round(amount * 100), currency };
  },

  async refund() {
    return { refundId: `mock_rfnd_${crypto.randomBytes(8).toString('hex')}`, status: 'processed' };
  },
};
