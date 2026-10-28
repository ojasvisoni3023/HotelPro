/**
 * Booking dates are calendar dates ("YYYY-MM-DD") stored as UTC midnight.
 * A stay from checkIn to checkOut occupies the nights [checkIn, checkOut).
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnly(value) {
  if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || toDateString(d) !== value) return null;
  return d;
}

export function toDateString(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function addDays(date, n) {
  return new Date(new Date(date).getTime() + n * DAY_MS);
}

export function nightsBetween(checkIn, checkOut) {
  return Math.round((new Date(checkOut) - new Date(checkIn)) / DAY_MS);
}

/** Every night of a stay as UTC-midnight Dates. */
export function eachNight(checkIn, checkOut) {
  const out = [];
  for (let d = new Date(checkIn); d < checkOut; d = addDays(d, 1)) out.push(new Date(d));
  return out;
}

/** "Today" as a calendar date in the hotel's timezone, returned as UTC midnight. */
export function todayInZone(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return parseDateOnly(parts);
}

/** Offset of a timezone at a given instant in minutes (e.g. Asia/Kolkata -> 330). */
function zoneOffsetMinutes(timeZone, at) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name ?? '');
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** The real instant of a calendar date + "HH:MM" wall-clock time in a timezone. */
export function zonedInstant(dateOnly, hhmm, timeZone) {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  const naive = new Date(new Date(dateOnly).getTime() + (h * 60 + m) * 60 * 1000);
  return new Date(naive.getTime() - zoneOffsetMinutes(timeZone, naive) * 60 * 1000);
}

export function hoursUntil(date, now = new Date()) {
  return (new Date(date).getTime() - now.getTime()) / (60 * 60 * 1000);
}

export { DAY_MS };
