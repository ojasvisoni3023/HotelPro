import { z } from 'zod';
import { BOOKING_STATUSES, PAYMENT_STATUSES } from '../models/Booking.js';
import { HOUSEKEEPING_STATUSES, HOUSEKEEPING_TYPES } from '../models/HousekeepingTask.js';
import { SERVICE_REQUEST_STATUSES, SERVICE_REQUEST_TYPES } from '../models/ServiceRequest.js';
import { dateString, email, objectId, pagination, phone, searchText } from './common.js';

export const createBookingSchema = z
  .object({
    categoryId: objectId,
    checkIn: dateString,
    checkOut: dateString,
    guests: z.number().int().min(1).max(12),
    guestDetails: z
      .object({
        name: z.string().trim().min(2).max(80),
        email,
        phone,
      })
      .optional(),
    specialRequests: z.string().trim().max(500).optional(),
  })
  .strict();

export const myBookingsQuery = z.object({
  scope: z.enum(['upcoming', 'past', 'cancelled', 'all']).default('all'),
  ...pagination,
});

export const cancelSchema = z.object({ reason: z.string().trim().max(300).optional() }).strict();

export const reservationsQuery = z.object({
  hotel: objectId.optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  from: dateString.optional(), // check-in on/after
  to: dateString.optional(), // check-in on/before
  q: searchText,
  sort: z.enum(['checkIn', '-checkIn', '-createdAt']).default('-createdAt'),
  ...pagination,
});

export const hotelQuery = z.object({ hotel: objectId.optional() });
export const lookupQuery = z.object({ hotel: objectId.optional(), q: z.string().trim().min(2).max(100) });

export const checkInSchema = z.object({ roomId: objectId.optional() }).strict();
export const reassignSchema = z.object({ roomId: objectId }).strict();

export const housekeepingQuery = z.object({
  hotel: objectId.optional(),
  status: z.enum(HOUSEKEEPING_STATUSES).optional(),
  ...pagination,
});
export const housekeepingCreateSchema = z
  .object({
    hotel: objectId,
    room: objectId,
    type: z.enum(HOUSEKEEPING_TYPES),
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
    assignedTo: objectId.optional(),
    notes: z.string().trim().max(500).optional(),
    dueDate: dateString.optional(),
  })
  .strict();
export const housekeepingUpdateSchema = z
  .object({
    status: z.enum(HOUSEKEEPING_STATUSES),
    priority: z.enum(['low', 'normal', 'high']),
    assignedTo: objectId.nullable(),
    notes: z.string().trim().max(500),
  })
  .partial()
  .strict();

export const serviceRequestCreateSchema = z
  .object({
    bookingId: objectId,
    type: z.enum(SERVICE_REQUEST_TYPES),
    description: z.string().trim().min(5, 'Please describe what you need').max(1000),
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
  })
  .strict();
export const serviceRequestQuery = z.object({
  hotel: objectId.optional(),
  status: z.enum(SERVICE_REQUEST_STATUSES).optional(),
  ...pagination,
});
export const serviceRequestUpdateSchema = z
  .object({
    status: z.enum(SERVICE_REQUEST_STATUSES),
    assignedTo: objectId.nullable(),
    staffNote: z.string().trim().max(500),
    priority: z.enum(['low', 'normal', 'high']),
  })
  .partial()
  .strict();

export const reviewCreateSchema = z
  .object({
    bookingId: objectId,
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().max(100).optional(),
    comment: z.string().trim().min(10, 'Please write at least 10 characters').max(2000),
  })
  .strict();

export const orderSchema = z.object({ bookingId: objectId }).strict();
export const razorpayVerifySchema = z
  .object({
    razorpay_order_id: z.string().min(5).max(64),
    razorpay_payment_id: z.string().min(5).max(64),
    razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i, 'Invalid signature'),
  })
  .strict();
export const mockCompleteSchema = z.object({ orderId: z.string().min(5).max(64), outcome: z.enum(['success', 'failure']) }).strict();
export const refundRejectSchema = z.object({ note: z.string().trim().min(3).max(300) }).strict();
export const refundParams = z.object({ paymentId: objectId, refundId: objectId });
