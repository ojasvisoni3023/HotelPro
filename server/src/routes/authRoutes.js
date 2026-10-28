import { Router } from 'express';
import * as c from '../controllers/authController.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { authLimiter, emailLimiter } from '../middleware/security.js';
import { validate } from '../middleware/validate.js';
import * as v from '../validators/auth.js';

const r = Router();

r.post('/register', authLimiter, validate({ body: v.registerSchema }), c.register);
r.post('/login', authLimiter, validate({ body: v.loginSchema }), c.login);
r.post('/logout', c.logout);
r.get('/me', authenticate, c.me);
// Session probe for the SPA: 200 with user or null (signed-out is not an error).
r.get('/session', optionalAuth, c.session);
r.post('/verify-email', authLimiter, validate({ body: v.tokenSchema }), c.verifyEmail);
r.post('/resend-verification', emailLimiter, authenticate, c.resendVerification);
r.post('/forgot-password', emailLimiter, validate({ body: v.forgotSchema }), c.forgotPassword);
r.post('/reset-password', authLimiter, validate({ body: v.resetSchema }), c.resetPassword);
r.post('/change-password', authLimiter, authenticate, validate({ body: v.changePasswordSchema }), c.changePassword);
r.patch('/profile', authenticate, validate({ body: v.profileSchema }), c.updateProfile);

export default r;
