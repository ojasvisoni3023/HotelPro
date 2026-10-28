/** Round to 2 decimal places (paise precision) to avoid floating point drift. */
export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Rupees -> paise integer, as required by Razorpay. */
export function toMinorUnits(amount) {
  return Math.round(round2(amount) * 100);
}

export function fromMinorUnits(minor) {
  return round2(Number(minor) / 100);
}
