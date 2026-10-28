import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const bool = (def) =>
  z
    .enum(['true', 'false', '1', '0', ''])
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : v === 'true' || v === '1'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  HOST: z.string().default('0.0.0.0'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().optional(),
  API_PUBLIC_URL: z.string().url().optional(),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  PAYMENT_PROVIDER: z.enum(['razorpay', 'mock']).default('mock'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  BOOKING_HOLD_MINUTES: z.coerce.number().int().min(5).max(60).default(15),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('HotelPro <no-reply@hotelpro.local>'),

  CLOUDINARY_URL: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().default('hotelpro'),

  HOTEL_TIMEZONE: z.string().default('Asia/Kolkata'),
  RATE_LIMIT_ENABLED: bool(true),
  LOG_REQUESTS: bool(true),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid server environment configuration:\n${lines.join('\n')}\nSee server/.env.example.`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === 'production';

  if (isProd && env.PAYMENT_PROVIDER === 'mock') {
    throw new Error('PAYMENT_PROVIDER=mock is not allowed when NODE_ENV=production. Configure Razorpay.');
  }
  if (env.PAYMENT_PROVIDER === 'razorpay' && (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET)) {
    throw new Error('PAYMENT_PROVIDER=razorpay requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
  if (isProd && env.CLIENT_URL.startsWith('http://localhost')) {
    throw new Error('CLIENT_URL must be set to the deployed frontend URL when NODE_ENV=production.');
  }

  const corsOrigins = [env.CLIENT_URL, ...(env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',') : [])]
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  return Object.freeze({
    env: env.NODE_ENV,
    isProd,
    isTest: env.NODE_ENV === 'test',
    port: env.PORT,
    host: env.HOST,
    mongoUri: env.MONGODB_URI,
    jwt: { secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN },
    clientUrl: env.CLIENT_URL.replace(/\/$/, ''),
    corsOrigins: [...new Set(corsOrigins)],
    apiPublicUrl: env.API_PUBLIC_URL,
    cookie: {
      name: 'hp_session',
      sameSite: env.COOKIE_SAMESITE,
      // SameSite=None cookies must be Secure; in production cookies are always Secure.
      secure: isProd || env.COOKIE_SAMESITE === 'none',
    },
    trustProxy: env.TRUST_PROXY,
    payment: {
      provider: env.PAYMENT_PROVIDER,
      razorpay: {
        keyId: env.RAZORPAY_KEY_ID,
        keySecret: env.RAZORPAY_KEY_SECRET,
        webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
      },
      holdMinutes: env.BOOKING_HOLD_MINUTES,
      currency: 'INR',
    },
    smtp: {
      configured: Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS),
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? (env.SMTP_SECURE ? 465 : 587),
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.EMAIL_FROM,
    },
    cloudinary: { url: env.CLOUDINARY_URL, folder: env.CLOUDINARY_FOLDER },
    timezone: env.HOTEL_TIMEZONE,
    rateLimitEnabled: env.RATE_LIMIT_ENABLED && env.NODE_ENV !== 'test',
    logRequests: env.LOG_REQUESTS && env.NODE_ENV !== 'test',
  });
}

const config = load();
export default config;
