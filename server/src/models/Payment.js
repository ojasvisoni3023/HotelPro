import mongoose from 'mongoose';
import { objectId } from './shared.js';

export const PAYMENT_RECORD_STATUSES = ['created', 'captured', 'failed', 'refunded', 'partially_refunded'];
export const REFUND_STATUSES = ['requested', 'processing', 'processed', 'failed', 'rejected'];

const refundSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: REFUND_STATUSES, default: 'requested' },
    reason: { type: String, trim: true, maxlength: 300 },
    providerRefundId: String,
    requestedBy: { type: objectId, ref: 'User' },
    requestedAt: { type: Date, default: Date.now },
    processedBy: { type: objectId, ref: 'User' },
    processedAt: Date,
    note: { type: String, trim: true, maxlength: 300 },
  },
  { _id: true }
);

/**
 * One Payment per payment attempt (Razorpay order). Card data never reaches this
 * server: Razorpay Checkout collects it and we only store provider references.
 */
const paymentSchema = new mongoose.Schema(
  {
    booking: { type: objectId, ref: 'Booking', required: true, index: true },
    user: { type: objectId, ref: 'User', required: true },
    hotel: { type: objectId, ref: 'Hotel', required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    provider: { type: String, enum: ['razorpay', 'mock'], required: true },
    // true for mock-mode and seeded demo payments; these are never real money.
    isTest: { type: Boolean, default: false },
    providerOrderId: { type: String, required: true },
    providerPaymentId: String,
    status: { type: String, enum: PAYMENT_RECORD_STATUSES, default: 'created' },
    method: String,
    failureReason: String,
    capturedAt: Date,
    amountRefunded: { type: Number, default: 0, min: 0 },
    refunds: { type: [refundSchema], default: [] },
  },
  { timestamps: true }
);

paymentSchema.index({ providerOrderId: 1 }, { unique: true });
paymentSchema.index({ providerPaymentId: 1 }, { sparse: true });
paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ hotel: 1, status: 1, capturedAt: -1 });
paymentSchema.index({ 'refunds.status': 1 });

export default mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
