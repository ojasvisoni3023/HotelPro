import mongoose from 'mongoose';
import { Booking, Room, RoomNight } from '../models/index.js';
import { UNSELLABLE_ROOM_STATUSES } from '../models/Room.js';
import { eachNight } from '../utils/dates.js';
import logger from '../utils/logger.js';

const ids = (arr) => arr.map((x) => new mongoose.Types.ObjectId(String(x)));

/** A lock blocks a night if it belongs to a confirmed booking (expiresAt null) or an unexpired hold. */
function blockingLockFilter(now = new Date()) {
  return { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] };
}

/**
 * Number of free physical rooms per room type for [checkIn, checkOut).
 * Returns Map<categoryId, { total, available }>.
 */
export async function availabilityByCategory(categoryIds, checkIn, checkOut, now = new Date()) {
  const catIds = ids(categoryIds);
  const [rooms, blocked] = await Promise.all([
    Room.aggregate([
      { $match: { category: { $in: catIds }, status: { $nin: UNSELLABLE_ROOM_STATUSES } } },
      { $group: { _id: '$category', rooms: { $addToSet: '$_id' } } },
    ]),
    RoomNight.aggregate([
      { $match: { category: { $in: catIds }, date: { $gte: checkIn, $lt: checkOut }, ...blockingLockFilter(now) } },
      { $group: { _id: '$category', rooms: { $addToSet: '$room' } } },
    ]),
  ]);
  const blockedBy = new Map(blocked.map((b) => [String(b._id), new Set(b.rooms.map(String))]));
  const out = new Map(catIds.map((c) => [String(c), { total: 0, available: 0 }]));
  for (const r of rooms) {
    const busy = blockedBy.get(String(r._id)) ?? new Set();
    out.set(String(r._id), { total: r.rooms.length, available: r.rooms.filter((x) => !busy.has(String(x))).length });
  }
  return out;
}

/** True when a specific room is free for the whole range (ignoring locks owned by `exceptBooking`). */
export async function isRoomFree(roomId, checkIn, checkOut, exceptBooking) {
  const filter = { room: roomId, date: { $gte: checkIn, $lt: checkOut }, ...blockingLockFilter() };
  if (exceptBooking) filter.booking = { $ne: exceptBooking };
  return !(await RoomNight.exists(filter));
}

/**
 * Expires a pending booking whose hold has lapsed and releases its held nights.
 * Conditional updates make this safe to race with payment confirmation.
 */
export async function expireHold(bookingId, now = new Date()) {
  const expired = await Booking.findOneAndUpdate(
    { _id: bookingId, status: 'pending', holdExpiresAt: { $lte: now } },
    { $set: { status: 'expired' }, $push: { statusHistory: { status: 'expired', at: now, note: 'Payment hold expired' } } },
    { returnDocument: 'after' }
  );
  // Only unconfirmed (expiring) locks are removed; confirmed locks have expiresAt = null.
  await RoomNight.deleteMany({ booking: bookingId, expiresAt: { $ne: null, $lte: now } });
  return Boolean(expired);
}

/** Periodic sweep of lapsed holds. */
export async function sweepExpiredHolds(now = new Date()) {
  const stale = await Booking.find({ status: 'pending', holdExpiresAt: { $lte: now } }).select('_id').limit(500).lean();
  let count = 0;
  for (const b of stale) if (await expireHold(b._id, now)) count++;
  // Orphaned expiring locks (e.g. a crash between insert and booking save).
  await RoomNight.deleteMany({ expiresAt: { $ne: null, $lte: new Date(now.getTime() - 60 * 60 * 1000) } });
  if (count) logger.info(`Released ${count} expired booking hold(s)`);
  return count;
}

/** Tries to lock every night of the stay for one room. Returns true on success. */
async function lockRoom({ room, bookingId, hotel, category, nights, expiresAt }) {
  const docs = nights.map((date) => ({ room: room._id, date, booking: bookingId, hotel, category, expiresAt }));
  try {
    await RoomNight.insertMany(docs, { ordered: true });
    return true;
  } catch (err) {
    // Roll back any nights inserted before the conflicting one.
    await RoomNight.deleteMany({ booking: bookingId, room: room._id });
    if (err?.code === 11000 || err?.writeErrors?.some?.((e) => e.code === 11000)) return false;
    throw err;
  }
}

/**
 * Atomically reserves one free physical room of the given type.
 * Concurrency: the unique (room, date) index guarantees at most one booking wins each room-night.
 */
export async function acquireRoom({ bookingId, hotel, category, checkIn, checkOut, expiresAt = null, preferredRoomId, now = new Date() }) {
  const nights = eachNight(checkIn, checkOut);
  const rooms = await Room.find({ category, status: { $nin: UNSELLABLE_ROOM_STATUSES } }).sort({ roomNumber: 1 }).lean();
  if (!rooms.length) return null;

  // Reclaim lapsed holds on these nights so abandoned checkouts do not block inventory.
  const lapsed = await RoomNight.find({
    room: { $in: rooms.map((r) => r._id) },
    date: { $gte: checkIn, $lt: checkOut },
    expiresAt: { $ne: null, $lte: now },
  })
    .select('booking')
    .lean();
  for (const bId of new Set(lapsed.map((l) => String(l.booking)))) await expireHold(bId, now);

  const busy = await RoomNight.distinct('room', {
    room: { $in: rooms.map((r) => r._id) },
    date: { $gte: checkIn, $lt: checkOut },
    ...blockingLockFilter(now),
  });
  const busySet = new Set(busy.map(String));
  const candidates = rooms.filter((r) => !busySet.has(String(r._id)));
  if (preferredRoomId) candidates.sort((a) => (String(a._id) === String(preferredRoomId) ? -1 : 1));

  for (const room of candidates) {
    if (await lockRoom({ room, bookingId, hotel, category, nights, expiresAt })) return room;
  }
  return null;
}

/** Locks a specific room (used for room reassignment). */
export async function acquireSpecificRoom({ room, bookingId, hotel, category, checkIn, checkOut, expiresAt = null }) {
  return lockRoom({ room, bookingId, hotel, category, nights: eachNight(checkIn, checkOut), expiresAt });
}

export async function releaseBooking(bookingId, { fromDate } = {}) {
  const filter = { booking: bookingId };
  if (fromDate) filter.date = { $gte: fromDate };
  await RoomNight.deleteMany(filter);
}

/** Converts a booking's hold into permanent locks. Returns the number of nights still held. */
export async function confirmLocks(bookingId) {
  await RoomNight.updateMany({ booking: bookingId, expiresAt: { $ne: null } }, { $set: { expiresAt: null } });
  return RoomNight.countDocuments({ booking: bookingId });
}
