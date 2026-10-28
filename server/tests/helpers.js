import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import config from '../src/config/index.js';
import * as M from '../src/models/index.js';
import { hashPassword } from '../src/services/authService.js';
import { clearDevOutbox, getDevOutbox } from '../src/services/emailService.js';
import { clearSettingsCache } from '../src/services/settingsService.js';
import { addDays, toDateString, todayInZone } from '../src/utils/dates.js';

export const app = createApp();
export const PASSWORD = 'Passw0rd-123';

export async function connect() {
  if (mongoose.connection.readyState !== 1) await mongoose.connect(config.mongoUri);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

export async function resetDb() {
  await Promise.all(Object.values(M).map((m) => m.deleteMany({})));
  clearSettingsCache();
  clearDevOutbox();
}

export async function disconnect() {
  await mongoose.disconnect();
}

export async function makeUser(role = 'guest', overrides = {}) {
  const n = Math.random().toString(36).slice(2, 8);
  return M.User.create({
    name: `${role} ${n}`,
    email: `${role}.${n}@test.example`,
    passwordHash: await hashPassword(PASSWORD),
    role,
    emailVerified: true,
    ...overrides,
  });
}

/** A supertest agent that keeps the session cookie, signed in as `user`. */
export async function agentFor(user) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

/** Creates a hotel with one room type and `rooms` physical rooms. */
export async function makeHotel({ rooms = 2, basePrice = 5000, maxGuests = 2, seasonalRates = [], name } = {}) {
  const n = Math.random().toString(36).slice(2, 7);
  const hotel = await M.Hotel.create({
    name: name ?? `Test Hotel ${n}`,
    slug: `test-hotel-${n}`,
    description: 'A comfortable hotel used by automated tests only.',
    address: { line1: '1 Test Street', city: 'Testpur', country: 'India' },
  });
  const category = await M.RoomCategory.create({ hotel: hotel._id, name: 'Deluxe', maxGuests, basePrice, seasonalRates });
  const roomDocs = await M.Room.insertMany(Array.from({ length: rooms }, (_, i) => ({ hotel: hotel._id, category: category._id, roomNumber: String(101 + i) })));
  return { hotel, category, rooms: roomDocs };
}

export async function assign(user, hotel, role = user.role) {
  return M.StaffAssignment.create({ user: user._id, hotel: hotel._id, role });
}

export function day(offset) {
  return toDateString(addDays(todayInZone(config.timezone), offset));
}

export function bookingBody(category, inOffset = 3, outOffset = 5, extra = {}) {
  return { categoryId: String(category._id), checkIn: day(inOffset), checkOut: day(outOffset), guests: 2, ...extra };
}

/** Books and pays (mock provider) as the given agent; returns the booking id. */
export async function bookAndPay(agent, category, inOffset = 3, outOffset = 5) {
  const b = await agent.post('/api/bookings').send(bookingBody(category, inOffset, outOffset));
  if (b.status !== 201) throw new Error(`booking failed ${b.status} ${JSON.stringify(b.body)}`);
  const o = await agent.post('/api/payments/orders').send({ bookingId: b.body.data._id });
  const p = await agent.post('/api/payments/mock/complete').send({ orderId: o.body.data.orderId, outcome: 'success' });
  if (p.status !== 200) throw new Error(`payment failed ${p.status} ${JSON.stringify(p.body)}`);
  return b.body.data._id;
}

export function lastEmailLink(to, pathPart) {
  const mail = getDevOutbox().find((m) => m.to === to && m.text.includes(pathPart));
  const m = mail && /token=([\w-]+)/.exec(mail.text);
  return m?.[1];
}

export { M, request };
