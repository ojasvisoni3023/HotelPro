import mongoose from 'mongoose';
import config from '../config/index.js';
import { Booking, Hotel, HousekeepingTask, Payment, Room, RoomCategory, RoomNight } from '../models/index.js';
import { canTransition } from '../models/Booking.js';
import { UNSELLABLE_ROOM_STATUSES } from '../models/Room.js';
import { nextSequence } from '../models/Counter.js';
import ApiError from '../utils/ApiError.js';
import { addDays, hoursUntil, nightsBetween, parseDateOnly, todayInZone, zonedInstant } from '../utils/dates.js';
import { round2 } from '../utils/money.js';
import { confirmationCode } from '../utils/tokens.js';
import * as availability from './availabilityService.js';
import { sendEmail, templates } from './emailService.js';
import { adminIds, hotelTeamIds, notify } from './notificationService.js';
import { quoteStay } from './pricingService.js';
import { cancellationPolicyText, getSettings } from './settingsService.js';

/** Validates a requested stay against platform rules. Returns parsed dates. */
export function validateStay(checkInStr, checkOutStr, settings, now = new Date()) {
  const checkIn = parseDateOnly(checkInStr);
  const checkOut = parseDateOnly(checkOutStr);
  if (!checkIn || !checkOut) throw ApiError.badRequest('Invalid dates', { code: 'INVALID_DATES' });
  const today = todayInZone(config.timezone, now);
  if (checkIn < today) throw ApiError.badRequest('Check-in date cannot be in the past', { code: 'INVALID_DATES' });
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) throw ApiError.badRequest('Check-out must be at least one night after check-in', { code: 'INVALID_DATES' });
  if (nights > settings.maxStayNights) {
    throw ApiError.badRequest(`Stays are limited to ${settings.maxStayNights} nights`, { code: 'STAY_TOO_LONG' });
  }
  if (checkIn > addDays(today, settings.bookingWindowDays)) {
    throw ApiError.badRequest(`Bookings open ${settings.bookingWindowDays} days in advance`, { code: 'TOO_FAR_AHEAD' });
  }
  return { checkIn, checkOut, nights };
}

async function loadBookableCategory(categoryId) {
  const category = await RoomCategory.findOne({ _id: categoryId, status: 'active' }).lean();
  if (!category) throw ApiError.notFound('Room type not found');
  const hotel = await Hotel.findOne({ _id: category.hotel, status: 'active' }).lean();
  if (!hotel) throw ApiError.notFound('This hotel is not accepting bookings');
  return { category, hotel };
}

function pushHistory(status, by, note) {
  return { statusHistory: { status, at: new Date(), by, note } };
}

/** Creates a pending booking that holds a room until payment (or until the hold lapses). */
export async function createBooking(user, input) {
  const settings = await getSettings();
  const { checkIn, checkOut } = validateStay(input.checkIn, input.checkOut, settings);
  const { category, hotel } = await loadBookableCategory(input.categoryId);
  if (input.guests > category.maxGuests) {
    throw ApiError.badRequest(`This room type sleeps up to ${category.maxGuests} guests`, { code: 'TOO_MANY_GUESTS' });
  }

  const quote = quoteStay(category, checkIn, checkOut, settings.taxRatePercent);
  const bookingId = new mongoose.Types.ObjectId();
  const holdExpiresAt = new Date(Date.now() + config.payment.holdMinutes * 60 * 1000);

  const room = await availability.acquireRoom({
    bookingId,
    hotel: hotel._id,
    category: category._id,
    checkIn,
    checkOut,
    expiresAt: holdExpiresAt,
  });
  if (!room) {
    throw ApiError.conflict('Sorry, this room type is no longer available for those dates', { code: 'NO_AVAILABILITY' });
  }

  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const booking = await Booking.create({
          _id: bookingId,
          confirmationCode: confirmationCode(),
          guest: user._id,
          hotel: hotel._id,
          category: category._id,
          room: room._id,
          checkIn,
          checkOut,
          nights: quote.nights,
          guests: input.guests,
          guestDetails: {
            name: input.guestDetails?.name || user.name,
            email: input.guestDetails?.email || user.email,
            phone: input.guestDetails?.phone || user.phone,
          },
          specialRequests: input.specialRequests,
          pricing: {
            currency: quote.currency,
            nightly: quote.nightly,
            subtotal: quote.subtotal,
            taxRatePercent: quote.taxRatePercent,
            taxes: quote.taxes,
            total: quote.total,
          },
          status: 'pending',
          paymentStatus: 'unpaid',
          holdExpiresAt,
          statusHistory: [{ status: 'pending', at: new Date(), by: user._id, note: 'Reservation created' }],
        });
        return booking;
      } catch (err) {
        // Retry on the (very unlikely) confirmation-code collision only.
        if (err?.code === 11000 && err.keyPattern?.confirmationCode && attempt < 3) continue;
        throw err;
      }
    }
  } catch (err) {
    await availability.releaseBooking(bookingId);
    throw err;
  }
}

