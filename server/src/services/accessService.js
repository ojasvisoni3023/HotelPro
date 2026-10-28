import { StaffAssignment } from '../models/index.js';
import ApiError from '../utils/ApiError.js';

/**
 * Hotel-scoped authorization.
 *   admin   -> every hotel (returns null meaning "no restriction")
 *   manager -> hotels with an active manager assignment
 *   staff   -> hotels with an active staff assignment
 *   guest   -> none
 */
export async function accessibleHotelIds(user) {
  if (!user) return [];
  if (user.role === 'admin') return null;
  if (!['manager', 'staff'].includes(user.role)) return [];
  const rows = await StaffAssignment.find({ user: user._id, role: user.role, active: true }).select('hotel').lean();
  return rows.map((r) => String(r.hotel));
}

/** Throws 403 unless the user may operate the hotel. `roles` restricts which roles qualify. */
export async function assertHotelAccess(user, hotelId, roles = ['admin', 'manager', 'staff']) {
  if (!user || !roles.includes(user.role)) throw ApiError.forbidden();
  if (user.role === 'admin') return;
  const ids = await accessibleHotelIds(user);
  if (!ids.includes(String(hotelId))) throw ApiError.forbidden('You are not assigned to this hotel');
}

/** Mongo filter fragment restricting a query to the user's hotels. */
export async function hotelScopeFilter(user, requestedHotelId, field = 'hotel') {
  const ids = await accessibleHotelIds(user);
  if (requestedHotelId) {
    if (ids !== null && !ids.includes(String(requestedHotelId))) throw ApiError.forbidden('You are not assigned to this hotel');
    return { [field]: requestedHotelId };
  }
  return ids === null ? {} : { [field]: { $in: ids } };
}
