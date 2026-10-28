import bcrypt from 'bcryptjs';
import config from '../config/index.js';
import { User } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { createOneTimeToken, hashToken } from '../utils/tokens.js';
import { sendEmail, templates } from './emailService.js';

const BCRYPT_ROUNDS = config.isTest ? 4 : 12;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
// Used to equalise response time when the email does not exist (prevents user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-1', 4);

export function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export async function registerUser({ name, email, password, phone }) {
  const existing = await User.exists({ email });
  if (existing) throw ApiError.conflict('An account with this email already exists', { code: 'EMAIL_TAKEN' });
  // Role is never taken from input: self-registration always creates a guest.
  const user = await User.create({ name, email, phone, passwordHash: await hashPassword(password), role: 'guest' });
  const email_ = await issueVerification(user);
  return { user, email: email_ };
}

export async function issueVerification(user) {
  const { token, hash } = createOneTimeToken();
  await User.updateOne({ _id: user._id }, { verifyTokenHash: hash, verifyTokenExpires: new Date(Date.now() + VERIFY_TTL_MS) });
  const url = `${config.clientUrl}/verify-email?token=${token}`;
  return sendEmail({ to: user.email, ...templates.verifyEmail(user, url) });
}

export async function verifyEmailToken(token) {
  const user = await User.findOne({ verifyTokenHash: hashToken(token), verifyTokenExpires: { $gt: new Date() } });
  if (!user) throw ApiError.badRequest('This verification link is invalid or has expired', { code: 'INVALID_TOKEN' });
  user.emailVerified = true;
  user.emailVerifiedAt = new Date();
  user.verifyTokenHash = undefined;
  user.verifyTokenExpires = undefined;
  await user.save();
  return user;
}

export async function authenticateCredentials(email, password) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) return { user: null, reason: 'invalid_credentials', email };
  if (user.status !== 'active') return { user: null, reason: 'suspended', email };
  user.lastLoginAt = new Date();
  await user.save();
  return { user };
}

/** Always resolves the same way whether or not the email exists. */
export async function requestPasswordReset(email) {
  const user = await User.findOne({ email, status: 'active' });
  if (!user) return null;
  const { token, hash } = createOneTimeToken();
  await User.updateOne({ _id: user._id }, { resetTokenHash: hash, resetTokenExpires: new Date(Date.now() + RESET_TTL_MS) });
  const url = `${config.clientUrl}/reset-password?token=${token}`;
  await sendEmail({ to: user.email, ...templates.resetPassword(user, url) });
  return user;
}

export async function resetPassword(token, newPassword) {
  const user = await User.findOne({ resetTokenHash: hashToken(token), resetTokenExpires: { $gt: new Date() } });
  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired', { code: 'INVALID_TOKEN' });
  user.passwordHash = await hashPassword(newPassword);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  user.tokenVersion = (user.tokenVersion ?? 0) + 1; // sign out every existing session
  // Proving control of the inbox also proves the email address.
  if (!user.emailVerified) {
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
  }
  await user.save();
  return user;
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('Current password is incorrect', { code: 'WRONG_PASSWORD' });
  }
  user.passwordHash = await hashPassword(newPassword);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();
  return user;
}
