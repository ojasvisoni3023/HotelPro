import mongoose from 'mongoose';
import { objectId } from './shared.js';

/**
 * Booking lifecycle (status):
 *   pending ──pay──▶ confirmed ──check-in──▶ checked_in ──check-out──▶ checked_out
 *      │                 │
 *      ├─timeout─▶ expired
 *      └─cancel──▶ cancelled ◀──cancel── confirmed
 *   confirmed ──no-show──▶ no_show
 *
 * Money is tracked separately (paymentStatus):
 *   unpaid ─▶ paid ─▶ refund_pending ─▶ refunded | partially_refunded
 *   unpaid ─▶ failed (payment attempt failed; guest may retry while the hold lasts)
 */
export const BOOKING_STATUSES = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'expired', 'no_show'];
export const PAYMENT_STATUSES = ['unpaid', 'failed', 'paid', 'refund_pending', 'refunded', 'partially_refunded'];

export const BOOKING_TRANSITIONS = {
  pending: ['confirmed', 'cancelled', 'expired'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['checked_out'],
  checked_out: [],
  cancelled: [],
  expired: ['confirmed'], // only when a late payment re-acquires the same nights
  no_show: [],
};

/** Bookings in these states hold inventory (their RoomNight locks are kept). */
export const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'checked_in'];
/** Bookings that count as sold room-nights for occupancy and booking value. */
export const SOLD_BOOKING_STATUSES = ['confirmed', 'checked_in', 'checked_out'];

export function canTransition(from, to) {
  return (BOOKING_TRANSITIONS[from] ?? []).includes(to);
}

const nightlyRateSchema = new mongoose.Schema(
  { date: Date, rate: Number, season: String },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    confirmationCode: { type: String, required: true, unique: true },
    guest: { type: objectId, ref: 'User', required: true },
    hotel: { type: objectId, ref: 'Hotel', required: true },
    category: { type: objectId, ref: 'RoomCategory', required: true },
    room: { type: objectId, ref: 'Room', required: true },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    nights: { type: Number, required: true, min: 1 },
    guests: { type: Number, required: true, min: 1, max: 12 },
    guestDetails: {
      name: { type: String, required: true, trim: true, maxlength: 80 },
      email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
      phone: { type: String, trim: true, maxlength: 20 },
    },
    specialRequests: { type: String, trim: true, maxlength: 500 },
    pricing: {
      currency: { type: String, default: 'INR' },
      nightly: { type: [nightlyRateSchema], default: [] },
      subtotal: { type: Number, required: true, min: 0 },
      taxRatePercent: { type: Number, required: true, min: 0 },
      taxes: { type: Number, required: true, min: 0 },
      total: { type: Number, required: true, min: 0 },
    },
    status: { type: String, enum: BOOKING_STATUSES, default: 'pending' },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid' },
    holdExpiresAt: Date,
    cancellation: {
      cancelledAt: Date,
      cancelledBy: { type: objectId, ref: 'User' },
      reason: { type: String, trim: true, maxlength: 300 },
      refundPercent: Number,
      refundAmount: Number,
      policyNote: String,
    },
    checkedInAt: Date,
    checkedInBy: { type: objectId, ref: 'User' },
    checkedOutAt: Date,
    checkedOutBy: { type: objectId, ref: 'User' },
    invoice: {
      number: { type: String },
      issuedAt: Date,
    },
    reviewed: { type: Boolean, default: false },
    statusHistory: [
      {
        _id: false,
        status: String,
        at: { type: Date, default: Date.now },
        by: { type: objectId, ref: 'User' },
        note: String,
      },
    ],
  },
  { timestamps: true }
);

bookingSchema.index({ guest: 1, createdAt: -1 });
bookingSchema.index({ hotel: 1, checkIn: 1 });
bookingSchema.index({ hotel: 1, checkOut: 1 });
bookingSchema.index({ hotel: 1, status: 1 });
bookingSchema.index({ status: 1, holdExpiresAt: 1 });
bookingSchema.index({ 'invoice.number': 1 }, { unique: true, sparse: true });

bookingSchema.pre('validate', function validateDates() {
  if (this.checkIn && this.checkOut && this.checkOut <= this.checkIn) {
    this.invalidate('checkOut', 'Check-out must be after check-in');
  }
});

export default mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
