import { eachNight, nightsBetween, toDateString } from '../utils/dates.js';
import { round2 } from '../utils/money.js';

/** The nightly rate for one night: a matching seasonal rate, otherwise the base price. */
export function rateForNight(category, night) {
  const t = new Date(night).getTime();
  // If seasons overlap, the one that started most recently wins (most specific).
  const season = [...(category.seasonalRates ?? [])]
    .filter((s) => new Date(s.startDate).getTime() <= t && t <= new Date(s.endDate).getTime())
    .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
  return season ? { rate: season.price, season: season.name } : { rate: category.basePrice, season: undefined };
}

/**
 * Server-side price calculation. Never trust totals sent by a client.
 *   subtotal = Σ nightly rates
 *   taxes    = subtotal × taxRatePercent / 100 (rounded to paise)
 *   total    = subtotal + taxes
 */
export function quoteStay(category, checkIn, checkOut, taxRatePercent) {
  const nightly = eachNight(checkIn, checkOut).map((date) => {
    const { rate, season } = rateForNight(category, date);
    return { date, rate: round2(rate), season };
  });
  const subtotal = round2(nightly.reduce((s, n) => s + n.rate, 0));
  const taxes = round2((subtotal * taxRatePercent) / 100);
  return {
    currency: 'INR',
    nights: nightsBetween(checkIn, checkOut),
    nightly,
    averageNightly: nightly.length ? round2(subtotal / nightly.length) : 0,
    subtotal,
    taxRatePercent,
    taxes,
    total: round2(subtotal + taxes),
  };
}

export function serializeQuote(q) {
  return { ...q, nightly: q.nightly.map((n) => ({ ...n, date: toDateString(n.date) })) };
}
