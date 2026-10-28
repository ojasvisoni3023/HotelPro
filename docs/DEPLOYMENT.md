# Deploying HotelPro (Vercel + Render + MongoDB Atlas)

This guide uses only web dashboards. It assumes the code is already on GitHub (README §19). It takes about 45 minutes the first time. Nothing here has been deployed for you, so each step needs your accounts.

```
GitHub repo ──▶ Render  (root: server/)  → https://hotelpro-api.onrender.com
           └──▶ Vercel  (root: client/)  → https://hotelpro-xyz.vercel.app   (/api/* rewritten to Render)
Render ──▶ MongoDB Atlas
```

## 0. Accounts to create

| Service | Sign-up | Plan |
|---|---|---|
| GitHub | https://github.com/signup | Free |
| MongoDB Atlas | https://www.mongodb.com/cloud/atlas/register | M0 Free |
| Render | https://dashboard.render.com/register (sign in with GitHub) | Free web service |
| Vercel | https://vercel.com/signup (sign in with GitHub) | Hobby |
| Razorpay | https://dashboard.razorpay.com/signup | Test mode (no KYC needed) |
| Cloudinary *(for uploads)* | https://cloudinary.com/users/register/free | Free |
| SMTP *(for email)* | e.g. Gmail app password, or Brevo free | Free |

## 1. MongoDB Atlas

1. **Create → Deploy a cluster → M0 Free**. Choose a provider/region near India (e.g. AWS Mumbai), then *Create*.
2. **Security → Database Access → Add New Database User**. Choose *Password*, username `hotelpro_app`, then *Autogenerate Secure Password* and **copy it**. Built-in role: *Read and write to any database*. Click *Add User*.
3. **Security → Network Access → Add IP Address → Allow access from anywhere** (`0.0.0.0/0`), then *Confirm*. Render's free tier has no static IP; the database is still protected by the user and password.
4. **Database → Connect → Drivers** and copy the URI. Replace `<password>`, and insert `/hotelpro` before `?`:
   `mongodb+srv://hotelpro_app:PASSWORD@cluster0.abcde.mongodb.net/hotelpro?retryWrites=true&w=majority`

## 2. Secrets to prepare

On your Mac:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"         # RAZORPAY_WEBHOOK_SECRET
```

Razorpay (Test Mode toggle on): **Account & Settings → API Keys → Generate Test Key**. Copy the Key Id `rzp_test_…` and the Key Secret.

## 3. Render: backend

1. Dashboard → **New + → Web Service → Build and deploy from a Git repository** → connect GitHub → choose your `hotelpro` repo.
2. Settings:

   | Field | Value |
   |---|---|
   | Name | `hotelpro-api` (this becomes `https://hotelpro-api.onrender.com`; if taken, note the name you get) |
   | Region | Singapore (closest to India) |
   | Branch | `main` |
   | **Root Directory** | `server` |
   | Runtime | Node |
   | **Build Command** | `npm ci --omit=dev` |
   | **Start Command** | `npm start` |
   | Instance type | Free |

3. **Advanced → Health Check Path:** `/api/health`
4. **Environment variables** (*Add Environment Variable*):

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `NODE_VERSION` | `22` |
   | `MONGODB_URI` | your Atlas URI |
   | `JWT_SECRET` | generated value |
   | `CLIENT_URL` | `https://placeholder.vercel.app` for now (updated in step 5) |
   | `TRUST_PROXY` | `2` |
   | `COOKIE_SAMESITE` | `lax` |
   | `PAYMENT_PROVIDER` | `razorpay` |
   | `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | test keys |
   | `RAZORPAY_WEBHOOK_SECRET` | generated value |
   | `CLOUDINARY_URL` | from the Cloudinary dashboard (*API environment variable*) |
   | `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASS` `EMAIL_FROM` | your SMTP settings (optional, but without them verification emails are not sent) |
   | `HOTEL_TIMEZONE` | `Asia/Kolkata` |

5. *Create Web Service*. Watch **Logs**. Success looks like:
   `MongoDB connected (…)` then `HotelPro API listening on http://0.0.0.0:10000 (production, payments: razorpay)`.
   The app reads Render's `PORT` and binds to `0.0.0.0`.
6. Open `https://hotelpro-api.onrender.com/api/health`. It should show `"status":"ok","db":"connected"`.

**Alternative:** `render.yaml` in the repo root is a Blueprint (*New + → Blueprint*) with the same settings. Render prompts for the secret values.

## 4. Vercel: frontend

1. **Edit `client/vercel.json`** in your repo: replace both occurrences of `YOUR-RENDER-SERVICE` with your Render service name (e.g. `hotelpro-api`). Then commit and push:
   ```bash
   git add client/vercel.json && git commit -m "Point Vercel rewrites at Render" && git push
   ```
