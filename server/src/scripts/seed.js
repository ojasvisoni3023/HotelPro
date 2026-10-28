/**
 * Demo data seeder — DEVELOPMENT ONLY.
 *
 *   npm run seed                     (uses SEED_DEMO_PASSWORD from .env, or generates one)
 *
 * Behaviour: the seeder WIPES every HotelPro collection in the configured database and
 * recreates a deterministic demo dataset, so running it twice gives the same result
 * (with dates relative to "today"). It refuses to run when NODE_ENV=production.
 * Demo passwords are never hardcoded: they come from SEED_DEMO_PASSWORD or are generated
 * randomly and printed once.
 */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import config from '../config/index.js';
import { connectDB, disconnectDB } from '../config/db.js';
import * as M from '../models/index.js';
import { hashPassword } from '../services/authService.js';
import { quoteStay } from '../services/pricingService.js';
import { recomputeHotelRating } from '../services/reviewService.js';
import { addDays, eachNight, toDateString, todayInZone } from '../utils/dates.js';
import { round2 } from '../utils/money.js';
import { HOTELS, PEOPLE, REVIEW_TEXT } from './seedData.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDemoPassword() {
  return `Demo-${crypto.randomBytes(4).toString('hex')}-9`;
}

/** Inserts documents through the model (casting + validation) while keeping explicit timestamps. */
async function insertRaw(Model, docs) {
  if (!docs.length) return;
  const casted = [];
  for (const d of docs) {
    const doc = new Model(d);
    await doc.validate();
    casted.push(doc.toObject({ depopulate: true }));
  }
  await Model.collection.insertMany(casted);
}

