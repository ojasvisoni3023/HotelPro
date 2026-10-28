import { User } from '../models/index.js';
import { clearSessionCookie, setSessionCookie } from '../middleware/auth.js';
import * as authService from '../services/authService.js';
import { audit } from '../services/auditService.js';
import ApiError from '../utils/ApiError.js';
import { created, ok } from '../utils/respond.js';

export async function register(req, res) {
  const { user, email } = await authService.registerUser(req.valid.body);
  setSessionCookie(res, user);
  await audit(req, { category: 'activity', action: 'user.register', entityType: 'User', entityId: user._id, actor: user });
  created(res, {
    user,
    verificationEmailDelivered: email.delivered,
  });
}

export async function login(req, res) {
  const { email, password } = req.valid.body;
  const result = await authService.authenticateCredentials(email, password);
  if (!result.user) {
    await audit(req, {
      category: 'security',
      action: result.reason === 'suspended' ? 'auth.login_blocked_suspended' : 'auth.login_failed',
      details: { email },
    });
    if (result.reason === 'suspended') throw ApiError.forbidden('This account has been suspended. Contact support.', { code: 'ACCOUNT_SUSPENDED' });
    throw ApiError.unauthorized('Incorrect email or password', { code: 'INVALID_CREDENTIALS' });
  }
  setSessionCookie(res, result.user);
  await audit(req, { category: 'activity', action: 'auth.login', entityType: 'User', entityId: result.user._id, actor: result.user });
  ok(res, { user: result.user });
}

export async function logout(req, res) {
  clearSessionCookie(res);
  ok(res, { loggedOut: true });
}

export async function me(req, res) {
  ok(res, { user: req.user });
}

export async function session(req, res) {
  ok(res, { user: req.user ?? null });
}

export async function verifyEmail(req, res) {
  const user = await authService.verifyEmailToken(req.valid.body.token);
  await audit(req, { category: 'security', action: 'auth.email_verified', entityType: 'User', entityId: user._id, actor: user });
  ok(res, { verified: true });
}

export async function resendVerification(req, res) {
  if (req.user.emailVerified) return ok(res, { alreadyVerified: true });
  const result = await authService.issueVerification(req.user);
  ok(res, { sent: true, delivered: result.delivered });
}

export async function forgotPassword(req, res) {
  const user = await authService.requestPasswordReset(req.valid.body.email);
  if (user) await audit(req, { category: 'security', action: 'auth.password_reset_requested', entityType: 'User', entityId: user._id, actor: user });
  // Identical response either way so the endpoint cannot be used to discover accounts.
  ok(res, { message: 'If an account exists for that email, a reset link has been sent.' });
}

export async function resetPassword(req, res) {
  const user = await authService.resetPassword(req.valid.body.token, req.valid.body.password);
  clearSessionCookie(res);
  await audit(req, { category: 'security', action: 'auth.password_reset', entityType: 'User', entityId: user._id, actor: user });
  ok(res, { reset: true });
}

export async function changePassword(req, res) {
  const user = await authService.changePassword(req.user._id, req.valid.body.currentPassword, req.valid.body.newPassword);
  setSessionCookie(res, user); // keep this session, revoke the others
  await audit(req, { category: 'security', action: 'auth.password_changed', entityType: 'User', entityId: user._id });
  ok(res, { changed: true });
}

export async function updateProfile(req, res) {
  const patch = req.valid.body;
  const update = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.phone !== undefined) update.phone = patch.phone;
  if (patch.address) for (const [k, v] of Object.entries(patch.address)) update[`address.${k}`] = v;
  const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { returnDocument: 'after', runValidators: true });
  ok(res, { user });
}
