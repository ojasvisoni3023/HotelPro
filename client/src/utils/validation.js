import { nightsBetween } from './format';

/** Client-side checks for fast feedback. The server repeats every check authoritatively. */
export function validateStay({ checkIn, checkOut }, today, { required = false, maxNights = 30 } = {}) {
  const errors = {};
  if (required || checkIn || checkOut) {
    if (!checkIn) errors.checkIn = 'Choose a check-in date';
    if (!checkOut) errors.checkOut = 'Choose a check-out date';
    if (checkIn && today && checkIn < today) errors.checkIn = 'Check-in cannot be in the past';
    if (checkIn && checkOut && nightsBetween(checkIn, checkOut) < 1) errors.checkOut = 'Check-out must be after check-in';
    else if (checkIn && checkOut && nightsBetween(checkIn, checkOut) > maxNights) errors.checkOut = `Stays are limited to ${maxNights} nights`;
  }
  return errors;
}

export const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailError(v) {
  if (!v?.trim()) return 'Enter your email address';
  if (!EMAIL_RX.test(v.trim())) return 'Enter a valid email address';
  return undefined;
}

export function passwordError(v) {
  if (!v) return 'Enter a password';
  if (v.length < 8) return 'Use at least 8 characters';
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'Include at least one letter and one number';
  return undefined;
}

export function nameError(v) {
  if (!v?.trim() || v.trim().length < 2) return 'Enter your full name';
  return undefined;
}

export function phoneError(v) {
  if (!v) return undefined;
  if (!/^[+\d][\d\s-]{6,18}$/.test(v.trim())) return 'Enter a valid phone number';
  return undefined;
}

export function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v));
}
