import { z } from 'zod';
import { ROLES, USER_STATUSES } from '../models/User.js';
import { dateString, email, objectId, pagination, searchText } from './common.js';

export const userListQuery = z.object({
  q: searchText,
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  ...pagination,
});

export const userUpdateSchema = z
  .object({
    role: z.enum(ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
    emailVerified: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const paymentListQuery = z.object({
  status: z.enum(['created', 'captured', 'failed', 'refunded', 'partially_refunded']).optional(),
  provider: z.enum(['razorpay', 'mock']).optional(),
  hotel: objectId.optional(),
  q: searchText,
  ...pagination,
});

export const reviewListQuery = z.object({
  status: z.enum(['published', 'hidden']).optional(),
  hotel: objectId.optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  ...pagination,
});

export const reviewModerateSchema = z
  .object({ status: z.enum(['published', 'hidden']), moderationNote: z.string().trim().max(300).optional() })
  .strict();

export const auditQuery = z.object({
  category: z.enum(['security', 'admin', 'activity']).optional(),
  q: searchText,
  ...pagination,
});

export const settingsSchema = z
  .object({
    taxRatePercent: z.number().min(0).max(40),
    freeCancellationHours: z.number().int().min(0).max(720),
    lateCancellationRefundPercent: z.number().min(0).max(100),
    maxStayNights: z.number().int().min(1).max(90),
    bookingWindowDays: z.number().int().min(1).max(730),
    supportEmail: email,
    supportPhone: z.string().trim().min(5).max(30),
    announcement: z.string().trim().max(200),
  })
  .partial()
  .strict();

export const assignmentCreateSchema = z
  .object({
    hotel: objectId,
    email,
    role: z.enum(['manager', 'staff']),
    position: z.string().trim().max(60).optional(),
  })
  .strict();

export const assignmentUpdateSchema = z
  .object({ position: z.string().trim().max(60), active: z.boolean() })
  .partial()
  .strict();

export const analyticsQuery = z.object({
  hotel: objectId.optional(),
  from: dateString.optional(),
  to: dateString.optional(),
});

export const contactSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email,
    subject: z.string().trim().min(3).max(120),
    message: z.string().trim().min(10).max(2000),
  })
  .strict();