export async function seedDatabase({ password, now = new Date() } = {}) {
  if (config.isProd) throw new Error('Refusing to seed demo data when NODE_ENV=production');
  if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('Seed password must be at least 8 characters and contain a letter and a number');
  }
  const rand = rng(20261027);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const T = todayInZone(config.timezone, now);

  // ---- wipe ----
  for (const model of Object.values(M)) if (model?.deleteMany) await model.deleteMany({});
  await M.Setting.create({ key: 'platform' });
  const settings = await M.Setting.findOne({ key: 'platform' }).lean();

  // ---- users ----
  const passwordHash = await hashPassword(password);
  const mkUser = (p) => ({ name: p.name, email: p.email, role: p.role, phone: p.phone, passwordHash, emailVerified: true, emailVerifiedAt: now });
  const admin = await M.User.create(mkUser(PEOPLE.admin));
  const managers = await M.User.insertMany(PEOPLE.managers.map(mkUser));
  const staff = await M.User.insertMany(PEOPLE.staff.map(mkUser));
  const guests = await M.User.insertMany(PEOPLE.guests.map(mkUser));
  const demoGuest = guests[0];

  // ---- hotels, room types, rooms ----
  const hotels = {};
  for (const h of HOTELS) {
    const hotel = await M.Hotel.create({
      name: h.name,
      slug: `${h.name}-${h.address.city}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      tagline: h.tagline,
      description: h.description,
      address: h.address,
      location: h.location,
      contact: h.contact,
      starRating: h.starRating,
      amenities: h.amenities,
      images: h.images,
      policies: h.policies,
      checkInTime: h.checkInTime ?? '14:00',
      checkOutTime: h.checkOutTime ?? '11:00',
      createdBy: admin._id,
    });
    const cats = [];
    for (const c of h.categories) {
      const seasonalRates = (h.seasons ?? []).map((s) => ({
        name: s.name,
        startDate: addDays(T, s.startOffset),
        endDate: addDays(T, s.endOffset),
        price: Math.round((c.basePrice * s.multiplier) / 100) * 100,
      }));
      const cat = await M.RoomCategory.create({ hotel: hotel._id, name: c.name, description: c.description, maxGuests: c.maxGuests, bedType: c.bedType, sizeSqm: c.sizeSqm, amenities: c.amenities, images: c.images, basePrice: c.basePrice, seasonalRates });
      const rooms = await M.Room.insertMany(
        c.rooms.map((n) => ({ hotel: hotel._id, category: cat._id, roomNumber: n, floor: Number.parseInt(n.replace(/\D/g, '').slice(0, -2) || '1', 10) || 1 }))
      );
      cats.push({ doc: cat, rooms });
    }
    hotels[h.key] = { doc: hotel, cats };
  }

  // ---- assignments ----
  const assignments = [];
  PEOPLE.managers.forEach((p, i) => p.hotels.forEach((k) => assignments.push({ user: managers[i]._id, hotel: hotels[k].doc._id, role: 'manager', position: 'General manager', assignedBy: admin._id })));
  PEOPLE.staff.forEach((p, i) => p.hotels.forEach((k) => assignments.push({ user: staff[i]._id, hotel: hotels[k].doc._id, role: 'staff', position: p.position, assignedBy: admin._id })));
  await M.StaffAssignment.insertMany(assignments);

  // ---- bookings ----
  const occupied = new Map(); // roomId -> Set(date)
  const bookings = [];
  const payments = [];
  const nights = [];
  const reviews = [];
  let invoiceSeq = 0;
  let orderSeq = 0;
  const year = now.getUTCFullYear();

  const freeRoom = (cat, ci, co) =>
    cat.rooms.find((r) => {
      const set = occupied.get(String(r._id));
      return !set || eachNight(ci, co).every((d) => !set.has(toDateString(d)));
    });
  const occupy = (room, ci, co) => {
    const key = String(room._id);
    if (!occupied.has(key)) occupied.set(key, new Set());
    for (const d of eachNight(ci, co)) occupied.get(key).add(toDateString(d));
  };

  function book({ hotelKey, catIndex, guest, ciOffset, nightsCount, status, refund, review, createdDaysBefore = between(3, 25) }) {
    const h = hotels[hotelKey];
    const cat = h.cats[catIndex ?? between(0, h.cats.length - 1)];
    const ci = addDays(T, ciOffset);
    const co = addDays(ci, nightsCount);
    const sold = ['confirmed', 'checked_in', 'checked_out'].includes(status);
    const holds = sold || status === 'pending';
    const room = holds || status === 'no_show' || status === 'cancelled' ? freeRoom(cat, ci, co) : cat.rooms[0];
    if (!room) return null;
    if (holds) occupy(room, ci, co);
    const q = quoteStay(cat.doc, ci, co, settings.taxRatePercent);
    const id = new mongoose.Types.ObjectId();
    // Booked some days before arrival, never in the future; future stays are spread over the past weeks.
    let createdAt = new Date(addDays(ci, -createdDaysBefore).getTime() + between(9, 20) * 3600e3);
    if (createdAt > now) createdAt = new Date(now.getTime() - between(1, 28) * 86400e3 - between(1, 12) * 3600e3);
    const paid = status !== 'pending';
    const g = guest ?? pick(guests.slice(1));
    const b = {
      _id: id,
      confirmationCode: `HP-${crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 7)}`,
      guest: g._id,
      hotel: h.doc._id,
      category: cat.doc._id,
      room: room._id,
      checkIn: ci,
      checkOut: co,
      nights: nightsCount,
      guests: Math.min(cat.doc.maxGuests, between(1, 3)),
      guestDetails: { name: g.name, email: g.email, phone: g.phone },
      pricing: { currency: 'INR', nightly: q.nightly, subtotal: q.subtotal, taxRatePercent: q.taxRatePercent, taxes: q.taxes, total: q.total },
      status,
      paymentStatus: paid ? 'paid' : 'unpaid',
      statusHistory: [{ status: 'pending', at: createdAt, by: g._id, note: 'Reservation created' }],
      createdAt,
      updatedAt: createdAt,
    };
    if (status === 'pending') b.holdExpiresAt = new Date(now.getTime() + 15 * 60e3);
    if (paid) {
      b.statusHistory.push({ status: 'confirmed', at: new Date(createdAt.getTime() + 300e3), note: 'Payment verified (seeded test data)' });
      b.invoice = { number: `INV-${year}-${String(++invoiceSeq).padStart(6, '0')}`, issuedAt: new Date(createdAt.getTime() + 300e3) };
    }
    if (status === 'checked_in' || status === 'checked_out') {
      b.checkedInAt = new Date(ci.getTime() + 9 * 3600e3);
      b.statusHistory.push({ status: 'checked_in', at: b.checkedInAt });
    }
    if (status === 'checked_out') {
      b.checkedOutAt = new Date(co.getTime() + 5 * 3600e3);
      b.statusHistory.push({ status: 'checked_out', at: b.checkedOutAt });
    }
    if (status === 'no_show') b.statusHistory.push({ status: 'no_show', at: addDays(ci, 1) });

    const capturedAt = new Date(createdAt.getTime() + 300e3);
    const payment = paid
      ? {
          booking: id,
          user: g._id,
          hotel: h.doc._id,
          amount: q.total,
          currency: 'INR',
          provider: 'mock',
          isTest: true,
          providerOrderId: `seed_order_${++orderSeq}`,
          providerPaymentId: `seed_pay_${orderSeq}`,
          status: 'captured',
          method: 'test',
          capturedAt,
          amountRefunded: 0,
          refunds: [],
          createdAt,
          updatedAt: capturedAt,
        }
      : null;

    if (status === 'cancelled') {
      const percent = refund === 'partial' ? 50 : 100;
      const amount = round2((q.total * percent) / 100);
      const cancelledAt = new Date(Math.min(addDays(ci, -5).getTime(), now.getTime() - 86400e3));
      b.cancellation = { cancelledAt, cancelledBy: g._id, reason: 'Change of plans', refundPercent: percent, refundAmount: amount, policyNote: 'Seeded demo cancellation' };
      b.statusHistory.push({ status: 'cancelled', at: cancelledAt, by: g._id });
      if (refund === 'processed') {
        payment.refunds.push({ amount, status: 'processed', reason: `Cancellation (${percent}% refund)`, requestedAt: cancelledAt, processedAt: new Date(cancelledAt.getTime() + 7200e3), processedBy: admin._id, note: 'Test-mode refund — no real money moved' });
        payment.amountRefunded = amount;
        payment.status = percent === 100 ? 'refunded' : 'partially_refunded';
        b.paymentStatus = percent === 100 ? 'refunded' : 'partially_refunded';
      } else {
        payment.refunds.push({ amount, status: 'requested', reason: `Cancellation (${percent}% refund)`, requestedAt: cancelledAt, requestedBy: g._id });
        b.paymentStatus = 'refund_pending';
      }
    }

    bookings.push(b);
    if (payment) payments.push(payment);
    if (holds) {
      for (const d of eachNight(ci, co)) {
        nights.push({ room: room._id, date: d, booking: id, hotel: h.doc._id, category: cat.doc._id, expiresAt: status === 'pending' ? b.holdExpiresAt : null });
      }
    }
    if (status === 'checked_out' && review) {
      const r = pick(REVIEW_TEXT);
      reviews.push({ booking: id, hotel: h.doc._id, category: cat.doc._id, guest: g._id, rating: r.rating, title: r.title, comment: r.comment, status: 'published', createdAt: addDays(co, 1), updatedAt: addDays(co, 1) });
      b.reviewed = true;
    }
    return b;
  }

  // Demo guest's own journey (sign in as guest@hotelpro.demo to see it).
  const demoInHouse = book({ hotelKey: 'ivory', catIndex: 1, guest: demoGuest, ciOffset: -1, nightsCount: 3, status: 'checked_in', createdDaysBefore: 20 });
  book({ hotelKey: 'marigold', catIndex: 1, guest: demoGuest, ciOffset: 14, nightsCount: 4, status: 'confirmed', createdDaysBefore: 6 });
  book({ hotelKey: 'deodar', catIndex: 1, guest: demoGuest, ciOffset: -20, nightsCount: 3, status: 'checked_out', review: false, createdDaysBefore: 30 });
  book({ hotelKey: 'harbour', catIndex: 0, guest: demoGuest, ciOffset: -45, nightsCount: 2, status: 'checked_out', review: true, createdDaysBefore: 10 });
  book({ hotelKey: 'ivory', catIndex: 0, guest: demoGuest, ciOffset: 25, nightsCount: 2, status: 'cancelled', refund: 'processed', createdDaysBefore: 15 });

  for (const key of Object.keys(hotels)) {
    const roomCount = hotels[key].cats.reduce((s, c) => s + c.rooms.length, 0);
    // Current and future movements first, so they always get a room.
    book({ hotelKey: key, ciOffset: -2, nightsCount: 2, status: 'checked_in' }); // departs today
    book({ hotelKey: key, ciOffset: -1, nightsCount: 3, status: 'checked_in' });
    book({ hotelKey: key, ciOffset: -3, nightsCount: 5, status: 'checked_in' });
    book({ hotelKey: key, ciOffset: 0, nightsCount: 2, status: 'confirmed' }); // arrivals today
    book({ hotelKey: key, ciOffset: 0, nightsCount: 3, status: 'confirmed' });
    for (let i = 0; i < roomCount * 2; i++) book({ hotelKey: key, ciOffset: between(1, 45), nightsCount: between(1, 4), status: 'confirmed' });
    book({ hotelKey: key, ciOffset: -4, nightsCount: 2, status: 'no_show' });
    book({ hotelKey: key, ciOffset: between(8, 20), nightsCount: 2, status: 'cancelled', refund: 'processed' });
    // Enough history for realistic occupancy (~50–65%) over the last two months.
    for (let i = 0; i < roomCount * 9; i++) {
      const n = between(1, 4);
      book({ hotelKey: key, ciOffset: -between(n + 1, 60), nightsCount: n, status: 'checked_out', review: rand() < 0.3 });
    }
  }
  book({ hotelKey: 'ivory', catIndex: 2, ciOffset: 12, nightsCount: 2, status: 'cancelled', refund: 'requested' });
  book({ hotelKey: 'marigold', catIndex: 2, ciOffset: 6, nightsCount: 3, status: 'cancelled', refund: 'requested' });

  await insertRaw(M.Booking, bookings);
  await insertRaw(M.Payment, payments);
  await insertRaw(M.Review, reviews);
  await M.RoomNight.insertMany(nights);
  await M.Counter.create({ _id: `invoice-${year}`, seq: invoiceSeq });

  // ---- room status, housekeeping, service requests ----
  const inHouse = bookings.filter((b) => b.status === 'checked_in');
  await M.Room.updateMany({ _id: { $in: inHouse.map((b) => b.room) } }, { status: 'occupied' });
  const tasks = [];
  const requests = [];
  for (const [key, h] of Object.entries(hotels)) {
    const hotelStaff = staff.filter((_, i) => PEOPLE.staff[i].hotels.includes(key));
    const occupiedIds = new Set(inHouse.filter((b) => String(b.hotel) === String(h.doc._id)).map((b) => String(b.room)));
    const allRooms = h.cats.flatMap((c) => c.rooms);
    const free = allRooms.filter((r) => !occupiedIds.has(String(r._id)));
    const toClean = free.slice(0, 2);
    await M.Room.updateMany({ _id: { $in: toClean.map((r) => r._id) } }, { status: 'cleaning' });
    toClean.forEach((r, i) => tasks.push({ hotel: h.doc._id, room: r._id, type: 'checkout_clean', status: i === 0 ? 'pending' : 'in_progress', priority: 'high', assignedTo: hotelStaff[1]?._id ?? hotelStaff[0]?._id, notes: 'Departure clean', dueDate: T, createdBy: admin._id }));
    const maint = free[free.length - 1];
    await M.Room.updateOne({ _id: maint._id }, { status: 'maintenance', notes: 'AC unit being serviced' });
    tasks.push({ hotel: h.doc._id, room: maint._id, type: 'maintenance', status: 'in_progress', priority: 'normal', notes: 'AC unit being serviced', createdBy: admin._id });
    [...occupiedIds].slice(0, 2).forEach((roomId) => tasks.push({ hotel: h.doc._id, room: roomId, type: 'daily_service', status: 'pending', priority: 'normal', dueDate: T, createdBy: admin._id }));
    tasks.push({ hotel: h.doc._id, room: free[2]._id, type: 'inspection', status: 'done', priority: 'low', completedAt: addDays(now, -1), createdBy: admin._id });
  }
  for (const b of inHouse.slice(0, 6)) {
    requests.push({ hotel: b.hotel, booking: b._id, guest: b.guest, room: b.room, type: pick(['housekeeping', 'amenities', 'room_service', 'maintenance']), description: pick(['Extra towels and pillows, please.', 'Could we get a kettle and more tea bags?', 'The bathroom light is flickering.', 'Please arrange a late check-out if possible.']), priority: 'normal', status: pick(['open', 'open', 'in_progress']) });
  }
  if (demoInHouse) {
    requests.push({ hotel: demoInHouse.hotel, booking: demoInHouse._id, guest: demoGuest._id, room: demoInHouse.room, type: 'amenities', description: 'Could we have two extra bottles of water and a yoga mat?', status: 'resolved', staffNote: 'Delivered to the room', resolvedAt: addDays(now, -0.5) });
  }
  await M.HousekeepingTask.insertMany(tasks);
  await M.ServiceRequest.insertMany(requests);

  for (const h of Object.values(hotels)) await recomputeHotelRating(h.doc._id);

  await M.Notification.insertMany([
    { user: demoGuest._id, type: 'welcome', title: 'Welcome to HotelPro', message: 'Your demo account has upcoming, current and past stays to explore.', link: '/account' },
    ...managers.map((m) => ({ user: m._id, type: 'welcome', title: 'Manager workspace ready', message: 'Review today’s occupancy and the refund queue from your dashboard.', link: '/manager' })),
    ...staff.map((s) => ({ user: s._id, type: 'welcome', title: 'Shift overview', message: 'Today’s arrivals, departures and open tasks are on your dashboard.', link: '/staff' })),
    { user: admin._id, type: 'welcome', title: 'Admin console ready', message: 'Platform analytics are computed from the seeded records.', link: '/admin' },
  ]);
  await M.AuditLog.create({ category: 'admin', action: 'seed.run', details: { bookings: bookings.length, hotels: HOTELS.length } });

  return {
    password,
    counts: {
      users: 1 + managers.length + staff.length + guests.length,
      hotels: HOTELS.length,
      roomTypes: HOTELS.reduce((s, h) => s + h.categories.length, 0),
      rooms: HOTELS.reduce((s, h) => s + h.categories.reduce((t, c) => t + c.rooms.length, 0), 0),
      bookings: bookings.length,
      payments: payments.length,
      reviews: reviews.length,
    },
    accounts: [PEOPLE.admin, ...PEOPLE.managers, ...PEOPLE.staff, PEOPLE.guests[0]].map((p) => ({ role: p.role, email: p.email })),
  };
}

export function printSeedSummary(result) {
  console.log('\nHotelPro demo data created:', result.counts);
  console.log('\nDemo accounts (development only) — password for all:', result.password);
  for (const a of result.accounts) console.log(`  ${a.role.padEnd(8)} ${a.email}`);
  console.log('\nSeeded payments are TEST records (provider "mock"); no real money is involved.\n');
}

async function main() {
  const password = process.env.SEED_DEMO_PASSWORD || generateDemoPassword();
  await connectDB(config.mongoUri);
  try {
    const result = await seedDatabase({ password });
    printSeedSummary(result);
  } finally {
    await disconnectDB();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`Seeding failed: ${err.message}`);
    process.exit(1);
  });
}
