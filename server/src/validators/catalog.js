import { z } from 'zod';
import { ROOM_STATUSES } from '../models/Room.js';
import { csv, dateString, imageInput, objectId, pagination, searchText, stringList } from './common.js';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)');

const hotelBase = {
  name: z.string().trim().min(2).max(100),
  tagline: z.string().trim().max(140).optional(),
  description: z.string().trim().min(20, 'Description should be at least 20 characters').max(4000),
  address: z.object({
    line1: z.string().trim().min(3).max(160),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().max(80).optional(),
    country: z.string().trim().min(2).max(80).default('India'),
    postalCode: z.string().trim().max(12).optional(),
  }),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).partial().optional(),
  contact: z
    .object({
      phone: z.string().trim().max(20).optional(),
      email: z.string().trim().toLowerCase().pipe(z.email()).optional().or(z.literal('')),
      website: z.string().trim().url().max(200).optional().or(z.literal('')),
    })
    .optional(),
  starRating: z.number().int().min(1).max(5).optional(),
  amenities: stringList(40).optional(),
  images: z.array(imageInput).max(20).optional(),
  checkInTime: time.optional(),
  checkOutTime: time.optional(),
  policies: z.string().trim().max(2000).optional(),
};

export const hotelCreateSchema = z.object({ ...hotelBase, status: z.enum(['active', 'inactive']).default('active') }).strict();

export const hotelUpdateSchema = z
  .object({ ...hotelBase, status: z.enum(['active', 'inactive']) })
  .partial()
  .strict();

export const hotelListQuery = z.object({
  q: searchText,
  city: searchText,
  sort: z.enum(['rating', 'name', 'price_asc', 'price_desc']).optional(),
  includeInactive: z.enum(['true', 'false']).optional(),
  ...pagination,
});

const seasonalRate = z
  .object({
    name: z.string().trim().min(2).max(60),
    startDate: dateString,
    endDate: dateString,
    price: z.number().min(0).max(1_000_000),
  })
  .refine((s) => s.endDate >= s.startDate, { message: 'Season end must be on or after its start', path: ['endDate'] });

const categoryBase = {
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).optional(),
  maxGuests: z.number().int().min(1).max(12),
  bedType: z.string().trim().max(40).optional(),
  sizeSqm: z.number().min(0).max(1000).optional(),
  amenities: stringList(40).optional(),
  images: z.array(imageInput).max(20).optional(),
  basePrice: z.number().min(0).max(1_000_000),
  seasonalRates: z.array(seasonalRate).max(30).optional(),
  status: z.enum(['active', 'inactive']).optional(),
};

export const categoryCreateSchema = z.object({ hotel: objectId, ...categoryBase }).strict();
export const categoryUpdateSchema = z.object(categoryBase).partial().strict();

export const roomCreateSchema = z
  .object({
    hotel: objectId,
    category: objectId,
    roomNumber: z.string().trim().min(1).max(10),
    floor: z.number().int().min(-5).max(200).optional(),
    status: z.enum(ROOM_STATUSES).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const roomUpdateSchema = z
  .object({
    category: objectId,
    roomNumber: z.string().trim().min(1).max(10),
    floor: z.number().int().min(-5).max(200),
    status: z.enum(ROOM_STATUSES),
    notes: z.string().trim().max(500),
  })
  .partial()
  .strict();

export const roomStatusSchema = z.object({ status: z.enum(ROOM_STATUSES), notes: z.string().trim().max(500).optional() }).strict();

export const roomListQuery = z.object({
  hotel: objectId.optional(),
  category: objectId.optional(),
  status: z.enum(ROOM_STATUSES).optional(),
  q: searchText,
  ...pagination,
});

export const searchQuery = z
  .object({
    location: searchText,
    hotel: objectId.optional(),
    checkIn: dateString.optional(),
    checkOut: dateString.optional(),
    guests: z.coerce.number().int().min(1).max(12).default(1),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    category: searchText, // room type name contains, e.g. "suite"
    amenities: csv,
    onlyAvailable: z.enum(['true', 'false']).default('true'),
    sort: z.enum(['recommended', 'price_asc', 'price_desc', 'rating', 'capacity']).default('recommended'),
    ...pagination,
  })
  .refine((q) => (q.checkIn ? Boolean(q.checkOut) : !q.checkOut), { message: 'Provide both check-in and check-out', path: ['checkOut'] });

export const availabilityQuery = z.object({
  checkIn: dateString,
  checkOut: dateString,
  guests: z.coerce.number().int().min(1).max(12).default(1),
});
