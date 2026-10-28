import config from '../config/index.js';
import { Booking, HousekeepingTask, Room, ServiceRequest, StaffAssignment } from '../models/index.js';
import { accessibleHotelIds, assertHotelAccess, hotelScopeFilter } from '../services/accessService.js';
import { audit } from '../services/auditService.js';
import { loadBookingFor } from '../services/bookingAccess.js';
import * as bookingService from '../services/bookingService.js';
import { hotelTeamIds, notify } from '../services/notificationService.js';
import ApiError from '../utils/ApiError.js';
import { addDays, parseDateOnly, toDateString, todayInZone } from '../utils/dates.js';
import { created, escapeRegex, ok, pageMeta, pageParams } from '../utils/respond.js';

const BOOKING_LIST_FIELDS = 'confirmationCode guestDetails checkIn checkOut nights guests status paymentStatus room category hotel pricing.total specialRequests';

/** Resolves which hotel a staff screen is about (explicit ?hotel= or the user's first assignment). */
async function resolveHotel(user, requested) {
  if (requested) {
    await assertHotelAccess(user, requested);
    return requested;
  }
  const ids = await accessibleHotelIds(user);
  if (ids === null) throw ApiError.badRequest('Select a hotel');
  if (!ids.length) throw ApiError.forbidden('You are not assigned to any hotel yet');
  return ids[0];
}

/* ------------------------------------------------------------ front desk */

export async function frontDesk(req, res) {
  const hotel = await resolveHotel(req.user, req.valid.query.hotel);
  const today = todayInZone(config.timezone);
  const populate = [
    { path: 'room', select: 'roomNumber status' },
    { path: 'category', select: 'name' },
  ];
  const [arrivals, departures, inHouse, overdue] = await Promise.all([
    Booking.find({ hotel, checkIn: today, status: { $in: ['confirmed', 'checked_in'] } }).select(BOOKING_LIST_FIELDS).populate(populate).sort({ 'guestDetails.name': 1 }).lean(),
    Booking.find({ hotel, checkOut: today, status: { $in: ['checked_in', 'checked_out'] } }).select(BOOKING_LIST_FIELDS).populate(populate).sort({ 'guestDetails.name': 1 }).lean(),
    Booking.find({ hotel, status: 'checked_in' }).select(BOOKING_LIST_FIELDS).populate(populate).sort({ checkOut: 1 }).lean(),
    Booking.find({ hotel, status: 'checked_in', checkOut: { $lt: today } }).select(BOOKING_LIST_FIELDS).populate(populate).lean(),
  ]);
  ok(res, { hotel, today: toDateString(today), arrivals, departures, inHouse, overdueDepartures: overdue });
}

export async function lookup(req, res) {
  const { q, hotel } = req.valid.query;
  const scope = await hotelScopeFilter(req.user, hotel);
  const rx = new RegExp(escapeRegex(q), 'i');
  const items = await Booking.find({
    ...scope,
    $or: [{ confirmationCode: rx }, { 'guestDetails.name': rx }, { 'guestDetails.email': rx }, { 'guestDetails.phone': rx }],
  })
    .select(BOOKING_LIST_FIELDS)
    .populate([{ path: 'room', select: 'roomNumber' }, { path: 'category', select: 'name' }, { path: 'hotel', select: 'name' }])
    .sort({ checkIn: -1 })
    .limit(25)
    .lean();
  ok(res, items);
}

export async function checkIn(req, res) {
  const { booking } = await loadBookingFor(req.user, req.params.id, { allowOwner: false });
  const updated = await bookingService.checkIn(booking, req.user, { roomId: req.valid.body.roomId });
  await audit(req, { category: 'activity', action: 'booking.check_in', entityType: 'Booking', entityId: booking._id, details: { code: booking.confirmationCode } });
  ok(res, updated);
}

export async function checkOut(req, res) {
  const { booking } = await loadBookingFor(req.user, req.params.id, { allowOwner: false });
  const updated = await bookingService.checkOut(booking, req.user);
  await audit(req, { category: 'activity', action: 'booking.check_out', entityType: 'Booking', entityId: booking._id, details: { code: booking.confirmationCode } });
  ok(res, updated);
}

