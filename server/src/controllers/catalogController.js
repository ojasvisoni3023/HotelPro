import { Booking, Hotel, Review, Room, RoomCategory, RoomNight } from '../models/index.js';
import { ACTIVE_BOOKING_STATUSES } from '../models/Booking.js';
import { accessibleHotelIds, assertHotelAccess } from '../services/accessService.js';
import { audit } from '../services/auditService.js';
import { availabilityByCategory } from '../services/availabilityService.js';
import { validateStay } from '../services/bookingService.js';
import { quoteStay, serializeQuote } from '../services/pricingService.js';
import { cancellationPolicyText, getSettings } from '../services/settingsService.js';
import { deleteStoredImage, storeImage } from '../services/uploadService.js';
import ApiError from '../utils/ApiError.js';
import { parseDateOnly, todayInZone } from '../utils/dates.js';
import { created, escapeRegex, ok, pageMeta, pageParams } from '../utils/respond.js';
import config from '../config/index.js';

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 80);

function hotelCard(h) {
  return {
    _id: h._id,
    name: h.name,
    slug: h.slug,
    tagline: h.tagline,
    address: h.address,
    starRating: h.starRating,
    ratingAvg: h.ratingAvg,
    ratingCount: h.ratingCount,
    amenities: h.amenities,
    images: (h.images ?? []).slice(0, 3),
    status: h.status,
  };
}

