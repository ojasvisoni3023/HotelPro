import { AuditLog } from '../models/index.js';
import logger from '../utils/logger.js';

/**
 * Records an audit entry. Never throws: auditing must not break the request,
 * but failures are logged so they are not silent.
 */
export async function audit(req, { category, action, entityType, entityId, details, actor }) {
  try {
    const user = actor ?? req?.user;
    await AuditLog.create({
      actor: user?._id,
      actorEmail: user?.email,
      actorRole: user?.role,
      category,
      action,
      entityType,
      entityId: entityId ? String(entityId) : undefined,
      details,
      ip: req?.ip,
      userAgent: req?.get?.('user-agent')?.slice(0, 300),
    });
  } catch (err) {
    logger.error('Failed to write audit log', { action, message: err.message });
  }
}