async function issueInvoice(bookingId) {
  const year = new Date().getUTCFullYear();
  const seq = await nextSequence(`invoice-${year}`);
  const number = `INV-${year}-${String(seq).padStart(6, '0')}`;
  await Booking.updateOne({ _id: bookingId, 'invoice.number': { $exists: false } }, { $set: { invoice: { number, issuedAt: new Date() } } });
}

/**
 * Called once a payment is verified as captured. Idempotent.
 * If the hold lapsed before payment arrived, tries to re-acquire a room; if none is
 * free the booking stays expired and a full refund request is raised automatically.
 */
export async function confirmAfterPayment(bookingId, payment) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found');
  if (['confirmed', 'checked_in', 'checked_out'].includes(booking.status)) return booking;

  if (!['pending', 'expired'].includes(booking.status)) {
    // e.g. cancelled while the guest was paying: money must go back.
    await raiseAutomaticRefund(booking, payment, `Payment received for a ${booking.status} booking`);
    return Booking.findById(bookingId);
  }

  let held = await availability.confirmLocks(booking._id);
  let roomId = booking.room;
  if (held !== booking.nights) {
    await availability.releaseBooking(booking._id);
    const room = await availability.acquireRoom({
      bookingId: booking._id,
      hotel: booking.hotel,
      category: booking.category,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      expiresAt: null,
      preferredRoomId: booking.room,
    });
    if (room) {
      roomId = room._id;
      held = booking.nights;
    }
  }

  if (held !== booking.nights) {
    await Booking.updateOne(
      { _id: booking._id, status: { $in: ['pending', 'expired'] } },
      { $set: { status: 'expired' }, $push: pushHistory('expired', undefined, 'Payment arrived after the hold expired and the room was taken') }
    );
    await raiseAutomaticRefund(booking, payment, 'Payment arrived after the reservation hold expired; room no longer available');
    return Booking.findById(bookingId);
  }

  const confirmed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: { $in: ['pending', 'expired'] } },
    {
      $set: { status: 'confirmed', paymentStatus: 'paid', room: roomId },
      $unset: { holdExpiresAt: 1 },
      $push: pushHistory('confirmed', undefined, 'Payment verified'),
    },
    { returnDocument: 'after' }
  );
  if (!confirmed) return Booking.findById(bookingId);
  await issueInvoice(confirmed._id);

  const hotel = await Hotel.findById(confirmed.hotel).select('name').lean();
  const url = `${config.clientUrl}/account/bookings/${confirmed._id}`;
  await sendEmail({ to: confirmed.guestDetails.email, ...templates.bookingConfirmed(confirmed, hotel, url) });
  await notify(confirmed.guest, {
    type: 'booking_confirmed',
    title: 'Booking confirmed',
    message: `Your stay at ${hotel.name} (${confirmed.confirmationCode}) is confirmed.`,
    link: `/account/bookings/${confirmed._id}`,
  });
  await notify(await hotelTeamIds(confirmed.hotel, ['manager', 'staff']), {
    type: 'new_reservation',
    title: 'New reservation',
    message: `${confirmed.guestDetails.name} booked ${confirmed.nights} night(s) from ${confirmed.checkIn.toISOString().slice(0, 10)} (${confirmed.confirmationCode}).`,
    link: `/manager/reservations?q=${confirmed.confirmationCode}`,
  });
  return Booking.findById(confirmed._id);
}

async function raiseAutomaticRefund(booking, payment, reason) {
  await Payment.updateOne(
    { _id: payment._id, 'refunds.0': { $exists: false } },
    { $push: { refunds: { amount: payment.amount, status: 'requested', reason } } }
  );
  await Booking.updateOne({ _id: booking._id }, { $set: { paymentStatus: 'refund_pending' } });
  await notify(await adminIds(), {
    type: 'refund_required',
    title: 'Refund required',
    message: `${booking.confirmationCode}: ${reason}. Full refund queued for approval.`,
    link: '/admin/payments?refunds=pending',
  });
}

