import { describe, expect, it } from 'vitest';
import { ApiError, cleanParams } from '../src/api/client';
import { addDaysIso, date, money, nightsBetween, plural, sentence } from '../src/utils/format';
import { statusInfo } from '../src/utils/status';
import { emailError, nameError, passwordError, phoneError, validateStay } from '../src/utils/validation';

describe('format helpers', () => {
  it('formats rupees', () => {
    expect(money(11200)).toBe('₹11,200');
    expect(money(1119.99)).toBe('₹1,119.99');
    expect(money(null)).toBe('—');
  });

  it('formats calendar dates in UTC so they never shift a day', () => {
    expect(date('2026-11-01T00:00:00.000Z')).toMatch(/1 Nov 2026/);
  });

  it('does timezone-safe date arithmetic', () => {
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(nightsBetween('2026-10-30', '2026-11-02')).toBe(3);
  });

  it('pluralises and humanises', () => {
    expect(plural(1, 'night')).toBe('1 night');
    expect(plural(3, 'night')).toBe('3 nights');
    expect(sentence('checked_in')).toBe('Checked in');
  });
});

describe('client-side validation', () => {
  const today = '2026-10-28';

  it('accepts an empty stay (browsing without dates)', () => {
    expect(validateStay({ checkIn: '', checkOut: '' }, today)).toEqual({});
  });

  it('flags past check-in, inverted ranges and over-long stays', () => {
    expect(validateStay({ checkIn: '2026-10-01', checkOut: '2026-10-03' }, today).checkIn).toMatch(/past/);
    expect(validateStay({ checkIn: '2026-11-05', checkOut: '2026-11-05' }, today).checkOut).toMatch(/after check-in/);
    expect(validateStay({ checkIn: '2026-11-01', checkOut: '2026-12-15' }, today).checkOut).toMatch(/30 nights/);
    expect(validateStay({ checkIn: '2026-11-01', checkOut: '' }, today).checkOut).toBeTruthy();
  });

  it('validates account fields like the server does', () => {
    expect(emailError('nope')).toBeTruthy();
    expect(emailError('a@b.co')).toBeUndefined();
    expect(passwordError('short1')).toMatch(/8/);
    expect(passwordError('lettersonly')).toMatch(/letter and one number/);
    expect(passwordError('Secur3pass')).toBeUndefined();
    expect(nameError('A')).toBeTruthy();
    expect(phoneError('abc')).toBeTruthy();
    expect(phoneError('+91 98000 00001')).toBeUndefined();
  });
});

describe('API helpers', () => {
  it('maps server validation details to form fields', () => {
    const err = new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'x', details: [{ field: 'body.email', message: 'Bad email' }, { field: 'body.guestDetails.name', message: 'Too short' }] });
    expect(err.fieldErrors()).toEqual({ email: 'Bad email', 'guestDetails.name': 'Too short' });
  });

  it('drops empty query params', () => {
    expect(cleanParams({ a: 1, b: '', c: undefined, d: null, e: 0 })).toEqual({ a: 1, e: 0 });
  });

  it('labels statuses in plain language', () => {
    expect(statusInfo('booking', 'pending')).toEqual({ label: 'Awaiting payment', tone: 'wait' });
    expect(statusInfo('payment', 'refund_pending').label).toBe('Refund pending');
  });
});