async function minPrices(hotelIds) {
  const rows = await RoomCategory.aggregate([
    { $match: { hotel: { $in: hotelIds }, status: 'active' } },
    { $group: { _id: '$hotel', minPrice: { $min: '$basePrice' }, maxGuests: { $max: '$maxGuests' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

/* ------------------------------------------------------------ hotels */

export async function listHotels(req, res) {
  const { q, city, sort, includeInactive } = req.valid.query;
  const filter = {};
  const staffView = includeInactive === 'true' && req.user && ['admin', 'manager', 'staff'].includes(req.user.role);
  if (!staffView) filter.status = 'active';
  else if (req.user.role !== 'admin') filter._id = { $in: await accessibleHotelIds(req.user) };
  if (city) filter['address.city'] = new RegExp(`^${escapeRegex(city)}`, 'i');
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { 'address.city': rx }, { 'address.state': rx }, { tagline: rx }];
  }
  const { page, limit, skip } = pageParams(req.valid.query, { defaultLimit: 12 });
  const all = await Hotel.find(filter).lean();
  const prices = await minPrices(all.map((h) => h._id));
  let items = all.map((h) => ({ ...hotelCard(h), minPrice: prices.get(String(h._id))?.minPrice ?? null }));
  const sorters = {
    rating: (a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount,
    name: (a, b) => a.name.localeCompare(b.name),
    price_asc: (a, b) => (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity),
    price_desc: (a, b) => (b.minPrice ?? -1) - (a.minPrice ?? -1),
  };
  items.sort(sorters[sort ?? 'rating']);
  const total = items.length;
  items = items.slice(skip, skip + limit);
  ok(res, items, pageMeta({ page, limit }, total));
}

export async function getHotel(req, res) {
  const key = req.params.idOrSlug;
  const isId = /^[a-f\d]{24}$/i.test(key);
  const hotel = await Hotel.findOne(isId ? { _id: key } : { slug: String(key).toLowerCase() }).lean();
  if (!hotel) throw ApiError.notFound('Hotel not found');
  if (hotel.status !== 'active') {
    const ids = req.user ? await accessibleHotelIds(req.user) : [];
    if (!(ids === null || ids.includes(String(hotel._id)))) throw ApiError.notFound('Hotel not found');
  }
  const [categories, reviews, settings] = await Promise.all([
    RoomCategory.find({ hotel: hotel._id, status: 'active' }).sort({ basePrice: 1 }).lean(),
    Review.find({ hotel: hotel._id, status: 'published' }).sort({ createdAt: -1 }).limit(6).populate('guest', 'name').lean(),
    getSettings(),
  ]);
  ok(res, {
    hotel,
    roomTypes: categories,
    reviews: reviews.map(publicReview),
    cancellationPolicy: cancellationPolicyText(settings),
  });
}

export async function createHotel(req, res) {
  const body = req.valid.body;
  const base = slugify(`${body.name}-${body.address.city}`);
  let slug = base;
  for (let i = 2; await Hotel.exists({ slug }); i++) slug = `${base}-${i}`;
  const hotel = await Hotel.create({ ...body, slug, createdBy: req.user._id });
  await audit(req, { category: 'admin', action: 'hotel.create', entityType: 'Hotel', entityId: hotel._id, details: { name: hotel.name } });
  created(res, hotel);
}

export async function updateHotel(req, res) {
  await assertHotelAccess(req.user, req.params.id, ['admin', 'manager']);
  const patch = req.valid.body;
  if (patch.status && req.user.role !== 'admin') throw ApiError.forbidden('Only administrators can activate or deactivate hotels');
  const hotel = await Hotel.findByIdAndUpdate(req.params.id, { $set: patch }, { returnDocument: 'after', runValidators: true });
  if (!hotel) throw ApiError.notFound('Hotel not found');
  await audit(req, { category: 'admin', action: 'hotel.update', entityType: 'Hotel', entityId: hotel._id, details: { fields: Object.keys(patch) } });
  ok(res, hotel);
}

export async function deleteHotel(req, res) {
  const hotel = await Hotel.findById(req.params.id);
  if (!hotel) throw ApiError.notFound('Hotel not found');
  const hasBookings = await Booking.exists({ hotel: hotel._id });
  if (hasBookings) {
    // Keep history intact: hotels with bookings are deactivated, never hard-deleted.
    hotel.status = 'inactive';
    await hotel.save();
    await audit(req, { category: 'admin', action: 'hotel.deactivate', entityType: 'Hotel', entityId: hotel._id });
    return ok(res, { deleted: false, deactivated: true });
  }
  await Promise.all([RoomCategory.deleteMany({ hotel: hotel._id }), Room.deleteMany({ hotel: hotel._id })]);
  await hotel.deleteOne();
  await audit(req, { category: 'admin', action: 'hotel.delete', entityType: 'Hotel', entityId: hotel._id, details: { name: hotel.name } });
  ok(res, { deleted: true });
}

/* ---------------------------------------------------- images (hotel + room type) */

async function loadImageOwner(kind, id, user) {
  if (kind === 'hotel') {
    const doc = await Hotel.findById(id);
    if (!doc) throw ApiError.notFound('Hotel not found');
    await assertHotelAccess(user, doc._id, ['admin', 'manager']);
    return doc;
  }
  const doc = await RoomCategory.findById(id);
  if (!doc) throw ApiError.notFound('Room type not found');
  await assertHotelAccess(user, doc.hotel, ['admin', 'manager']);
  return doc;
}

export function uploadImage(kind) {
  return async (req, res) => {
    const doc = await loadImageOwner(kind, req.params.id, req.user);
    if (doc.images.length >= 20) throw ApiError.unprocessable('A maximum of 20 images is allowed');
    const stored = await storeImage(req.file);
    doc.images.push({ url: stored.url, publicId: stored.publicId, alt: String(req.body?.alt ?? '').slice(0, 160) });
    await doc.save();
    created(res, doc.images.at(-1));
  };
}

export function deleteImage(kind) {
  return async (req, res) => {
    const doc = await loadImageOwner(kind, req.params.id, req.user);
    const img = doc.images.id(req.params.imageId);
    if (!img) throw ApiError.notFound('Image not found');
    await deleteStoredImage(img);
    img.deleteOne();
    await doc.save();
    ok(res, { deleted: true });
  };
}

/* -------------------------------------------------------- room types */

export async function listRoomTypes(req, res) {
  const hotelId = req.query.hotel;
  if (!hotelId || !/^[a-f\d]{24}$/i.test(String(hotelId))) throw ApiError.badRequest('hotel query parameter is required');
  const manage = req.user && ['admin', 'manager', 'staff'].includes(req.user.role);
  const filter = { hotel: hotelId };
  if (manage) await assertHotelAccess(req.user, hotelId);
  else filter.status = 'active';
  const items = await RoomCategory.find(filter).sort({ basePrice: 1 }).lean();
  const counts = await Room.aggregate([{ $match: { category: { $in: items.map((i) => i._id) } } }, { $group: { _id: '$category', n: { $sum: 1 } } }]);
  const cMap = new Map(counts.map((c) => [String(c._id), c.n]));
  ok(res, items.map((i) => ({ ...i, roomCount: cMap.get(String(i._id)) ?? 0 })));
}

export async function getRoomType(req, res) {
  const category = await RoomCategory.findById(req.params.id).lean();
  if (!category) throw ApiError.notFound('Room type not found');
  const hotel = await Hotel.findById(category.hotel).lean();
  if (!hotel || hotel.status !== 'active' || category.status !== 'active') {
    const ids = req.user ? await accessibleHotelIds(req.user) : [];
    if (!(ids === null || ids.includes(String(category.hotel)))) throw ApiError.notFound('Room type not found');
  }
  const settings = await getSettings();
  const [siblings, reviews] = await Promise.all([
    RoomCategory.find({ hotel: hotel._id, status: 'active', _id: { $ne: category._id } }).select('name basePrice maxGuests images').lean(),
    Review.find({ hotel: hotel._id, status: 'published' }).sort({ createdAt: -1 }).limit(5).populate('guest', 'name').lean(),
  ]);
  ok(res, {
    roomType: category,
    hotel: hotelCard({ ...hotel }),
    hotelDetails: { checkInTime: hotel.checkInTime, checkOutTime: hotel.checkOutTime, policies: hotel.policies, contact: hotel.contact },
    otherRoomTypes: siblings,
    reviews: reviews.map(publicReview),
    cancellationPolicy: cancellationPolicyText(settings),
    taxRatePercent: settings.taxRatePercent,
  });
}

export async function createRoomType(req, res) {
  const body = req.valid.body;
  await assertHotelAccess(req.user, body.hotel, ['admin', 'manager']);
  if (!(await Hotel.exists({ _id: body.hotel }))) throw ApiError.notFound('Hotel not found');
  const doc = await RoomCategory.create({ ...body, seasonalRates: (body.seasonalRates ?? []).map(toSeason) });
  await audit(req, { category: 'admin', action: 'roomtype.create', entityType: 'RoomCategory', entityId: doc._id, details: { name: doc.name } });
  created(res, doc);
}

function toSeason(s) {
  return { ...s, startDate: parseDateOnly(s.startDate), endDate: parseDateOnly(s.endDate) };
}

export async function updateRoomType(req, res) {
  const doc = await RoomCategory.findById(req.params.id);
  if (!doc) throw ApiError.notFound('Room type not found');
  await assertHotelAccess(req.user, doc.hotel, ['admin', 'manager']);
  const patch = { ...req.valid.body };
  if (patch.seasonalRates) patch.seasonalRates = patch.seasonalRates.map(toSeason);
  const priceChanged = patch.basePrice !== undefined && patch.basePrice !== doc.basePrice;
  doc.set(patch);
  await doc.save();
  await audit(req, {
    category: 'admin',
    action: priceChanged || patch.seasonalRates ? 'pricing.update' : 'roomtype.update',
    entityType: 'RoomCategory',
    entityId: doc._id,
    details: { fields: Object.keys(patch), basePrice: doc.basePrice },
  });
  ok(res, doc);
}

export async function deleteRoomType(req, res) {
  const doc = await RoomCategory.findById(req.params.id);
  if (!doc) throw ApiError.notFound('Room type not found');
  await assertHotelAccess(req.user, doc.hotel, ['admin', 'manager']);
  const [rooms, bookings] = await Promise.all([Room.exists({ category: doc._id }), Booking.exists({ category: doc._id })]);
  if (rooms || bookings) {
    doc.status = 'inactive';
    await doc.save();
    return ok(res, { deleted: false, deactivated: true, reason: 'Room type has rooms or bookings; it was deactivated instead.' });
  }
  await doc.deleteOne();
  await audit(req, { category: 'admin', action: 'roomtype.delete', entityType: 'RoomCategory', entityId: doc._id });
  ok(res, { deleted: true });
}

/* ------------------------------------------------------------ rooms */

export async function listRooms(req, res) {
  const { hotel, category, status, q } = req.valid.query;
  if (!hotel) throw ApiError.badRequest('hotel query parameter is required');
  await assertHotelAccess(req.user, hotel);
  const filter = { hotel };
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (q) filter.roomNumber = new RegExp(`^${escapeRegex(q)}`, 'i');
  const rooms = await Room.find(filter).populate('category', 'name maxGuests basePrice').sort({ floor: 1, roomNumber: 1 }).lean();
  // Who is in each room tonight?
  const today = todayInZone(config.timezone);
  const inHouse = await Booking.find({ hotel, status: 'checked_in' }).select('room guestDetails.name checkOut confirmationCode').lean();
  const upcoming = await RoomNight.find({ hotel, date: today, expiresAt: null }).select('room booking').lean();
  const inHouseMap = new Map(inHouse.map((b) => [String(b.room), b]));
  const soldTonight = new Set(upcoming.map((n) => String(n.room)));
  ok(
    res,
    rooms.map((r) => ({
      ...r,
      currentGuest: inHouseMap.get(String(r._id))
        ? { name: inHouseMap.get(String(r._id)).guestDetails.name, checkOut: inHouseMap.get(String(r._id)).checkOut, confirmationCode: inHouseMap.get(String(r._id)).confirmationCode }
        : null,
      soldTonight: soldTonight.has(String(r._id)),
    }))
  );
}

export async function createRoom(req, res) {
  const body = req.valid.body;
  await assertHotelAccess(req.user, body.hotel, ['admin', 'manager']);
  const cat = await RoomCategory.findOne({ _id: body.category, hotel: body.hotel });
  if (!cat) throw ApiError.badRequest('Room type does not belong to this hotel');
  const room = await Room.create(body);
  await audit(req, { category: 'admin', action: 'room.create', entityType: 'Room', entityId: room._id, details: { roomNumber: room.roomNumber } });
  created(res, room);
}

export async function updateRoom(req, res) {
  const room = await Room.findById(req.params.id);
  if (!room) throw ApiError.notFound('Room not found');
  await assertHotelAccess(req.user, room.hotel, ['admin', 'manager']);
  const patch = req.valid.body;
  if (patch.category && String(patch.category) !== String(room.category)) {
    const cat = await RoomCategory.findOne({ _id: patch.category, hotel: room.hotel });
    if (!cat) throw ApiError.badRequest('Room type does not belong to this hotel');
    const active = await Booking.exists({ room: room._id, status: { $in: ACTIVE_BOOKING_STATUSES } });
    if (active) throw ApiError.unprocessable('Cannot change the type of a room with active bookings');
  }
  room.set(patch);
  await room.save();
  ok(res, room);
}

/** Operational status change (staff allowed) — e.g. cleaning → available, or maintenance. */
export async function updateRoomStatus(req, res) {
  const room = await Room.findById(req.params.id);
  if (!room) throw ApiError.notFound('Room not found');
  await assertHotelAccess(req.user, room.hotel);
  const { status, notes } = req.valid.body;
  const occupied = await Booking.exists({ room: room._id, status: 'checked_in' });
  if (status === 'available' && occupied) throw ApiError.unprocessable('A guest is checked in to this room. Check them out first.');
  if (status === 'occupied' && !occupied) throw ApiError.unprocessable('Rooms become occupied through guest check-in');
  room.status = status;
  if (notes !== undefined) room.notes = notes;
  await room.save();
  await audit(req, { category: 'activity', action: 'room.status', entityType: 'Room', entityId: room._id, details: { status } });
  ok(res, room);
}

export async function deleteRoom(req, res) {
  const room = await Room.findById(req.params.id);
  if (!room) throw ApiError.notFound('Room not found');
  await assertHotelAccess(req.user, room.hotel, ['admin', 'manager']);
  if (await Booking.exists({ room: room._id })) {
    throw ApiError.unprocessable('This room has booking history. Set it to "out of service" instead of deleting it.');
  }
  await room.deleteOne();
  await audit(req, { category: 'admin', action: 'room.delete', entityType: 'Room', entityId: room._id, details: { roomNumber: room.roomNumber } });
  ok(res, { deleted: true });
}

/* ---------------------------------------------------------- search */

export async function search(req, res) {
  const q = req.valid.query;
  const settings = await getSettings();
  const stay = q.checkIn ? validateStay(q.checkIn, q.checkOut, settings) : null;

  const hotelFilter = { status: 'active' };
  if (q.hotel) hotelFilter._id = q.hotel;
  if (q.location) {
    const rx = new RegExp(escapeRegex(q.location), 'i');
    hotelFilter.$or = [{ name: rx }, { 'address.city': rx }, { 'address.state': rx }];
  }
  const hotels = await Hotel.find(hotelFilter).lean();
  const hotelMap = new Map(hotels.map((h) => [String(h._id), h]));

  const catFilter = { hotel: { $in: hotels.map((h) => h._id) }, status: 'active', maxGuests: { $gte: q.guests } };
  if (q.category) catFilter.name = new RegExp(escapeRegex(q.category), 'i');
  if (q.amenities.length) catFilter.amenities = { $all: q.amenities.map((a) => new RegExp(`^${escapeRegex(a)}$`, 'i')) };
  const categories = await RoomCategory.find(catFilter).lean();

  const avail = stay ? await availabilityByCategory(categories.map((c) => c._id), stay.checkIn, stay.checkOut) : null;
  const roomCounts = stay
    ? null
    : new Map(
        (await Room.aggregate([{ $match: { category: { $in: categories.map((c) => c._id) } } }, { $group: { _id: '$category', n: { $sum: 1 } } }])).map(
          (r) => [String(r._id), r.n]
        )
      );

  let items = categories.map((c) => {
    const hotel = hotelMap.get(String(c.hotel));
    const quote = stay ? quoteStay(c, stay.checkIn, stay.checkOut, settings.taxRatePercent) : null;
    const a = avail?.get(String(c._id));
    return {
      roomType: {
        _id: c._id,
        name: c.name,
        description: c.description,
        maxGuests: c.maxGuests,
        bedType: c.bedType,
        sizeSqm: c.sizeSqm,
        amenities: c.amenities,
        images: c.images.slice(0, 4),
        basePrice: c.basePrice,
      },
      hotel: hotelCard(hotel),
      nightlyPrice: quote ? quote.averageNightly : c.basePrice,
      quote: quote ? serializeQuote(quote) : null,
      availableRooms: a ? a.available : null,
      totalRooms: a ? a.total : roomCounts.get(String(c._id)) ?? 0,
    };
  });

  if (q.minPrice !== undefined) items = items.filter((i) => i.nightlyPrice >= q.minPrice);
  if (q.maxPrice !== undefined) items = items.filter((i) => i.nightlyPrice <= q.maxPrice);
  if (stay && q.onlyAvailable === 'true') items = items.filter((i) => i.availableRooms > 0);
  if (!stay) items = items.filter((i) => i.totalRooms > 0);

  const sorters = {
    price_asc: (a, b) => a.nightlyPrice - b.nightlyPrice,
    price_desc: (a, b) => b.nightlyPrice - a.nightlyPrice,
    rating: (a, b) => b.hotel.ratingAvg - a.hotel.ratingAvg,
    capacity: (a, b) => b.roomType.maxGuests - a.roomType.maxGuests || a.nightlyPrice - b.nightlyPrice,
    recommended: (a, b) =>
      Number((b.availableRooms ?? 1) > 0) - Number((a.availableRooms ?? 1) > 0) ||
      b.hotel.ratingAvg - a.hotel.ratingAvg ||
      a.nightlyPrice - b.nightlyPrice,
  };
  items.sort(sorters[q.sort]);

  const { page, limit, skip } = pageParams(q, { defaultLimit: 12, maxLimit: 50 });
  const total = items.length;
  const amenityFacet = [...new Set(categories.flatMap((c) => c.amenities))].sort();
  ok(res, items.slice(skip, skip + limit), {
    ...pageMeta({ page, limit }, total),
    stay: stay ? { checkIn: q.checkIn, checkOut: q.checkOut, nights: stay.nights, guests: q.guests } : null,
    facets: { amenities: amenityFacet },
  });
}

/** Live availability + server-side quote for one room type. */
export async function checkAvailability(req, res) {
  const { checkIn, checkOut, guests } = req.valid.query;
  const category = await RoomCategory.findOne({ _id: req.params.id, status: 'active' }).lean();
  if (!category) throw ApiError.notFound('Room type not found');
  const settings = await getSettings();
  const stay = validateStay(checkIn, checkOut, settings);
  const a = (await availabilityByCategory([category._id], stay.checkIn, stay.checkOut)).get(String(category._id));
  const quote = quoteStay(category, stay.checkIn, stay.checkOut, settings.taxRatePercent);
  ok(res, {
    available: a.available > 0 && guests <= category.maxGuests,
    availableRooms: a.available,
    fitsGuests: guests <= category.maxGuests,
    maxGuests: category.maxGuests,
    quote: serializeQuote(quote),
    cancellationPolicy: cancellationPolicyText(settings),
  });
}

export function publicReview(r) {
  return {
    _id: r._id,
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    createdAt: r.createdAt,
    guestName: r.guest?.name ? r.guest.name.split(' ')[0] : 'Guest',
  };
}
