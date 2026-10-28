import { Booking, Hotel, Payment, StaffAssignment, User } from '../models/index.js';
import { accessibleHotelIds, assertHotelAccess, hotelScopeFilter } from '../services/accessService.js';
import { audit } from '../services/auditService.js';
import { loadBookingFor } from '../services/bookingAccess.js';
import * as bookingService from '../services/bookingService.js';
import { notify } from '../services/notificationService.js';
import ApiError from '../utils/ApiError.js';
import { addDays, parseDateOnly } from '../utils/dates.js';
import { created, escapeRegex, ok, pageMeta, pageParams } from '../utils/respond.js';
import { paymentView } from './bookingController.js';

export async function myHotels(req, res) {
  const ids = await accessibleHotelIds(req.user);
  const filter = ids === null ? {} : { _id: { $in: ids } };
  const hotels = await Hotel.find(filter).select('name slug address status images starRating').sort({ name: 1 }).lean();
  ok(res, hotels);
}

export async function reservations(req, res) {
  const q = req.valid.query;
  const filter = await hotelScopeFilter(req.user, q.hotel);
  if (q.status) filter.status = q.status;
  if (q.paymentStatus) filter.paymentStatus = q.paymentStatus;
  if (q.from || q.to) {
    filter.checkIn = {};
    if (q.from) filter.checkIn.$gte = parseDateOnly(q.from);
    if (q.to) filter.checkIn.$lt = addDays(parseDateOnly(q.to), 1);
  }
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ confirmationCode: rx }, { 'guestDetails.name': rx }, { 'guestDetails.email': rx }];
  }
  const sort = { checkIn: { checkIn: 1 }, '-checkIn': { checkIn: -1 }, '-createdAt': { createdAt: -1 } }[q.sort];
  const { page, limit, skip } = pageParams(q, { defaultLimit: 20 });
  const [items, total] = await Promise.all([
    Booking.find(filter)
      .select('-statusHistory -pricing.nightly')
      .populate([{ path: 'hotel', select: 'name' }, { path: 'category', select: 'name' }, { path: 'room', select: 'roomNumber' }])
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Booking.countDocuments(filter),
  ]);
  ok(res, items, pageMeta({ page, limit }, total));
}

export async function reassignRoom(req, res) {
  const { booking } = await loadBookingFor(req.user, req.params.id, { allowOwner: false });
  const room = await bookingService.reassignRoom(booking, req.valid.body.roomId);
  await audit(req, { category: 'admin', action: 'booking.reassign_room', entityType: 'Booking', entityId: booking._id, details: { roomNumber: room.roomNumber } });
  await notify(booking.guest, {
    type: 'room_changed',
    title: 'Room updated',
    message: `Your booking ${booking.confirmationCode} has been moved to room ${room.roomNumber}.`,
    link: `/account/bookings/${booking._id}`,
  });
  ok(res, await Booking.findById(booking._id).populate('room', 'roomNumber'));
}

export async function refundQueue(req, res) {
  const scope = await hotelScopeFilter(req.user, req.query.hotel && /^[a-f\d]{24}$/i.test(req.query.hotel) ? req.query.hotel : undefined);
  const status = ['requested', 'processing', 'processed', 'failed', 'rejected'].includes(req.query.status) ? req.query.status : 'requested';
  const payments = await Payment.find({ ...scope, 'refunds.status': status })
    .populate({ path: 'booking', select: 'confirmationCode guestDetails status checkIn' })
    .populate('hotel', 'name')
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();
  const rows = payments.flatMap((p) =>
    p.refunds
      .filter((r) => r.status === status)
      .map((r) => ({ payment: { ...paymentView(p), hotel: p.hotel, booking: p.booking }, refund: r }))
  );
  ok(res, rows);
}

/* -------------------------------------------------------- staff assignment */

export async function listAssignments(req, res) {
  const filter = await hotelScopeFilter(req.user, req.query.hotel && /^[a-f\d]{24}$/i.test(req.query.hotel) ? req.query.hotel : undefined);
  const rows = await StaffAssignment.find(filter).populate('user', 'name email role status').populate('hotel', 'name').sort({ role: 1, createdAt: -1 }).lean();
  ok(res, rows.filter((r) => r.user));
}

/**
 * Admins can assign managers and staff to any hotel.
 * Managers can assign existing staff-role users to hotels they manage.
 * The user's account role must already match — assignment never changes roles.
 */
export async function createAssignment(req, res) {
  const { hotel, email, role, position } = req.valid.body;
  if (req.user.role === 'manager' && role !== 'staff') throw ApiError.forbidden('Managers can only assign staff');
  await assertHotelAccess(req.user, hotel, ['admin', 'manager']);
  if (!(await Hotel.exists({ _id: hotel }))) throw ApiError.notFound('Hotel not found');
  const user = await User.findOne({ email });
  if (!user) throw ApiError.notFound('No user with that email. They need to register first.');
  if (user.role !== role) {
    throw ApiError.unprocessable(`${user.name} has the "${user.role}" role. An administrator must change their role to "${role}" first.`, { code: 'ROLE_MISMATCH' });
  }
  const existing = await StaffAssignment.findOne({ user: user._id, hotel });
  let row;
  if (existing) {
    existing.set({ role, position, active: true, assignedBy: req.user._id });
    row = await existing.save();
  } else {
    row = await StaffAssignment.create({ user: user._id, hotel, role, position, assignedBy: req.user._id });
  }
  await audit(req, { category: 'admin', action: 'staff.assign', entityType: 'StaffAssignment', entityId: row._id, details: { user: user.email, hotel, role } });
  await notify(user._id, { type: 'assignment', title: 'New hotel assignment', message: `You have been assigned to a hotel as ${role}${position ? ` (${position})` : ''}.`, link: role === 'manager' ? '/manager' : '/staff' });
  created(res, await row.populate([{ path: 'user', select: 'name email role' }, { path: 'hotel', select: 'name' }]));
}

export async function updateAssignment(req, res) {
  const row = await StaffAssignment.findById(req.params.id);
  if (!row) throw ApiError.notFound('Assignment not found');
  await assertHotelAccess(req.user, row.hotel, ['admin', 'manager']);
  if (req.user.role === 'manager' && row.role !== 'staff') throw ApiError.forbidden('Managers can only manage staff assignments');
  row.set(req.valid.body);
  await row.save();
  await audit(req, { category: 'admin', action: 'staff.update_assignment', entityType: 'StaffAssignment', entityId: row._id, details: req.valid.body });
  ok(res, row);
}

export async function deleteAssignment(req, res) {
  const row = await StaffAssignment.findById(req.params.id);
  if (!row) throw ApiError.notFound('Assignment not found');
  await assertHotelAccess(req.user, row.hotel, ['admin', 'manager']);
  if (req.user.role === 'manager' && row.role !== 'staff') throw ApiError.forbidden('Managers can only manage staff assignments');
  if (String(row.user) === String(req.user._id)) throw ApiError.unprocessable('You cannot remove your own assignment');
  await row.deleteOne();
  await audit(req, { category: 'admin', action: 'staff.unassign', entityType: 'StaffAssignment', entityId: row._id, details: { user: String(row.user), hotel: String(row.hotel) } });
  ok(res, { deleted: true });
}
