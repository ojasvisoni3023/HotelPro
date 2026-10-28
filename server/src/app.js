import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config/index.js';
import { razorpayWebhook } from './controllers/paymentController.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { globalLimiter, originCheck, rejectOperatorKeys } from './middleware/security.js';
import api from './routes/index.js';
import { LOCAL_UPLOAD_DIR, storageMode } from './services/uploadService.js';

export function createApp() {
  const app = express();

  // Render / Vercel sit behind a proxy: needed for correct client IPs (rate limiting) and secure cookies.
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], imgSrc: ["'self'", 'data:'] } },
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow the SPA to display /uploads images
    })
  );
  app.use(
    cors({
      origin(origin, cb) {
        // Same-origin and server-to-server requests send no Origin header.
        if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Requested-With'],
      maxAge: 600,
    })
  );
  if (config.logRequests) app.use(morgan(config.isProd ? 'combined' : 'dev'));

  // Webhooks need the exact raw bytes for signature verification, so they bypass the JSON parser.
  app.post('/api/payments/webhook/razorpay', express.raw({ type: 'application/json', limit: '1mb' }), razorpayWebhook);

  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  app.use(cookieParser());
  app.use(rejectOperatorKeys);
  app.use('/api', globalLimiter, originCheck);

  if (storageMode() === 'local') {
    app.use('/uploads', express.static(LOCAL_UPLOAD_DIR, { fallthrough: false, index: false, dotfiles: 'deny', maxAge: '7d' }));
  }

  app.get('/', (_req, res) => res.json({ success: true, data: { name: 'HotelPro API', health: '/api/health' } }));
  app.use('/api', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export default createApp;
