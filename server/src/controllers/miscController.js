import mongoose from 'mongoose';
import config from '../config/index.js';
import { dbState } from '../config/db.js';
import { Booking, Hotel, HousekeepingTask, Notification, Payment, Review, Room, ServiceRequest, User, AuditLog } from '../models/index.js';
import { accessibleHotelIds } from '../services/accessService.js';
import { summary } from '../services/analyticsService.js';
import { getDevOutbox } from '../services/emailService.js';
import { adminIds, notify } from '../services/notificationService.js';
import { publicPaymentConfig } from '../services/paymentService.js';
import { recomputeHotelRating } from '../services/reviewService.js';
import { cancellationPolicyText, getSettings, publicSettings } from '../services/settingsService.js';
import { storageMode } from '../services/uploadService.js';
import { sendEmail, templates } from '../services/emailService.js';
import ApiError from '../utils/ApiError.js';
import { addDays, parseDateOnly, toDateString, todayInZone } from '../utils/dates.js';
import { created, ok, pageMeta, pageParams } from '../utils/respond.js';
import { publicReview } from './catalogController.js';
import { paymentView } from './bookingController.js';

const startedAt = Date.now();

export async function health(_req, res) {
  const db = dbState();
  res.status(db === 'connected' ? 200 : 503).json({
    success: db === 'connected',
    data: { status: db === 'connected' ? 'ok' : 'degraded', db, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), env: config.env, version: '1.0.0' },
  });
}

export async function publicConfig(_req, res) {
  const s = await getSettings();
  ok(res, {
    ...publicSettings(s),
    cancellationPolicy: cancellationPolicyText(s),
    payment: publicPaymentConfig(),
    emailDelivery: config.smtp.configured ? 'smtp' : 'disabled',
    imageStorage: storageMode(),
    timezone: config.timezone,
    today: toDateString(todayInZone(config.timezone)),
  });
}

export async function contact(req, res) {
  const { name, email, subject, message } = req.valid.body;
  const admins = await adminIds();
  await notify(admins, {
    type: 'contact_message',
    title: `Contact: ${subject}`.slice(0, 140),
    message: `${name} <${email}>: ${message}`.slice(0, 1000),
    link: '/admin/notifications',
  });
  const s = await getSettings();
  const mail = await sendEmail({ to: s.supportEmail, ...templates.generic(`Contact form: ${subject}`, `From ${name} <${email}>\n\n${message}`) });
  created(res, { received: true, emailForwarded: mail.delivered });
}

export function devOutbox(_req, res) {
  if (config.isProd) throw ApiError.notFound('Route not found');
  ok(res, getDevOutbox());
}

/* ------------------------------------------------------------- reviews */

export async function createReview(req, res) {
  const { bookingId, rating, title, comment } = req.valid.body;
  const booking = await Booking.findOne({ _id: bookingId, guest: req.user._id });
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.status !== 'checked_out') throw ApiError.unprocessable('You can review a stay after checking out');
  if (await Review.exists({ booking: booking._id })) throw ApiError.conflict('You already reviewed this stay');
  const review = await Review.create({ booking: booking._id, hotel: booking.hotel, category: booking.category, guest: req.user._id, rating, title, comment });
  booking.reviewed = true;
  await booking.save();
  await recomputeHotelRating(booking.hotel);
  created(res, review);
}

export async function myReviews(req, res) {
  const items = await Review.find({ guest: req.user._id }).populate('hotel', 'name slug').sort({ createdAt: -1 }).lean();
  ok(res, items);
}

export async function hotelReviews(req, res) {
  const { page, limit, skip } = pageParams(req.query, { defaultLimit: 10 });
  const filter = { hotel: req.valid.params.id, status: 'published' };
  const [items, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('guest', 'name').lean(),
    Review.countDocuments(filter),
  ]);
  ok(res, items.map(publicReview), pageMeta({ page, limit }, total));
}

/* ------------------------------------------------------- notifications */

export async function listNotifications(req, res) {
  const filter = { user: req.user._id };
  if (req.query.unread === 'true') filter.read = false;
  const { page, limit, skip } = pageParams(req.query, { defaultLimit: 20 });
  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);
  ok(res, items, { ...pageMeta({ page, limit }, total), unread });
}

export async function unreadCount(req, res) {
  ok(res, { unread: await Notification.countDocuments({ user: req.user._id, read: false }) });
}

export async function markRead(req, res) {
  const n = await Notification.findOneAndUpdate({ _id: req.valid.params.id, user: req.user._id }, { read: true, readAt: new Date() }, { returnDocument: 'after' });
  if (!n) throw ApiError.notFound('Notification not found');
  ok(res, n);
}

export async function markAllRead(req, res) {
  const r = await Notification.updateMany({ user: req.user._id, read: false }, { read: true, readAt: new Date() });
  ok(res, { updated: r.modifiedCount });
}

/* ----------------------------------------------------- analytics/dashboards */

