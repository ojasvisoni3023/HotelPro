import { AuditLog, Payment, Review, StaffAssignment, User } from '../models/index.js';
import { audit } from '../services/auditService.js';
import { notify } from '../services/notificationService.js';
import { recomputeHotelRating } from '../services/reviewService.js';
import { getSettings, updateSettings } from '../services/settingsService.js';
import ApiError from '../utils/ApiError.js';
import { escapeRegex, ok, pageMeta, pageParams } from '../utils/respond.js';
import { paymentView } from './bookingController.js';

export async function listUsers(req, res) {
  const { q, role, status } = req.valid.query;
  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const { page, limit, skip } = pageParams(req.valid.query, { defaultLimit: 20 });
  const [items, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit), User.countDocuments(filter)]);
  ok(res, items, pageMeta({ page, limit }, total));
}

export async function updateUser(req, res) {
  const target = await User.findById(req.params.id);
  if (!target) throw ApiError.notFound('User not found');
  const { role, status, emailVerified } = req.valid.body;
  const self = String(target._id) === String(req.user._id);
  if (self && (role !== undefined || status !== undefined)) {
    throw ApiError.unprocessable('You cannot change your own role or status', { code: 'SELF_CHANGE' });
  }
  if (target.role === 'admin' && (role && role !== 'admin' || status === 'suspended')) {
    const admins = await User.countDocuments({ role: 'admin', status: 'active' });
    if (admins <= 1) throw ApiError.unprocessable('At least one active administrator is required');
  }

  const before = { role: target.role, status: target.status, emailVerified: target.emailVerified };
  let revoke = false;
  if (role && role !== target.role) {
    target.role = role;
    revoke = true;
    // Assignments are role-specific; a role change deactivates them.
    await StaffAssignment.updateMany({ user: target._id }, { active: false });
  }
  if (status && status !== target.status) {
    target.status = status;
    revoke = true;
  }
  if (emailVerified !== undefined && emailVerified !== target.emailVerified) {
    target.emailVerified = emailVerified;
    target.emailVerifiedAt = emailVerified ? new Date() : undefined;
  }
  if (revoke) target.tokenVersion = (target.tokenVersion ?? 0) + 1; // force re-login with new permissions
  await target.save();

  await audit(req, {
    category: role ? 'security' : 'admin',
    action: role && role !== before.role ? 'user.role_change' : status && status !== before.status ? `user.${status}` : 'user.update',
    entityType: 'User',
    entityId: target._id,
    details: { email: target.email, before, after: { role: target.role, status: target.status, emailVerified: target.emailVerified } },
  });
  if (role && role !== before.role) {
    await notify(target._id, { type: 'role_changed', title: 'Account role updated', message: `Your account role is now "${role}". Please sign in again.`, link: '/' });
  }
  ok(res, target);
}

export async function listPayments(req, res) {
  const { status, provider, hotel, q } = req.valid.query;
  const filter = {};
  if (status) filter.status = status;
  if (provider) filter.provider = provider;
  if (hotel) filter.hotel = hotel;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ providerOrderId: rx }, { providerPaymentId: rx }];
  }
  const { page, limit, skip } = pageParams(req.valid.query, { defaultLimit: 20 });
  const [items, total] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('hotel', 'name')
      .populate('user', 'name email')
      .populate('booking', 'confirmationCode')
      .lean(),
    Payment.countDocuments(filter),
  ]);
  ok(res, items.map((p) => ({ ...paymentView(p), hotel: p.hotel, user: p.user, booking: p.booking })), pageMeta({ page, limit }, total));
}

export async function listReviews(req, res) {
  const { status, hotel, rating } = req.valid.query;
  const filter = {};
  if (status) filter.status = status;
  if (hotel) filter.hotel = hotel;
  if (rating) filter.rating = rating;
  const { page, limit, skip } = pageParams(req.valid.query, { defaultLimit: 20 });
  const [items, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('hotel', 'name').populate('guest', 'name email').lean(),
    Review.countDocuments(filter),
  ]);
  ok(res, items, pageMeta({ page, limit }, total));
}

export async function moderateReview(req, res) {
  const review = await Review.findById(req.params.id);
  if (!review) throw ApiError.notFound('Review not found');
  review.status = req.valid.body.status;
  review.moderationNote = req.valid.body.moderationNote;
  review.moderatedBy = req.user._id;
  await review.save();
  await recomputeHotelRating(review.hotel);
  await audit(req, { category: 'admin', action: `review.${review.status === 'hidden' ? 'hide' : 'publish'}`, entityType: 'Review', entityId: review._id, details: { note: review.moderationNote } });
  ok(res, review);
}

export async function auditLogs(req, res) {
  const { category, q } = req.valid.query;
  const filter = {};
  if (category) filter.category = category;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ action: rx }, { actorEmail: rx }, { entityType: rx }];
  }
  const { page, limit, skip } = pageParams(req.valid.query, { defaultLimit: 30 });
  const [items, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), AuditLog.countDocuments(filter)]);
  ok(res, items, pageMeta({ page, limit }, total));
}

export async function getPlatformSettings(_req, res) {
  ok(res, await getSettings({ fresh: true }));
}

export async function patchPlatformSettings(req, res) {
  const before = await getSettings({ fresh: true });
  const after = await updateSettings(req.valid.body, req.user._id);
  const changed = Object.fromEntries(Object.keys(req.valid.body).map((k) => [k, { from: before[k], to: after[k] }]));
  await audit(req, { category: 'admin', action: 'settings.update', entityType: 'Setting', entityId: 'platform', details: changed });
  ok(res, after);
}
