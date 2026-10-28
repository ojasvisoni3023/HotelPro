import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { User } from '../models/index.js';
import ApiError from '../utils/ApiError.js';

export function signSession(user) {
  return jwt.sign({ sub: String(user._id), v: user.tokenVersion ?? 0 }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
    algorithm: 'HS256',
  });
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    path: '/',
  };
}

export function setSessionCookie(res, user) {
  const token = signSession(user);
  const decoded = jwt.decode(token);
  res.cookie(config.cookie.name, token, { ...cookieOptions(), expires: new Date(decoded.exp * 1000) });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookie.name, cookieOptions());
}

async function resolveUser(req) {
  const token = req.cookies?.[config.cookie.name];
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'active') return null;
  // A changed tokenVersion (password reset, role change, suspension) revokes old sessions.
  if ((user.tokenVersion ?? 0) !== payload.v) return null;
  return user;
}

/** Requires a valid session. Loads the user fresh from the database on every request. */
export async function authenticate(req, _res, next) {
  const user = await resolveUser(req);
  if (!user) throw ApiError.unauthorized('Please sign in to continue');
  req.user = user;
  next();
}

export async function optionalAuth(req, _res, next) {
  req.user = (await resolveUser(req)) ?? undefined;
  next();
}

/** Role gate. Always combine with authenticate. */
export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();
    if (!roles.includes(req.user.role)) throw ApiError.forbidden();
    next();
  };
}

export function requireVerifiedEmail(req, _res, next) {
  if (!req.user?.emailVerified) {
    throw ApiError.forbidden('Please verify your email address before making a booking', { code: 'EMAIL_NOT_VERIFIED' });
  }
  next();
}
