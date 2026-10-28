# HotelPro deployment checklist

Tick each item. Step details are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Before deploying
- [ ] `npm run install:all`, `npm run lint`, `npm test` and `npm run build` all pass locally
- [ ] `git status` shows no `.env` files and no `node_modules` staged
- [ ] Code pushed to GitHub `main`
- [ ] `client/vercel.json`: `YOUR-RENDER-SERVICE` replaced in **both** rewrites

## MongoDB Atlas
- [ ] M0 cluster created
- [ ] Database user created (read/write), password saved in a password manager
- [ ] Network Access includes `0.0.0.0/0`
- [ ] Connection string includes `/hotelpro` and a URL-encoded password

## Render (API)
- [ ] Root Directory `server`; Build `npm ci --omit=dev`; Start `npm start`; Health check `/api/health`
- [ ] `NODE_ENV=production`, `NODE_VERSION=22`, `TRUST_PROXY=2`, `COOKIE_SAMESITE=lax`
- [ ] `MONGODB_URI`, `JWT_SECRET` (new, ≥ 32 chars, not the dev one)
- [ ] `CLIENT_URL` = exact Vercel origin (https, no trailing slash)
- [ ] `PAYMENT_PROVIDER=razorpay` + `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` + `RAZORPAY_WEBHOOK_SECRET`
- [ ] `CLOUDINARY_URL` (for uploads)
- [ ] SMTP variables (for real emails)
- [ ] Logs show `MongoDB connected` and `listening on http://0.0.0.0:<port>`
- [ ] `https://<render>/api/health` → `status: ok, db: connected`

## Vercel (web)
- [ ] Root Directory `client`, framework Vite, output `dist`
- [ ] No secrets in Vercel environment variables (only optional `VITE_API_BASE_URL=/api`)
- [ ] `https://<vercel>/api/health` works through the rewrite
- [ ] Deep link `https://<vercel>/rooms` loads (SPA fallback)

## Integrations
- [ ] Razorpay webhook created → `https://<vercel>/api/payments/webhook/razorpay`, same secret, events `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`
- [ ] First admin created with `npm run create-admin` (password not hardcoded, not in shell history)
- [ ] Production database is **not** seeded with demo accounts (or uses a separate demo DB)

## Smoke test on the live site
- [ ] Register → verification email arrives → link verifies
- [ ] Search with dates shows prices and availability
- [ ] Book → Razorpay test payment → confirmation and invoice
- [ ] Booking shows *Paid*; the Razorpay dashboard shows the captured payment
- [ ] Cancel → refund queued → manager or admin processes it → Razorpay shows the refund
- [ ] Staff check-in and check-out work; housekeeping task created
- [ ] Manager uploads a photo (Cloudinary)
- [ ] Admin role change appears in the audit log
- [ ] Phone-sized browser: no sideways scrolling, menus work
- [ ] Open `/api/health` a minute before any demo (Render cold start)
