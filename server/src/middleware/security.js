import rateLimit from 'express-rate-limit';
import config from '../config/index.js';
import ApiError from '../utils/ApiError.js';

/** Rejects payloads containing MongoDB operator keys ("$where", "$ne", ...) anywhere. */
export function rejectOperatorKeys(req, _res, next) {
  const check = (value, depth = 0) => {
    if (depth > 20 || value === null || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('\0')) {
        throw ApiError.badRequest('Invalid characters in request', { code: 'INVALID_INPUT' });
      }
      check(value[key], depth + 1);
    }
  };
  check(req.body);
  check(req.query);
  next();
}

/**
 * CSRF defence for cookie-authenticated requests: state-changing requests must carry
 * an Origin (or Referer) from the allow-list. Combined with SameSite cookies, a page
 * on another site cannot make the browser perform an authenticated write.
 * Webhooks are excluded (they are authenticated by signature instead).
 */
export function originCheck(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/api/payments/webhook')) return next();
  const origin = req.get('origin') || refererOrigin(req.get('referer'));
  if (!origin) {
    // Non-browser clients (curl, tests, server-to-server) send no Origin; browsers always do
    // for cross-origin writes, so a missing Origin cannot be a cross-site browser request.
    return next();
  }
  if (!config.corsOrigins.includes(origin.replace(/\/$/, ''))) {
    throw ApiError.forbidden('Request origin not allowed', { code: 'BAD_ORIGIN' });
  }
  next();
}

function refererOrigin(referer) {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function limiter(windowMinutes, limit, message) {
  if (!config.rateLimitEnabled) return (_req, _res, next) => next();
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message } }),
  });
}

export const globalLimiter = limiter(15, 600, 'Too many requests. Please slow down.');
export const authLimiter = limiter(15, 20, 'Too many attempts. Please try again in a few minutes.');
export const emailLimiter = limiter(60, 6, 'Too many email requests. Please try again later.');
export const contactLimiter = limiter(60, 5, 'Too many messages. Please try again later.');
export const bookingLimiter = limiter(15, 40, 'Too many booking attempts. Please try again shortly.');