function period(query, defaultDays = 30) {
  const today = todayInZone(config.timezone);
  const to = query.to ? parseDateOnly(query.to) : today;
  const from = query.from ? parseDateOnly(query.from) : addDays(to, -(defaultDays - 1));
  if (from > to) throw ApiError.badRequest('"from" must be on or before "to"');
  if ((to - from) / 86400000 > 366) throw ApiError.badRequest('The period can be at most one year');
  return { from, to };
}

async function scopedHotelIds(user, requested) {
  const ids = await accessibleHotelIds(user);
  if (requested) {
    if (ids !== null && !ids.includes(String(requested))) throw ApiError.forbidden('You are not assigned to this hotel');
    return [String(requested)];
  }
  return ids;
}

export async function analyticsSummary(req, res) {
  const { from, to } = period(req.valid.query);
  const hotelIds = await scopedHotelIds(req.user, req.valid.query.hotel);
  ok(res, await summary(hotelIds, from, to));
}

export async function guestDashboard(req, res) {
  const today = todayInZone(config.timezone);
  const base = { guest: req.user._id };
  const pop = [{ path: 'hotel', select: 'name slug address images' }, { path: 'category', select: 'name images' }];
  const [upcoming, past, payments, unread, counts] = await Promise.all([
    Booking.find({ ...base, status: { $in: ['pending', 'confirmed', 'checked_in'] }, checkOut: { $gte: today } }).sort({ checkIn: 1 }).limit(5).populate(pop).lean(),
    Booking.find({ ...base, status: { $in: ['checked_out', 'no_show'] } }).sort({ checkIn: -1 }).limit(5).populate(pop).lean(),
    Payment.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(5).populate('booking', 'confirmationCode').lean(),
    Notification.find({ user: req.user._id, read: false }).sort({ createdAt: -1 }).limit(5).lean(),
    Booking.aggregate([{ $match: { guest: req.user._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  ok(res, {
    upcoming,
    past,
    payments: payments.map((p) => ({ ...paymentView(p), booking: p.booking })),
    notifications: unread,
    statusCounts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
  });
}

export async function staffDashboard(req, res) {
  const ids = await accessibleHotelIds(req.user);
  const requested = req.valid.query.hotel;
  if (requested && ids !== null && !ids.includes(String(requested))) throw ApiError.forbidden('You are not assigned to this hotel');
  const hotel = requested ?? ids?.[0];
  if (!hotel) throw ApiError.forbidden('You are not assigned to any hotel yet');
  const today = todayInZone(config.timezone);
  const h = new mongoose.Types.ObjectId(String(hotel));
  const [arrivals, departures, inHouse, hk, sr, rooms, hotelDoc] = await Promise.all([
    Booking.countDocuments({ hotel: h, checkIn: today, status: 'confirmed' }),
    Booking.countDocuments({ hotel: h, checkOut: today, status: 'checked_in' }),
    Booking.countDocuments({ hotel: h, status: 'checked_in' }),
    HousekeepingTask.find({ hotel: h, status: { $ne: 'done' } }).populate('room', 'roomNumber').populate('assignedTo', 'name').sort({ priority: -1, createdAt: 1 }).limit(8).lean(),
    ServiceRequest.find({ hotel: h, status: { $in: ['open', 'in_progress'] } }).populate('room', 'roomNumber').sort({ createdAt: 1 }).limit(8).lean(),
    Room.aggregate([{ $match: { hotel: h } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Hotel.findById(h).select('name').lean(),
  ]);
  ok(res, {
    hotel: hotelDoc,
    today: toDateString(today),
    counts: {
      arrivalsPending: arrivals,
      departuresPending: departures,
      inHouse,
      housekeepingOpen: await HousekeepingTask.countDocuments({ hotel: h, status: { $ne: 'done' } }),
      requestsOpen: await ServiceRequest.countDocuments({ hotel: h, status: { $in: ['open', 'in_progress'] } }),
    },
    roomStatus: Object.fromEntries(rooms.map((r) => [r._id, r.n])),
    housekeeping: hk,
    requests: sr,
  });
}

export async function adminDashboard(req, res) {
  const { from, to } = period(req.valid.query);
  const [users, usersByRole, hotels, rooms, bookings, analytics, activity, pendingRefunds, pendingReviews] = await Promise.all([
    User.countDocuments(),
    User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
    Hotel.countDocuments({ status: 'active' }),
    Room.countDocuments(),
    Booking.countDocuments(),
    summary(null, from, to),
    AuditLog.find().sort({ createdAt: -1 }).limit(10).lean(),
    Payment.countDocuments({ 'refunds.status': 'requested' }),
    Review.countDocuments({ status: 'hidden' }),
  ]);
  ok(res, {
    totals: { users, hotels, rooms, bookings, pendingRefunds, hiddenReviews: pendingReviews },
    usersByRole: Object.fromEntries(usersByRole.map((r) => [r._id, r.n])),
    analytics,
    activity,
  });
}
