import config from '../config/index.js';
import { Booking, Hotel, Payment, Review, ServiceRequest } from '../models/index.js';
import { canTransition } from '../models/Booking.js';
import { audit } from '../services/auditService.js';
import { loadBookingFor } from '../services/bookingAccess.js';
import * as bookingService from '../services/bookingService.js';
import { getSettings } from '../services/settingsService.js';
import ApiError from '../utils/ApiError.js';
import { todayInZone } from '../utils/dates.js';
import { created, ok, pageMeta, pageParams } from '../utils/respond.js';

export function paymentView(p) {
  return {
    _id: p._id,
    booking: p.booking,
    amount: p.amount,
    currency: p.currency,
    provider: p.provider,
    isTest: p.isTest,
    status: p.status,
    method: p.method,
    providerOrderId: p.providerOrderId,
    providerPaymentId: p.providerPaymentId,
    failureReason: p.failureReason,
    capturedAt: p.capturedAt,
    amountRefunded: p.amountRefunded,
    refunds: (p.refunds ?? []).map((r) => ({
      _id: r._id,
      amount: r.amount,
      status: r.status,
      reason: r.reason,
      note: r.note,
      requestedAt: r.requestedAt,
      processedAt: r.processedAt,
    })),
    createdAt: p.createdAt,
  };
}

export async function createBooking(req, res) {
  const booking = await bookingService.createBooking(req.user, req.valid.body);
  await audit(req, { category: 'activity', action: 'booking.create', entityType: 'Booking', entityId: booking._id, details: { code: booking.confirmationCode } });
  created(res, booking);
}

export async function myBookings(req, res) {
  const { scope } = req.valid.query;
  const today = todayInZone(config.timezone);
  const filter = { guest: req.user._id };
  let sort = { checkIn: -1 };
  if (scope === 'upcoming') {
    filter.status = { $in: ['pending', 'confirmed', 'checked_in'] };
    filter.checkOut = { $gte: today };
    sort = { checkIn: 1 };
  } else if (scope === 'past') {
    filter.status = { $in: ['checked_out', 'no_show', 'confirmed'] };
    filter.checkOut = { $lt: today };
  } else if (scope === 'cancelled') {
    filter.status = { $in: ['cancelled', 'expired'] };
  }
  const { page, limit, skip } = pageParams(req.valid.query, { defaultLimit: 10 });
  const [items, total] = await Promise.all([
    Booking.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('hotel', 'name slug address images')
      .populate('category', 'name images')
      .lean(),
    Booking.countDocuments(filter),
  ]);
  ok(res, items, pageMeta({ page, limit }, total));
}

export async function getBooking(req, res) {
  const { booking, asOwner } = await loadBookingFor(req.user, req.params.id);
  await booking.populate([
    { path: 'hotel', select: 'name slug address contact images checkInTime checkOutTime policies' },
    { path: 'category', select: 'name images amenities maxGuests bedType' },
    { path: 'room', select: 'roomNumber floor status' },
    ...(asOwner ? [] : [{ path: 'guest', select: 'name email phone' }]),
  ]);
  const [payments, requests, review, settings] = await Promise.all([
    Payment.find({ booking: booking._id }).sort({ createdAt: -1 }).lean(),
    ServiceRequest.find({ booking: booking._id }).sort({ createdAt: -1 }).lean(),
    Review.findOne({ booking: booking._id }).lean(),
    getSettings(),
  ]);
  const cancellable = canTransition(booking.status, 'cancelled');
  ok(res, {
    booking,
    payments: payments.map(paymentView),
    serviceRequests: requests,
    review,
    actions: {
      canPay: asOwner && booking.status === 'pending' && ['unpaid', 'failed'].includes(booking.paymentStatus) && booking.holdExpiresAt > new Date(),
      canCancel: cancellable,
      canReview: asOwner && booking.status === 'checked_out' && !review,
      canRequestService: asOwner && ['confirmed', 'checked_in'].includes(booking.status),
      hasInvoice: Boolean(booking.invoice?.number),
    },
    refundPreview: cancellable ? bookingService.refundQuote(booking, booking.hotel, settings, { initiatedByHotel: !asOwner }) : null,
  });
}

export async function cancelBooking(req, res) {
  const { booking, asOwner } = await loadBookingFor(req.user, req.params.id, { teamRoles: ['admin', 'manager'] });
  const updated = await bookingService.cancelBooking(booking, req.user, req.valid.body.reason);
  await audit(req, {
    category: asOwner ? 'activity' : 'admin',
    action: 'booking.cancel',
    entityType: 'Booking',
    entityId: booking._id,
    details: { code: booking.confirmationCode, refundAmount: updated.cancellation?.refundAmount, byHotel: !asOwner },
  });
  ok(res, updated);
}

export async function invoice(req, res) {
  const { booking } = await loadBookingFor(req.user, req.params.id);
  if (!booking.invoice?.number) throw ApiError.notFound('An invoice is issued once payment is confirmed');
  const [hotel, payments, settings] = await Promise.all([
    Hotel.findById(booking.hotel).select('name address contact').lean(),
    Payment.find({ booking: booking._id, status: { $in: ['captured', 'refunded', 'partially_refunded'] } }).lean(),
    getSettings(),
  ]);
  await booking.populate([{ path: 'category', select: 'name' }, { path: 'room', select: 'roomNumber' }]);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const refunded = payments.reduce((s, p) => s + (p.amountRefunded ?? 0), 0);
  ok(res, {
    invoiceNumber: booking.invoice.number,
    issuedAt: booking.invoice.issuedAt,
    seller: { name: hotel.name, address: hotel.address, contact: hotel.contact, platform: 'HotelPro', supportEmail: settings.supportEmail },
    billedTo: booking.guestDetails,
    booking: {
      confirmationCode: booking.confirmationCode,
      roomType: booking.category?.name,
      roomNumber: booking.room?.roomNumber,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      nights: booking.nights,
      guests: booking.guests,
      status: booking.status,
    },
    lines: booking.pricing.nightly.map((n) => ({ date: n.date, description: `Room night${n.season ? ` (${n.season})` : ''}`, amount: n.rate })),
    subtotal: booking.pricing.subtotal,
    taxRatePercent: booking.pricing.taxRatePercent,
    taxes: booking.pricing.taxes,
    total: booking.pricing.total,
    amountPaid: paid,
    amountRefunded: refunded,
    currency: booking.pricing.currency,
    testMode: payments.some((p) => p.isTest),
  });
}
