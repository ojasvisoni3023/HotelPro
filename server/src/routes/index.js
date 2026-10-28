import { Router } from 'express';
import * as admin from '../controllers/adminController.js';
import * as booking from '../controllers/bookingController.js';
import * as mgmt from '../controllers/managementController.js';
import * as misc from '../controllers/miscController.js';
import * as ops from '../controllers/operationsController.js';
import * as pay from '../controllers/paymentController.js';
import { authenticate, authorize, requireVerifiedEmail } from '../middleware/auth.js';
import { bookingLimiter, contactLimiter } from '../middleware/security.js';
import { validate } from '../middleware/validate.js';
import * as va from '../validators/admin.js';
import * as vb from '../validators/booking.js';
import { idParam } from '../validators/common.js';
import authRoutes from './authRoutes.js';
import { hotelRoutes, roomRoutes, roomTypeRoutes, searchRoutes } from './catalogRoutes.js';

const api = Router();
const TEAM = ['admin', 'manager', 'staff'];

api.get('/health', misc.health);
api.get('/config', misc.publicConfig);
api.post('/contact', contactLimiter, validate({ body: va.contactSchema }), misc.contact);
api.get('/dev/outbox', misc.devOutbox);

api.use('/auth', authRoutes);
api.use('/hotels', hotelRoutes);
api.get('/hotels/:id/reviews', validate({ params: idParam }), misc.hotelReviews);
api.use('/room-types', roomTypeRoutes);
api.use('/rooms', roomRoutes);
api.use('/search', searchRoutes);

/* bookings (guest-facing; team access is checked per booking) */
api.post('/bookings', bookingLimiter, authenticate, requireVerifiedEmail, validate({ body: vb.createBookingSchema }), booking.createBooking);
api.get('/bookings/mine', authenticate, validate({ query: vb.myBookingsQuery }), booking.myBookings);
api.get('/bookings/:id', authenticate, validate({ params: idParam }), booking.getBooking);
api.post('/bookings/:id/cancel', authenticate, validate({ params: idParam, body: vb.cancelSchema }), booking.cancelBooking);
api.get('/bookings/:id/invoice', authenticate, validate({ params: idParam }), booking.invoice);

/* payments */
api.get('/payments/config', pay.config);
api.get('/payments/mine', authenticate, pay.myPayments);
api.post('/payments/orders', bookingLimiter, authenticate, validate({ body: vb.orderSchema }), pay.createOrder);
api.post('/payments/razorpay/verify', authenticate, validate({ body: vb.razorpayVerifySchema }), pay.verifyRazorpay);
api.post('/payments/mock/complete', authenticate, validate({ body: vb.mockCompleteSchema }), pay.completeMock);
// POST /payments/webhook/razorpay is mounted in app.js with a raw body parser.

/* reviews */
api.post('/reviews', authenticate, validate({ body: vb.reviewCreateSchema }), misc.createReview);
api.get('/reviews/mine', authenticate, misc.myReviews);

/* notifications */
api.get('/notifications', authenticate, misc.listNotifications);
api.get('/notifications/unread-count', authenticate, misc.unreadCount);
api.post('/notifications/read-all', authenticate, misc.markAllRead);
api.patch('/notifications/:id/read', authenticate, validate({ params: idParam }), misc.markRead);

/* guest service requests */
api.post('/service-requests', authenticate, validate({ body: vb.serviceRequestCreateSchema }), ops.createServiceRequest);
api.get('/service-requests/mine', authenticate, ops.myServiceRequests);
api.post('/service-requests/:id/cancel', authenticate, validate({ params: idParam }), ops.cancelMyServiceRequest);