/** Refund owed under the cancellation policy (hotel-initiated cancellations refund in full). */
export function refundQuote(booking, hotel, settings, { initiatedByHotel = false, now = new Date() } = {}) {
  if (booking.paymentStatus !== 'paid') return { percent: 0, amount: 0, note: 'Nothing was paid' };
  if (initiatedByHotel) return { percent: 100, amount: booking.pricing.total, note: 'Cancelled by the hotel — full refund' };
  const checkInAt = zonedInstant(booking.checkIn, hotel?.checkInTime ?? '14:00', config.timezone);
  const hours = hoursUntil(checkInAt, now);
  let percent;
  if (hours >= settings.freeCancellationHours) percent = 100;
  else if (hours > 0) percent = settings.lateCancellationRefundPercent;
  else percent = 0;
  return {
    percent,
    amount: round2((booking.pricing.total * percent) / 100),
    note: cancellationPolicyText(settings),
  };
}

/** Cancels a booking according to policy. Refunds are queued, never marked processed here. */
export async function cancelBooking(booking, actor, reason) {
  if (!canTransition(booking.status, 'cancelled')) {
    throw ApiError.unprocessable(`A ${booking.status.replace('_', ' ')} booking cannot be cancelled`, { code: 'INVALID_TRANSITION' });
  }
  const settings = await getSettings();
  const hotel = await Hotel.findById(booking.hotel).lean();
  const initiatedByHotel = ['manager', 'admin', 'staff'].includes(actor.role) && String(actor._id) !== String(booking.guest);
  const refund = refundQuote(booking, hotel, settings, { initiatedByHotel });

  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: booking.status },
    {
      $set: {
        status: 'cancelled',
        paymentStatus: refund.amount > 0 ? 'refund_pending' : booking.paymentStatus,
        cancellation: {
          cancelledAt: new Date(),
          cancelledBy: actor._id,
          reason,
          refundPercent: refund.percent,
          refundAmount: refund.amount,
          policyNote: refund.note,
        },
      },
      $unset: { holdExpiresAt: 1 },
      $push: pushHistory('cancelled', actor._id, reason || (initiatedByHotel ? 'Cancelled by hotel' : 'Cancelled by guest')),
    },
    { returnDocument: 'after' }
  );
  if (!updated) throw ApiError.conflict('The booking changed while cancelling. Please refresh and try again.');
  await availability.releaseBooking(booking._id);

  if (refund.amount > 0) {
    const payment = await Payment.findOne({ booking: booking._id, status: 'captured' }).sort({ capturedAt: -1 });
    if (payment) {
      payment.refunds.push({ amount: refund.amount, status: 'requested', reason: `Cancellation (${refund.percent}% refund)`, requestedBy: actor._id });
      await payment.save();
    }
    await notify([...(await hotelTeamIds(booking.hotel)), ...(await adminIds())], {
      type: 'refund_requested',
      title: 'Refund awaiting processing',
      message: `${booking.confirmationCode} was cancelled. Refund of ₹${refund.amount} needs to be processed.`,
      link: '/manager/reservations?view=refunds',
    });
  }

  const url = `${config.clientUrl}/account/bookings/${booking._id}`;
  await sendEmail({ to: updated.guestDetails.email, ...templates.bookingCancelled(updated, hotel, refund.amount, url) });
  await notify(booking.guest, {
    type: 'booking_cancelled',
    title: 'Booking cancelled',
    message: `${booking.confirmationCode} at ${hotel.name} was cancelled.${refund.amount > 0 ? ` Refund of ₹${refund.amount} requested.` : ''}`,
    link: `/account/bookings/${booking._id}`,
  });
  return updated;
}

export async function checkIn(booking, actor, { roomId } = {}) {
  if (booking.status !== 'confirmed') throw ApiError.unprocessable('Only confirmed bookings can be checked in', { code: 'INVALID_TRANSITION' });
  if (booking.paymentStatus !== 'paid') throw ApiError.unprocessable('Payment has not been completed for this booking', { code: 'UNPAID' });
  const today = todayInZone(config.timezone);
  if (today < booking.checkIn) throw ApiError.unprocessable('Check-in opens on the arrival date', { code: 'TOO_EARLY' });
  if (today >= booking.checkOut) throw ApiError.unprocessable('This stay has already ended', { code: 'TOO_LATE' });

  let room = await Room.findById(booking.room);
  if (roomId && String(roomId) !== String(booking.room)) {
    room = await reassignRoom(booking, roomId);
  }
  if (UNSELLABLE_ROOM_STATUSES.includes(room.status)) {
    throw ApiError.unprocessable(`Room ${room.roomNumber} is ${room.status.replace('_', ' ')}. Assign another room.`, { code: 'ROOM_UNAVAILABLE' });
  }

  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'confirmed' },
    { $set: { status: 'checked_in', checkedInAt: new Date(), checkedInBy: actor._id }, $push: pushHistory('checked_in', actor._id) },
    { returnDocument: 'after' }
  );
  if (!updated) throw ApiError.conflict('Booking already updated by someone else');
  await Room.updateOne({ _id: room._id }, { status: 'occupied' });
  await notify(booking.guest, {
    type: 'checked_in',
    title: 'Welcome!',
    message: `You are checked in to room ${room.roomNumber}. Need anything? Send a service request from your booking page.`,
    link: `/account/bookings/${booking._id}`,
  });
  return updated;
}

