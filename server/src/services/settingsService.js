import { Setting } from '../models/index.js';

let cache = null;
let cachedAt = 0;
const TTL_MS = 30_000;

export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < TTL_MS) return cache;
  let doc = await Setting.findOne({ key: 'platform' }).lean();
  if (!doc) {
    doc = (await Setting.findOneAndUpdate(
      { key: 'platform' },
      { $setOnInsert: { key: 'platform' } },
      { upsert: true, returnDocument: 'after', lean: true }
    ));
  }
  cache = doc;
  cachedAt = Date.now();
  return doc;
}

export async function updateSettings(patch, userId) {
  const doc = await Setting.findOneAndUpdate(
    { key: 'platform' },
    { $set: { ...patch, updatedBy: userId } },
    { upsert: true, returnDocument: 'after', runValidators: true, lean: true }
  );
  cache = doc;
  cachedAt = Date.now();
  return doc;
}

export function clearSettingsCache() {
  cache = null;
}

export function publicSettings(s) {
  return {
    taxRatePercent: s.taxRatePercent,
    freeCancellationHours: s.freeCancellationHours,
    lateCancellationRefundPercent: s.lateCancellationRefundPercent,
    maxStayNights: s.maxStayNights,
    bookingWindowDays: s.bookingWindowDays,
    supportEmail: s.supportEmail,
    supportPhone: s.supportPhone,
    announcement: s.announcement,
  };
}

export function cancellationPolicyText(s) {
  const late = s.lateCancellationRefundPercent;
  return (
    `Free cancellation until ${s.freeCancellationHours} hours before check-in (full refund). ` +
    (late > 0
      ? `After that and before check-in, ${late}% of the amount paid is refunded. `
      : 'After that, the booking is non-refundable. ') +
    'No refund once the stay has started or for no-shows.'
  );
}
