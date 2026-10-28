import mongoose from 'mongoose';
import { z } from 'zod';
import { parseDateOnly } from '../utils/dates.js';

export const objectId = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v) && /^[a-f\d]{24}$/i.test(v), 'Invalid id');

export const idParam = z.object({ id: objectId });

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((v) => parseDateOnly(v) !== null, 'Invalid date');

export const pagination = {
  page: z.coerce.number().int().min(1).max(10000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
};

export const searchText = z.string().trim().max(100).optional();

export const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')).pipe(z.string().max(254));

export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const phone = z
  .string()
  .trim()
  .regex(/^[+\d][\d\s-]{6,18}$/, 'Enter a valid phone number')
  .optional()
  .or(z.literal(''));

export const name = z.string().trim().min(2, 'Name is too short').max(80);

export const stringList = (max = 30, itemMax = 40) => z.array(z.string().trim().min(1).max(itemMax)).max(max);

/** Comma separated query value -> string[] */
export const csv = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20) : []));

export const imageInput = z.object({
  url: z.string().trim().url().max(600),
  alt: z.string().trim().max(160).optional(),
  credit: z.string().trim().max(160).optional(),
});
