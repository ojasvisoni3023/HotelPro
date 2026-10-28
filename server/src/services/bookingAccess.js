import { Booking } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { accessibleHotelIds } from './accessService.js';

/**
 * Loads a booking the actor is allowed to see.
 * - The guest who owns it.
 * - Staff / managers assigned to its hotel (restricted by `teamRoles`).
 * - Admins.
 * Anyone else receives 404 (not 403) so booking ids cannot be probed.
 */
export async function loadBookingFor(user, bookingId, { teamRoles = ['admin', 'manager', 'staff'], allowOwner = true } = {}) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found');
  if (allowOwner && String(booking.guest) === String(user._id)) return { booking, asOwner: true };
  if (teamRoles.includes(user.role)) {
    const ids = await accessibleHotelIds(user);
    if (ids === null || ids.includes(String(booking.hotel))) return { booking, asOwner: false };
  }
  throw ApiError.notFound('Booking not found');
}
