import mongoose from 'mongoose';
import config from '../config/index.js';
import { Booking, Payment, Room, RoomNight } from '../models/index.js';
import { SOLD_BOOKING_STATUSES } from '../models/Booking.js';
import { UNSELLABLE_ROOM_STATUSES } from '../models/Room.js';
import { addDays, nightsBetween, toDateString, zonedInstant } from '../utils/dates.js';
import { round2 } from '../utils/money.js';

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/**
 * Metric definitions (also documented in docs/ARCHITECTURE.md):
 *  - paidRevenue      Σ amount of payments captured in the period (by capture time)
 *  - refunded         Σ refunds processed in the period (by processing time)
 *  - netRevenue       paidRevenue − refunded
 *  - testModeRevenue  portion of paidRevenue from test/mock payments (not real money)
 *  - pendingValue     Σ totals of bookings created in the period still awaiting payment
 *  - bookingValue     Σ totals of sold bookings (confirmed / checked-in / checked-out) whose
 *                     check-in falls in the period — an estimate of business on the books
 *  - occupancy        sold room-nights ÷ (sellable rooms × nights in period)
 */
export async function summary(hotelIds, from, to) {
  const hotelMatch = hotelIds === null ? {} : { hotel: { $in: hotelIds.map(oid) } };
  const toExclusive = addDays(to, 1);
  const days = nightsBetween(from, toExclusive);
  const tz = config.timezone;
  // Timestamps (createdAt, capturedAt) are compared against the period in the hotel timezone.
  const fromI = zonedInstant(from, '00:00', tz);
  const toI = zonedInstant(toExclusive, '00:00', tz);

  const [statusAgg, paymentAgg, refundAgg, pendingAgg, valueAgg, roomsCount, soldNights, dailyBookings, dailyRevenue, dailyNights] =
    await Promise.all([
      Booking.aggregate([
        { $match: { ...hotelMatch, createdAt: { $gte: fromI, $lt: toI } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Payment.aggregate([
        { $match: { ...hotelMatch, capturedAt: { $gte: fromI, $lt: toI }, status: { $in: ['captured', 'refunded', 'partially_refunded'] } } },
        { $group: { _id: '$isTest', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Payment.aggregate([
        { $match: hotelMatch },
        { $unwind: '$refunds' },
        { $match: { 'refunds.status': 'processed', 'refunds.processedAt': { $gte: fromI, $lt: toI } } },
        { $group: { _id: null, amount: { $sum: '$refunds.amount' } } },
      ]),
      Booking.aggregate([
        { $match: { ...hotelMatch, status: 'pending', createdAt: { $gte: fromI, $lt: toI } } },
        { $group: { _id: null, amount: { $sum: '$pricing.total' }, count: { $sum: 1 } } },
      ]),
      Booking.aggregate([
        { $match: { ...hotelMatch, status: { $in: SOLD_BOOKING_STATUSES }, checkIn: { $gte: from, $lt: toExclusive } } },
        { $group: { _id: null, amount: { $sum: '$pricing.total' }, count: { $sum: 1 } } },
      ]),
      Room.countDocuments({ ...hotelMatch, status: { $nin: UNSELLABLE_ROOM_STATUSES } }),
      RoomNight.countDocuments({ ...hotelMatch, expiresAt: null, date: { $gte: from, $lt: toExclusive } }),
      Booking.aggregate([
        { $match: { ...hotelMatch, createdAt: { $gte: fromI, $lt: toI } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } }, count: { $sum: 1 } } },
      ]),
      Payment.aggregate([
        { $match: { ...hotelMatch, capturedAt: { $gte: fromI, $lt: toI }, status: { $in: ['captured', 'refunded', 'partially_refunded'] } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$capturedAt', timezone: tz } }, amount: { $sum: '$amount' } } },
      ]),
      RoomNight.aggregate([
        { $match: { ...hotelMatch, expiresAt: null, date: { $gte: from, $lt: toExclusive } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, nights: { $sum: 1 } } },
      ]),
    ]);

  const paid = round2(paymentAgg.reduce((s, r) => s + r.amount, 0));
  const testModeRevenue = round2(paymentAgg.filter((r) => r._id === true).reduce((s, r) => s + r.amount, 0));
  const refunded = round2(refundAgg[0]?.amount ?? 0);
  const capacity = roomsCount * days;

  const byDay = (rows, key) => new Map(rows.map((r) => [r._id, r[key]]));
  const bMap = byDay(dailyBookings, 'count');
  const rMap = byDay(dailyRevenue, 'amount');
  const nMap = byDay(dailyNights, 'nights');
  const series = [];
  for (let d = new Date(from); d < toExclusive; d = addDays(d, 1)) {
    const key = toDateString(d);
    const nights = nMap.get(key) ?? 0;
    series.push({
      date: key,
      bookings: bMap.get(key) ?? 0,
      revenue: round2(rMap.get(key) ?? 0),
      occupancy: roomsCount ? round2((nights / roomsCount) * 100) : 0,
    });
  }

  return {
    period: { from: toDateString(from), to: toDateString(to), days },
    bookings: {
      created: statusAgg.reduce((s, r) => s + r.count, 0),
      byStatus: Object.fromEntries(statusAgg.map((r) => [r._id, r.count])),
    },
    revenue: {
      paid,
      refunded,
      net: round2(paid - refunded),
      testModeRevenue,
      pendingValue: round2(pendingAgg[0]?.amount ?? 0),
      pendingCount: pendingAgg[0]?.count ?? 0,
      bookingValue: round2(valueAgg[0]?.amount ?? 0),
      currency: 'INR',
    },
    occupancy: {
      sellableRooms: roomsCount,
      soldRoomNights: soldNights,
      capacityRoomNights: capacity,
      rate: capacity ? round2((soldNights / capacity) * 100) : 0,
    },
    series,
  };
}