export async function checkOut(booking, actor) {
  if (booking.status !== 'checked_in') throw ApiError.unprocessable('Only checked-in guests can be checked out', { code: 'INVALID_TRANSITION' });
  const today = todayInZone(config.timezone);
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'checked_in' },
    { $set: { status: 'checked_out', checkedOutAt: new Date(), checkedOutBy: actor._id }, $push: pushHistory('checked_out', actor._id) },
    { returnDocument: 'after' }
  );
  if (!updated) throw ApiError.conflict('Booking already updated by someone else');
  // Early departure frees the remaining nights for resale.
  if (today < booking.checkOut) await availability.releaseBooking(booking._id, { fromDate: today > booking.checkIn ? today : addDays(booking.checkIn, 1) });
  await Room.updateOne({ _id: booking.room }, { status: 'cleaning' });
  await HousekeepingTask.create({
    hotel: booking.hotel,
    room: booking.room,
    booking: booking._id,
    type: 'checkout_clean',
    priority: 'high',
    dueDate: new Date(),
    createdBy: actor._id,
    notes: `Departure clean after ${booking.confirmationCode}`,
  });
  if (!updated.invoice?.number) await issueInvoice(updated._id);
  await notify(booking.guest, {
    type: 'checked_out',
    title: 'Thanks for staying with us',
    message: 'Your invoice is ready, and we would love to hear about your stay.',
    link: `/account/bookings/${booking._id}`,
  });
  return Booking.findById(updated._id);
}

export async function markNoShow(booking, actor) {
  if (booking.status !== 'confirmed') throw ApiError.unprocessable('Only confirmed bookings can be marked as no-show', { code: 'INVALID_TRANSITION' });
  const today = todayInZone(config.timezone);
  if (today <= booking.checkIn) throw ApiError.unprocessable('A no-show can be recorded only after the arrival date', { code: 'TOO_EARLY' });
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'confirmed' },
    { $set: { status: 'no_show' }, $push: pushHistory('no_show', actor._id) },
    { returnDocument: 'after' }
  );
  if (!updated) throw ApiError.conflict('Booking already updated by someone else');
  await availability.releaseBooking(booking._id);
  return updated;
}

/** Moves a booking to another physical room of the same type that is free for the remaining stay. */
export async function reassignRoom(booking, roomId) {
  if (!['pending', 'confirmed', 'checked_in'].includes(booking.status)) {
    throw ApiError.unprocessable('Rooms can only be changed for active bookings');
  }
  const room = await Room.findOne({ _id: roomId, hotel: booking.hotel });
  if (!room) throw ApiError.notFound('Room not found in this hotel');
  if (String(room.category) !== String(booking.category)) throw ApiError.unprocessable('The new room must be of the same room type');
  if (UNSELLABLE_ROOM_STATUSES.includes(room.status)) throw ApiError.unprocessable(`Room ${room.roomNumber} is not in service`);

  const today = todayInZone(config.timezone);
  const from = booking.checkIn > today ? booking.checkIn : today;
  // Lock the new room's nights first; only then release the old ones (never leaves the guest roomless).
  const ok = await availability.acquireSpecificRoom({
    room,
    bookingId: booking._id,
    hotel: booking.hotel,
    category: booking.category,
    checkIn: from,
    checkOut: booking.checkOut,
    expiresAt: booking.status === 'pending' ? booking.holdExpiresAt : null,
  });
  if (!ok) throw ApiError.conflict(`Room ${room.roomNumber} is not free for these dates`, { code: 'ROOM_TAKEN' });
  await RoomNight.deleteMany({ booking: booking._id, room: { $ne: room._id }, date: { $gte: from } });
  if (booking.status === 'checked_in') {
    await Room.updateOne({ _id: booking.room }, { status: 'cleaning' });
    await Room.updateOne({ _id: room._id }, { status: 'occupied' });
  }
  await Booking.updateOne({ _id: booking._id }, { $set: { room: room._id }, $push: pushHistory(booking.status, undefined, `Moved to room ${room.roomNumber}`) });
  return room;
}

export { issueInvoice };