/* hotel operations (staff, managers, admins) */
const opsR = Router();
opsR.use(authenticate, authorize(...TEAM));
opsR.get('/front-desk', validate({ query: vb.hotelQuery }), ops.frontDesk);
opsR.get('/lookup', validate({ query: vb.lookupQuery }), ops.lookup);
opsR.get('/movements', validate({ query: vb.hotelQuery }), ops.upcomingMovements);
opsR.get('/team', validate({ query: vb.hotelQuery }), ops.hotelTeam);
opsR.post('/bookings/:id/check-in', validate({ params: idParam, body: vb.checkInSchema }), ops.checkIn);
opsR.post('/bookings/:id/check-out', validate({ params: idParam }), ops.checkOut);
opsR.post('/bookings/:id/no-show', validate({ params: idParam }), ops.noShow);
opsR.get('/housekeeping', validate({ query: vb.housekeepingQuery }), ops.listHousekeeping);
opsR.post('/housekeeping', validate({ body: vb.housekeepingCreateSchema }), ops.createHousekeeping);
opsR.patch('/housekeeping/:id', validate({ params: idParam, body: vb.housekeepingUpdateSchema }), ops.updateHousekeeping);
opsR.get('/service-requests', validate({ query: vb.serviceRequestQuery }), ops.listServiceRequests);
opsR.patch('/service-requests/:id', validate({ params: idParam, body: vb.serviceRequestUpdateSchema }), ops.updateServiceRequest);
opsR.get('/dashboard', validate({ query: vb.hotelQuery }), misc.staffDashboard);
api.use('/operations', opsR);

/* management (managers for their hotels, admins everywhere) */
const mgmtR = Router();
mgmtR.use(authenticate);
mgmtR.get('/hotels', authorize(...TEAM), mgmt.myHotels);
mgmtR.get('/reservations', authorize(...TEAM), validate({ query: vb.reservationsQuery }), mgmt.reservations);
mgmtR.patch('/reservations/:id/room', authorize('admin', 'manager'), validate({ params: idParam, body: vb.reassignSchema }), mgmt.reassignRoom);
mgmtR.get('/refunds', authorize('admin', 'manager'), mgmt.refundQueue);
mgmtR.post('/payments/:paymentId/refunds/:refundId/process', authorize('admin', 'manager'), validate({ params: vb.refundParams }), pay.processRefund);
mgmtR.post('/payments/:paymentId/refunds/:refundId/reject', authorize('admin', 'manager'), validate({ params: vb.refundParams, body: vb.refundRejectSchema }), pay.rejectRefund);
mgmtR.get('/assignments', authorize('admin', 'manager'), mgmt.listAssignments);
mgmtR.post('/assignments', authorize('admin', 'manager'), validate({ body: va.assignmentCreateSchema }), mgmt.createAssignment);
mgmtR.patch('/assignments/:id', authorize('admin', 'manager'), validate({ params: idParam, body: va.assignmentUpdateSchema }), mgmt.updateAssignment);
mgmtR.delete('/assignments/:id', authorize('admin', 'manager'), validate({ params: idParam }), mgmt.deleteAssignment);
mgmtR.get('/analytics', authorize('admin', 'manager'), validate({ query: va.analyticsQuery }), misc.analyticsSummary);
api.use('/manage', mgmtR);

/* dashboards */
api.get('/dashboard/guest', authenticate, misc.guestDashboard);
api.get('/dashboard/admin', authenticate, authorize('admin'), validate({ query: va.analyticsQuery }), misc.adminDashboard);

/* administration */
const adminR = Router();
adminR.use(authenticate, authorize('admin'));
adminR.get('/users', validate({ query: va.userListQuery }), admin.listUsers);
adminR.patch('/users/:id', validate({ params: idParam, body: va.userUpdateSchema }), admin.updateUser);
adminR.get('/payments', validate({ query: va.paymentListQuery }), admin.listPayments);
adminR.get('/reviews', validate({ query: va.reviewListQuery }), admin.listReviews);
adminR.patch('/reviews/:id', validate({ params: idParam, body: va.reviewModerateSchema }), admin.moderateReview);
adminR.get('/audit-logs', validate({ query: va.auditQuery }), admin.auditLogs);
adminR.get('/settings', admin.getPlatformSettings);
adminR.patch('/settings', validate({ body: va.settingsSchema.refine((v) => Object.keys(v).length > 0, 'Nothing to update') }), admin.patchPlatformSettings);
api.use('/admin', adminR);

export default api;