export async function noShow(req, res) {
  const { booking } = await loadBookingFor(req.user, req.params.id, { allowOwner: false });
  const updated = await bookingService.markNoShow(booking, req.user);
  await audit(req, { category: 'activity', action: 'booking.no_show', entityType: 'Booking', entityId: booking._id });
  ok(res, updated);
}

/* ---------------------------------------------------------- housekeeping */

export async function listHousekeeping(req, res) {
  const { status, hotel } = req.valid.query;
  const filter = await hotelScopeFilter(req.user, hotel);
  if (status) filter.status = status;
  const { page, limit, skip } = pageParams(req.valid.query, { defaultLimit: 50 });
  const [items, total] = await Promise.all([
    HousekeepingTask.find(filter)
      .populate('room', 'roomNumber floor status')
      .populate('assignedTo', 'name')
      .populate('hotel', 'name')
      .sort({ status: 1, priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    HousekeepingTask.countDocuments(filter),
  ]);
  ok(res, items, pageMeta({ page, limit }, total));
}

async function assertAssignee(hotel, userId) {
  if (!userId) return;
  const ok_ = await StaffAssignment.exists({ hotel, user: userId, active: true });
  if (!ok_) throw ApiError.badRequest('That team member is not assigned to this hotel');
}

export async function createHousekeeping(req, res) {
  const body = req.valid.body;
  await assertHotelAccess(req.user, body.hotel);
  const room = await Room.findOne({ _id: body.room, hotel: body.hotel });
  if (!room) throw ApiError.badRequest('Room not found in this hotel');
  await assertAssignee(body.hotel, body.assignedTo);
  const task = await HousekeepingTask.create({ ...body, dueDate: body.dueDate ? parseDateOnly(body.dueDate) : undefined, createdBy: req.user._id });
  if (body.assignedTo) {
    await notify(body.assignedTo, { type: 'task_assigned', title: 'New housekeeping task', message: `Room ${room.roomNumber}: ${body.type.replace('_', ' ')}`, link: '/staff/housekeeping' });
  }
  created(res, task);
}

export async function updateHousekeeping(req, res) {
  const task = await HousekeepingTask.findById(req.params.id);
  if (!task) throw ApiError.notFound('Task not found');
  await assertHotelAccess(req.user, task.hotel);
  const patch = req.valid.body;
  if (patch.assignedTo) await assertAssignee(task.hotel, patch.assignedTo);
  const wasDone = task.status === 'done';
  task.set(patch);
  if (patch.status === 'done' && !wasDone) task.completedAt = new Date();
  if (patch.status && patch.status !== 'done') task.completedAt = undefined;
  await task.save();
  // Finishing a clean returns a room in "cleaning" to sale.
  if (patch.status === 'done' && !wasDone && ['checkout_clean', 'deep_clean', 'inspection'].includes(task.type)) {
    await Room.updateOne({ _id: task.room, status: 'cleaning' }, { status: 'available' });
  }
  if (patch.status === 'in_progress' && task.type === 'maintenance') {
    await Room.updateOne({ _id: task.room, status: { $in: ['available', 'cleaning'] } }, { status: 'maintenance' });
  }
  if (patch.status === 'done' && task.type === 'maintenance') {
    await Room.updateOne({ _id: task.room, status: 'maintenance' }, { status: 'available' });
  }
  ok(res, await task.populate([{ path: 'room', select: 'roomNumber floor status' }, { path: 'assignedTo', select: 'name' }]));
}

/* ------------------------------------------------------ service requests */

export async function createServiceRequest(req, res) {
  const body = req.valid.body;
  const { booking, asOwner } = await loadBookingFor(req.user, body.bookingId, { teamRoles: [] });
  if (!asOwner) throw ApiError.notFound('Booking not found');
  if (!['confirmed', 'checked_in'].includes(booking.status)) {
    throw ApiError.unprocessable('Service requests are available for upcoming and current stays');
  }
  const open = await ServiceRequest.countDocuments({ booking: booking._id, status: { $in: ['open', 'in_progress'] } });
  if (open >= 10) throw ApiError.unprocessable('You have too many open requests for this stay');
  const sr = await ServiceRequest.create({
    hotel: booking.hotel,
    booking: booking._id,
    guest: req.user._id,
    room: booking.room,
    type: body.type,
    description: body.description,
    priority: body.priority,
  });
  await notify(await hotelTeamIds(booking.hotel, ['staff', 'manager']), {
    type: 'service_request',
    title: 'New guest request',
    message: `${booking.guestDetails.name} (${booking.confirmationCode}): ${body.type.replace('_', ' ')} — ${body.description.slice(0, 80)}`,
    link: '/staff/requests',
  });
  created(res, sr);
}

export async function myServiceRequests(req, res) {
  const items = await ServiceRequest.find({ guest: req.user._id }).populate('hotel', 'name').populate({ path: 'booking', select: 'confirmationCode' }).sort({ createdAt: -1 }).limit(100).lean();
  ok(res, items);
}

export async function cancelMyServiceRequest(req, res) {
  const sr = await ServiceRequest.findOne({ _id: req.params.id, guest: req.user._id });
  if (!sr) throw ApiError.notFound('Request not found');
  if (sr.status !== 'open') throw ApiError.unprocessable('Only open requests can be cancelled');
  sr.status = 'cancelled';
  await sr.save();
  ok(res, sr);
}

export async function listServiceRequests(req, res) {
  const { status, hotel } = req.valid.query;
  const filter = await hotelScopeFilter(req.user, hotel);
  if (status) filter.status = status;
  const { page, limit, skip } = pageParams(req.valid.query, { defaultLimit: 50 });
  const [items, total] = await Promise.all([
    ServiceRequest.find(filter)
      .populate('room', 'roomNumber')
      .populate('assignedTo', 'name')
      .populate('hotel', 'name')
      .populate({ path: 'booking', select: 'confirmationCode guestDetails.name' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ServiceRequest.countDocuments(filter),
  ]);
  ok(res, items, pageMeta({ page, limit }, total));
}

export async function updateServiceRequest(req, res) {
  const sr = await ServiceRequest.findById(req.params.id);
  if (!sr) throw ApiError.notFound('Request not found');
  await assertHotelAccess(req.user, sr.hotel);
  const patch = req.valid.body;
  if (patch.assignedTo) await assertAssignee(sr.hotel, patch.assignedTo);
  const before = sr.status;
  sr.set(patch);
  if (patch.status === 'resolved' && before !== 'resolved') sr.resolvedAt = new Date();
  await sr.save();
  if (patch.status && patch.status !== before) {
    await notify(sr.guest, {
      type: 'service_request_update',
      title: 'Request update',
      message: `Your ${sr.type.replace('_', ' ')} request is now ${patch.status.replace('_', ' ')}.${patch.staffNote ? ` Note: ${patch.staffNote}` : ''}`,
      link: `/account/bookings/${sr.booking}`,
    });
  }
  ok(res, await sr.populate([{ path: 'room', select: 'roomNumber' }, { path: 'assignedTo', select: 'name' }]));
}

/* ------------------------------------------------------------- team list */

export async function hotelTeam(req, res) {
  const hotel = await resolveHotel(req.user, req.valid.query.hotel);
  const rows = await StaffAssignment.find({ hotel, active: true }).populate('user', 'name email role status').lean();
  ok(res, rows.filter((r) => r.user).map((r) => ({ _id: r.user._id, name: r.user.name, role: r.role, position: r.position })));
}

/* -------------------------------------------- upcoming movements (7 days) */

export async function upcomingMovements(req, res) {
  const hotel = await resolveHotel(req.user, req.valid.query.hotel);
  const today = todayInZone(config.timezone);
  const until = addDays(today, 7);
  const [arrivals, departures] = await Promise.all([
    Booking.find({ hotel, status: 'confirmed', checkIn: { $gte: today, $lt: until } }).select(BOOKING_LIST_FIELDS).populate('category', 'name').sort({ checkIn: 1 }).limit(50).lean(),
    Booking.find({ hotel, status: { $in: ['confirmed', 'checked_in'] }, checkOut: { $gte: today, $lt: until } }).select(BOOKING_LIST_FIELDS).populate('category', 'name').sort({ checkOut: 1 }).limit(50).lean(),
  ]);
  ok(res, { arrivals, departures });
}