2. Vercel → **Add New… → Project → Import** your repo.
3. Settings:

   | Field | Value |
   |---|---|
   | **Root Directory** | `client` (click *Edit*) |
   | Framework Preset | Vite |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |
   | Install Command | default (`npm install`) |
   | Environment Variables | none needed. Optional: `VITE_API_BASE_URL=/api` |

4. *Deploy*. Note the production domain, e.g. `https://hotelpro-xyz.vercel.app` (Project → Settings → Domains; you can add a custom domain here).

## 5. Connect them

1. Render → service → **Environment**: set `CLIENT_URL=https://hotelpro-xyz.vercel.app`. Use the exact origin: `https`, no trailing slash. If you also want preview deployments to work, add them to `CORS_ORIGINS` (comma separated). Save; Render redeploys.
2. Visit `https://hotelpro-xyz.vercel.app/api/health`. This goes through the Vercel rewrite and should show the same health JSON.

## 6. First administrator and data

There is no shell on Render's free tier, so run the bootstrap from your Mac against the production database:

```bash
cd server
MONGODB_URI='<atlas uri>' JWT_SECRET='<any 32+ chars, for this command only>' \
ADMIN_PASSWORD='<strong password>' npm run create-admin -- --email you@example.com --name "Your Name"
```

Then sign in on the live site and use **Admin → Hotels** to add hotels (or, for a demo database only, run `npm run seed` locally with `NODE_ENV=development` and `MONGODB_URI` pointing at a *separate* demo database; the seeder wipes the database).

## 7. Razorpay webhook

Razorpay (Test Mode) → **Account & Settings → Webhooks → Add New Webhook**:

- Webhook URL: `https://hotelpro-xyz.vercel.app/api/payments/webhook/razorpay` (or the Render URL)
- Secret: your `RAZORPAY_WEBHOOK_SECRET`
- Active events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`

Save, then use *Test webhook* or make a test payment. Render logs show `Payment captured …`.

## 8. Test the live app

1. Open the site, register, and verify via the email link (or have the admin tick *Email address confirmed* under Users).
2. Search, then book. On the Razorpay screen use a test card or test UPI from Razorpay's docs. You should see the booking confirmed and the invoice.
3. Cancel it, then as admin or manager process the refund (Payments & refunds). Razorpay's dashboard shows the test refund.
4. Upload a room photo as a manager (this checks Cloudinary).
5. Check Render logs for errors.

## 9. Logs and troubleshooting failed deployments

- **Render:** service → *Logs* (live) and *Events* (deploys). A failed boot prints `Invalid server environment configuration:` followed by the offending variables.
- **Vercel:** project → *Deployments* → a deployment → *Build Logs*; *Logs* for runtime rewrites.
- **Atlas:** *Monitoring*. A connection failure from Render is almost always Network Access.

| Problem | Fix |
|---|---|
| Render build: `npm ci` can't find `package-lock.json` | Root Directory must be `server` |
| Render: `MongoServerSelectionError` | Atlas Network Access must include `0.0.0.0/0`; check the URI and password encoding |
| Render: `PAYMENT_PROVIDER=mock is not allowed in production` | Set `PAYMENT_PROVIDER=razorpay` and the keys |
| Render: `CLIENT_URL must be set to the deployed frontend URL` | Set it to the Vercel URL |
| Site loads but every action says "Cannot reach the HotelPro server" | `vercel.json` still has `YOUR-RENDER-SERVICE`, or Render is asleep (wait 60 s and retry) |
| 403 `BAD_ORIGIN` on every form | `CLIENT_URL` mismatch (http vs https, `www`, trailing slash, preview URL not in `CORS_ORIGINS`) |
| Logged in, but the next request is 401 | The site is calling Render directly instead of `/api`. Keep `VITE_API_BASE_URL=/api` |
| Deep links (e.g. `/account/bookings`) return 404 on Vercel | The SPA fallback rewrite in `vercel.json` must remain the last rewrite |
| All users share one rate limit | `TRUST_PROXY` must be `2` behind Vercel + Render |

## 10. Free-plan limitations

- **Render Free:** the service sleeps after about 15 minutes without traffic. The next request waits for a cold start (often 30–60 s), so open `/api/health` a minute before demos. There is no persistent disk (use Cloudinary for images), and there are monthly usage limits.
- **Atlas M0:** 512 MB storage, shared CPU, no backups (export data with `mongodump` if it matters).
- **Vercel Hobby:** personal and non-commercial use; generous bandwidth for a student project.
- **Razorpay test mode:** no real money. Live mode requires business KYC and live keys (`rzp_live_…`); switch both keys and the webhook secret together.
