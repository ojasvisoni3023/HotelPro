import config from '../config/index.js';
import { Notification, StaffAssignment, User } from '../models/index.js';
import logger from '../utils/logger.js';
import { sendEmail, templates } from './emailService.js';

/** Creates in-app notifications (and optionally emails) for one or more users. Never throws. */
export async function notify(userIds, { type, title, message, link }, { email = false } = {}) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))];
  if (!ids.length) return;
  try {
    await Notification.insertMany(ids.map((user) => ({ user, type, title, message, link })));
    if (email) {
      const users = await User.find({ _id: { $in: ids }, status: 'active' }).select('email name').lean();
      const url = link ? `${config.clientUrl}${link}` : config.clientUrl;
      await Promise.all(users.map((u) => sendEmail({ to: u.email, ...templates.generic(title, message, url) })));
    }
  } catch (err) {
    logger.error('Failed to create notification', { type, message: err.message });
  }
}

/** All active managers (and optionally staff) of a hotel. */
export async function hotelTeamIds(hotelId, roles = ['manager']) {
  const rows = await StaffAssignment.find({ hotel: hotelId, role: { $in: roles }, active: true }).select('user').lean();
  return rows.map((r) => r.user);
}

export async function adminIds() {
  const rows = await User.find({ role: 'admin', status: 'active' }).select('_id').lean();
  return rows.map((r) => r._id);
}
