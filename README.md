# HotelPro

HotelPro is a full-stack hotel management system built on the MERN stack. Guests search for rooms, book them, pay, cancel and leave reviews. Front-desk staff run check-in, check-out, housekeeping and guest requests. Hotel managers manage rooms, prices, reservations, staff and reports. Administrators look after users, hotels, payments, reviews, audit logs and platform rules.

Everything on screen comes from the Express API and MongoDB. Nothing is mocked in the UI. The one exception is the **clearly labelled test-payment mode**, used when no payment provider keys are configured.

> Status of this delivery: 67 backend tests and 23 frontend tests pass, ESLint is clean for both apps, the production build succeeds, and a 31-step browser walkthrough (guest → staff → manager → admin, desktop and phone) passes with no console errors. Deployment to Vercel/Render/Atlas has **not** been performed. That needs your accounts; see [Deployment](#20-deployment-instructions).

---

## Contents

1. [Project introduction](#1-project-introduction)
2. [Feature list](#2-feature-list)
3. [Technology stack](#3-technology-stack)
4. [Architecture overview](#4-architecture-overview)
5. [Folder structure](#5-folder-structure)
6. [Prerequisites](#6-prerequisites)
7. [Local setup on macOS](#7-local-setup-on-macos)
8. [Installing dependencies](#8-installing-dependencies)
9. [MongoDB Atlas setup](#9-mongodb-atlas-setup)
10. [Environment variables](#10-environment-variables)
11. [Seeding the database](#11-seeding-the-database)
12. [Creating the first administrator](#12-creating-the-first-administrator)
13. [Running the frontend and backend](#13-running-the-frontend-and-backend)
14. [Testing](#14-testing)
15. [API documentation](#15-api-documentation)
16. [Payment configuration (Razorpay)](#16-payment-configuration-razorpay)
17. [Email configuration](#17-email-configuration)
18. [Image storage configuration](#18-image-storage-configuration)
19. [Git and GitHub](#19-git-and-github)
20. [Deployment instructions](#20-deployment-instructions)
21. [Demo credentials](#21-demo-credentials)
22. [Common errors and troubleshooting](#22-common-errors-and-troubleshooting)
23. [Security notes and limitations](#23-security-notes-and-limitations)
24. [Known limitations](#24-known-limitations)
25. [Future improvements](#25-future-improvements)

Other documents: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DATA_MODEL.md](docs/DATA_MODEL.md) · [docs/API.md](docs/API.md) · [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · [docs/DEPLOYMENT_CHECKLIST.md](docs/DEPLOYMENT_CHECKLIST.md)

---

## 1. Project introduction

HotelPro serves four fictional hotels: a lakeside heritage hotel in Udaipur, a beach resort in Goa, a mountain retreat in Manali and a business hotel in Mumbai. It covers the full reservation lifecycle:

```
search → hold a room (15 min) → pay → confirmed → check-in → check-out → invoice → review
                          ↘ cancel → refund request → refund processed
```

The core engineering problems it solves:

- **No double-booking.** Each sold or held room-night is a document protected by a unique index. Two simultaneous requests for the last room cannot both succeed. A test fires 8 concurrent requests and asserts exactly one wins.
- **The server is the source of truth.** Prices, taxes, totals, roles, availability and payment status are all calculated or verified on the server. The client never sends a price.
- **Payments are confirmed only by the server.** The browser's success callback is not trusted. The server verifies the Razorpay signature, fetches the payment from Razorpay, and checks the order, amount and currency. Webhooks are signature-verified and de-duplicated.
- **Hotel-scoped permissions.** Managers and staff can act only on hotels they are assigned to, and this is enforced on every API call.

## 2. Feature list

**Guests:** registration with email verification, login/logout, password reset, profile and password change. Search by city or hotel, dates, guests, price, room type and amenities, with sorting. Hotel and room pages with galleries, reviews and live availability. Server-calculated price breakdown with nightly rates, seasonal rates and GST. Checkout, payment (Razorpay or test mode) and confirmation. Booking history (upcoming / past / cancelled), booking details, cancellation with a refund preview, payment history, printable invoice, service requests during a stay, reviews after check-out, and in-app notifications.

**Staff:** "Today" dashboard; front desk with arrivals, departures, in-house guests, overdue departures and reservation lookup by code, name, email or phone. Check-in, check-out and no-show; a room board with live status; housekeeping tasks (create, assign, start, finish); guest requests with notes that notify the guest.

**Managers** (only for assigned hotels): dashboard with revenue, occupancy, booking value, status breakdown, the next 7 days of arrivals and departures, and forward occupancy. Reservations with filters, room reassignment, cancellation (a hotel-initiated cancellation refunds in full) and a refund queue. Room types with base and seasonal pricing, amenities and photos; physical rooms; hotel profile and photos; staff assignment; reports with date ranges and a table view for every chart. Managers can also use the front desk, housekeeping and request screens.

**Admins:** platform dashboard and analytics (all hotels or one); all bookings; payments and refunds; hotels (create, edit, photos, deactivate); users and roles (role change, suspend, verify email); staff assignments; review moderation; audit log with details; platform settings (GST rate, cancellation policy, stay limits, support contacts, site announcement).

**Platform:** HTTP-only cookie sessions, CSRF origin checks, rate limiting, Helmet headers, Zod validation on every route, centralised errors, audit logging, email through SMTP (with an honest fallback), image uploads to Cloudinary (with a local fallback in development), a seed script, a first-admin bootstrap command, a health endpoint, responsive UI, loading skeletons, empty and error states, an error boundary and a 404 page.

## 3. Technology stack

| Layer | Choice | Version |
|---|---|---|
| Runtime | Node.js | ≥ 20.19 (22 LTS recommended) |
| API | Express | 5.3 |
| Database | MongoDB + Mongoose | Mongoose 9.11 |
| Validation | Zod | 4.6 |
| Auth | jsonwebtoken (HS256) in an HTTP-only cookie, bcryptjs | 9.0 / 3.0 |
| Security | helmet, cors, express-rate-limit, cookie-parser | 8.3 / 2.8 / 8.7 / 1.4 |
| Payments | Razorpay official Node SDK | 2.9 |
| Email | Nodemailer | 10.2 |
| Uploads | Multer (memory) + Cloudinary SDK | 2.5 / 2.11 |
| Frontend | React + Vite | 19.3 / 8.3 |
| Routing | React Router | 7.18 |
| UI | Bootstrap 5.3 + react-bootstrap, custom CSS tokens, lucide-react icons | |
| HTTP | Axios | 1.21 |
| Charts | Recharts | 3.10 |
| Notifications | React Toastify | 11.1 |
| Fonts | Marcellus (headings), Manrope (body), self-hosted via Fontsource | |
| Tests | Vitest, Supertest, mongodb-memory-server, Testing Library, jsdom | Vitest 5 |
| Dev tooling | ESLint 10 (flat config), nodemon, concurrently | |

**Compatibility notes:**

- React Router 8 requires Node ≥ 22.22, so v7 is used to keep Node 20 working.
- Mongoose 9 removed `next()` in middleware, so all hooks are async.
- Express 5 makes `req.query` read-only, so validated input is stored on `req.valid`.
- `@vitejs/plugin-react` 6 requires Vite 8.

**State management:** a small React Context handles the session, public config and the selected hotel, and a `useApi` hook handles data loading. The app has very little shared client state, because each screen loads its own data from the API, so Redux Toolkit would add ceremony with no benefit.

## 4. Architecture overview

```
 Browser (React SPA)
   │  same-origin requests to /api/*  (cookie: hp_session, HttpOnly, SameSite=Lax)
   ▼
 Vercel  ── serves the static build; rewrites /api/* → Render
   ▼
 Render (Express API)
   helmet → CORS → raw-body webhook route → JSON parser → cookie parser
   → operator-key filter → rate limit → Origin check (CSRF) → routes
   → [authenticate] → [authorize(role)] → validate(Zod) → controller → service → Mongoose
   → central error handler (consistent JSON errors)
   ▼
 MongoDB Atlas
```

Because Vercel proxies `/api`, the browser only ever talks to one origin. The session cookie is therefore first-party: there is no `SameSite=None` and no third-party-cookie blocking (Safari, Chrome), and no token ever sits in `localStorage`. Full details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 5. Folder structure

```
hotelpro/
├── package.json              root scripts (install:all, dev, test, lint, build, seed)
├── render.yaml               optional Render blueprint for the API
├── .gitignore
├── README.md
├── docs/
│   ├── ARCHITECTURE.md  DATA_MODEL.md  API.md  DEPLOYMENT.md  DEPLOYMENT_CHECKLIST.md
├── server/                   Express API (deploy root on Render)
│   ├── .env.example
│   ├── package.json  eslint.config.js  vitest.config.js
│   ├── src/
│   │   ├── server.js         boots DB + HTTP server, hold sweeper, graceful shutdown
│   │   ├── app.js            Express app and middleware order
│   │   ├── config/           env validation (Zod) and DB connection
│   │   ├── models/           Mongoose schemas (User, Hotel, RoomCategory, Room, RoomNight, Booking, Payment, …)
│   │   ├── validators/       Zod request schemas
│   │   ├── middleware/       auth, validation, security, errors
│   │   ├── routes/           route tables
│   │   ├── controllers/      HTTP layer (thin)
│   │   ├── services/         business logic: availability, pricing, bookings, payments, analytics, email, uploads …
│   │   │   └── payments/     razorpayProvider.js, mockProvider.js
│   │   ├── utils/            dates, money, tokens, responses, errors, logger
│   │   └── scripts/          seed.js, seedData.js, createAdmin.js, devMemory.js
│   └── tests/                Vitest + Supertest integration tests (in-memory MongoDB)
└── client/                   React app (deploy root on Vercel)
    ├── .env.example  vercel.json  vite.config.js  eslint.config.js  index.html
    ├── public/favicon.svg
    ├── src/
    │   ├── main.jsx  App.jsx (routes)
    │   ├── api/client.js     Axios instance + error normalisation
    │   ├── context/          Auth, Config, HotelScope
    │   ├── hooks/useApi.js
    │   ├── components/       layout, ui, booking, charts, routing, ErrorBoundary
    │   ├── pages/            public/, guest/, staff/, manager/, admin/, shared/
    │   ├── styles/theme.css  design tokens and Bootstrap overrides
    │   └── utils/            formatting, status labels, validation
    └── tests/                Vitest + Testing Library
```

## 6. Prerequisites

- **macOS** with Terminal (or the VS Code terminal).
- **Node.js 22 LTS** (minimum 20.19). Check with `node -v`. Install it from <https://nodejs.org> (LTS installer) or with Homebrew (`brew install node@22`).
- **Git**: see [section 19](#19-git-and-github).
- **A MongoDB database.** For real use, a free MongoDB Atlas cluster ([section 9](#9-mongodb-atlas-setup)). To try the app with zero setup, `npm run dev:memory` starts a temporary in-memory MongoDB for you.
- **Visual Studio Code** (recommended extensions: ESLint).
- Internet access on first install. The test suite also downloads a MongoDB binary (about 100 MB) the first time it runs.

## 7. Local setup on macOS

Run every command from the project root folder (`hotelpro/`) unless a step says otherwise.

```bash
# 1. Unzip and open the project
cd ~/Downloads            # or wherever you saved the ZIP
unzip hotelpro.zip -d ~/Projects
cd ~/Projects/hotelpro
code .                    # opens VS Code (if the `code` command is installed)

# 2. Install everything (root, server, client)
npm run install:all

# 3a. Zero-setup demo: in-memory database, seeded automatically
npm run dev:memory --prefix server          # terminal 1 (API on :5000, prints demo logins)
npm run dev --prefix client                 # terminal 2 (web on :5173)

# 3b. Normal development with MongoDB Atlas
cp server/.env.example server/.env          # then edit server/.env (section 10)
cp client/.env.example client/.env          # optional; defaults work locally
npm run seed                                # demo data (section 11)
npm run dev                                 # API + web together in one terminal
```

Open <http://localhost:5173>.

## 8. Installing dependencies

| Command (run in `hotelpro/`) | What it does |
|---|---|
| `npm run install:all` | Installs root, `server/` and `client/` dependencies |
| `npm install --prefix server` | Backend only |
| `npm install --prefix client` | Frontend only |

Each app has its own `package-lock.json`, so Render and Vercel can each install only their own folder.

## 9. MongoDB Atlas setup

1. Create a free account at <https://www.mongodb.com/cloud/atlas/register>.
2. **Create a cluster**: choose the free **M0** tier and a region close to your users (e.g. Mumbai `ap-south-1`).
3. **Database Access → Add New Database User**: choose password authentication, set a username (e.g. `hotelpro_app`), generate a strong password and copy it. Role: *Read and write to any database*.
4. **Network Access → Add IP Address**:
   - For local development, *Add Current IP Address*.
   - For Render, add `0.0.0.0/0` (allow from anywhere). Render's free tier has no fixed outbound IP. Access is still protected by the database user's password.
5. **Database → Connect → Drivers → Node.js** and copy the connection string. Insert your password and add the database name `hotelpro` before the `?`:

   ```
   mongodb+srv://hotelpro_app:<password>@cluster0.xxxxx.mongodb.net/hotelpro?retryWrites=true&w=majority
   ```

   If the password contains `@ : / ? #`, URL-encode it (e.g. `@` → `%40`).
6. Put it in `server/.env` as `MONGODB_URI`. Indexes are created automatically when the API starts.

## 10. Environment variables

**Backend: `server/.env`** (secret; never committed). Template: `server/.env.example`.

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | yes | `development`, `production` or `test` |
| `PORT` | no | API port (Render sets this automatically) |
| `MONGODB_URI` | yes | Atlas connection string |
| `JWT_SECRET` | yes | ≥ 32 random characters, used to sign sessions |
| `JWT_EXPIRES_IN` | no | Session length, default `1d` |
| `CLIENT_URL` | yes | Frontend origin; used for CORS, the CSRF check and email links |
| `CORS_ORIGINS` | no | Extra allowed origins, comma separated |
| `API_PUBLIC_URL` | no | Public API URL (informational) |
| `COOKIE_SAMESITE` | no | `lax` (default, with the Vercel rewrite) or `none` (only if calling Render directly) |
| `TRUST_PROXY` | no | `1` locally, `2` on Render behind Vercel |
| `PAYMENT_PROVIDER` | yes | `mock` (local test mode) or `razorpay`. `mock` is refused in production |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | with razorpay | API keys (use `rzp_test_…` while developing) |
| `RAZORPAY_WEBHOOK_SECRET` | with razorpay | Secret you choose when creating the webhook |
| `BOOKING_HOLD_MINUTES` | no | How long an unpaid booking holds its room (default 15) |
| `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASS` `EMAIL_FROM` | no | Email delivery. Without these, emails are logged, not sent |
| `CLOUDINARY_URL` `CLOUDINARY_FOLDER` | no (prod: yes for uploads) | Image storage |
| `HOTEL_TIMEZONE` | no | Timezone for "today", arrivals and analytics days (default `Asia/Kolkata`) |
| `SEED_DEMO_PASSWORD` | no | Password for seeded demo accounts (development only) |

The server validates its environment at start-up and exits with a clear list of problems if anything is missing or unsafe. For example, it refuses mock payments in production, a short `JWT_SECRET`, or a localhost `CLIENT_URL` in production.

**Frontend: `client/.env`** (public build-time values only). Template: `client/.env.example`.

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Keep `/api` (Vite proxy locally, Vercel rewrite in production) |
| `DEV_API_PROXY` | Development only: where Vite forwards `/api` (default `http://localhost:5000`) |

Anything prefixed `VITE_` is bundled into public JavaScript. **Never** put database URLs, JWT secrets, SMTP passwords or Razorpay secret keys in the frontend. The Razorpay *key id* is public by design and comes from the API at runtime.

**Generating a secret:**

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Use a different `JWT_SECRET` for development and production.

## 11. Seeding the database

```bash
npm run seed                                   # from hotelpro/
SEED_DEMO_PASSWORD='Choose-a-pass-1' npm run seed   # pick the demo password yourself
```

- It creates 4 hotels, 12 room types (with seasonal rates), 45 rooms, 13 users, about 490 bookings spread over the past 60 days and the next 45 (roughly 30–40% occupancy over any 30-day window), matching test-mode payments, refunds, reviews, housekeeping tasks, service requests and notifications. All dates are relative to today.
- **Re-running is safe and repeatable: it wipes every HotelPro collection in the configured database first**, then recreates the same dataset. Never point it at a database with real data.
- It refuses to run when `NODE_ENV=production`.
- Seeded payments are stored as test-mode (`provider: mock`, `isTest: true`) and are labelled "Test payment" everywhere. Dashboards show a notice when revenue includes test payments.

## 12. Creating the first administrator

For a real deployment (without demo data), create the first admin with the one-time bootstrap command. It **refuses to run if an admin already exists**. The password is read from `ADMIN_PASSWORD` or a hidden prompt, never from a command-line flag, and is never logged.

```bash
cd server
npm run create-admin -- --email you@example.com --name "Your Name"
# you will be asked for the password twice (min 8 chars, letters and numbers)
```

For Render (no interactive terminal on the free tier), run it once from your Mac against the production database:

```bash
cd server
MONGODB_URI='mongodb+srv://…/hotelpro' JWT_SECRET='any-32+-char-string-for-this-run-only…' \
ADMIN_PASSWORD='a-strong-password-1' npm run create-admin -- --email you@example.com --name "Your Name"
```

Promote further admins from **Admin → Users & roles**. Every role change is audit-logged and signs the user out of existing sessions.

## 13. Running the frontend and backend

| Goal | Command (from `hotelpro/`) | URL |
|---|---|---|
| API + web together | `npm run dev` | web http://localhost:5173, API http://localhost:5000 |
| API only | `npm run dev:server` | http://localhost:5000/api/health |
| Web only | `npm run dev:client` | http://localhost:5173 |
| Zero-setup demo API | `npm run dev:memory --prefix server` | as above; data resets when stopped |
| Production build of web | `npm run build` | output in `client/dist` |
| Preview the build | `npm run preview --prefix client` (with the API running) | http://localhost:4173 |

Vite forwards `/api` and `/uploads` to the API, so the browser sees a single origin, exactly as in production.

## 14. Testing

```bash
npm test                 # backend then frontend (from hotelpro/)
npm run test:server      # 67 tests: Vitest + Supertest against an in-memory MongoDB
npm run test:client      # 23 tests: Vitest + Testing Library (jsdom)
npm run lint             # ESLint for both apps
npm run build            # production build of the frontend
```

No external services are needed. Payment providers and email are mocked, and MongoDB runs in memory.

**Backend coverage:** registration validation (including attempts to set a role), password hashing, login, JWT rejection (missing, tampered, wrong key, expired, `alg:none`), session revocation after password change or role change, email verification and password reset (single-use and expiring tokens, no account enumeration), role-based access for every role, hotel scoping for managers and staff, guest privacy (other users' bookings return 404), privilege escalation, operator-injection rejection, search and filters, invalid dates, price calculation including seasons and tax rounding, booking creation, client price tampering rejected, capacity, email-verification gate, overlap prevention, back-to-back stays, **8 concurrent requests for the last room produce exactly one booking**, hold expiry and reclaim, maintenance rooms excluded, the cancellation policy (100% / 50% / 0% / hotel-initiated), cancellation and refund queueing, refund processed exactly once, mock payment success and failure, Razorpay forged signature, uncaptured payment, amount mismatch, the successful verify path, webhook signature, webhook idempotency (duplicate delivery), webhook amount mismatch, `payment.failed`, check-in and check-out rules, housekeeping returning a room to sale, service requests, analytics from stored data, health check, JSON 404s, malformed JSON and cross-site write blocking.

**Frontend coverage:** utility formatting and timezone-safe dates, client validation rules, API error mapping, login and registration forms (client and server errors), safe post-login redirects (blocks `//evil.example`), search-bar validation, protected routes (signed out, wrong role), price breakdown rendering, status labels and the image fallback.

## 15. API documentation

All endpoints live under `/api` and return:

```json
{ "success": true, "data": { }, "meta": { "page": 1, "limit": 20, "total": 57, "pages": 3 } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Some fields are invalid", "details": [{ "field": "body.email", "message": "Enter a valid email address" }] } }
```

The full endpoint reference (purpose, auth, input, response) is in **[docs/API.md](docs/API.md)**. Summary:

| Area | Base path | Who |
|---|---|---|
| Health and config | `/api/health`, `/api/config` | public |
| Auth and profile | `/api/auth/*` | public / signed in |
| Hotels, room types, search | `/api/hotels`, `/api/room-types`, `/api/search` | public (writes: manager/admin) |
| Physical rooms | `/api/rooms` | staff / manager / admin |
| Bookings | `/api/bookings` | owner, or that hotel's team |
| Payments and webhooks | `/api/payments/*` | signed in / Razorpay |
| Reviews, notifications, service requests | `/api/reviews`, `/api/notifications`, `/api/service-requests` | signed in |
| Hotel operations | `/api/operations/*` | staff / manager / admin (assigned hotels) |
| Management | `/api/manage/*` | manager / admin (assigned hotels) |
| Dashboards | `/api/dashboard/guest`, `/api/dashboard/admin` | guest / admin |
| Administration | `/api/admin/*` | admin |

## 16. Payment configuration (Razorpay)

HotelPro uses **Razorpay**: Indian rupees, UPI and cards, and an official Node SDK.

**Local test mode (default):** `PAYMENT_PROVIDER=mock`. The payment page says *"Test mode"*, offers *Complete test payment* and *Simulate a declined payment*, and records the payment with `isTest: true`. The server refuses to start with mock payments when `NODE_ENV=production`.

**Razorpay test keys:**

1. Sign up at <https://dashboard.razorpay.com/signup>. Test mode needs no business verification.
2. Make sure the dashboard is in **Test Mode** (toggle at the top).
3. **Account & Settings → API Keys → Generate Key**. Copy the *Key Id* (`rzp_test_…`) and *Key Secret*.
4. In `server/.env`:

   ```
   PAYMENT_PROVIDER=razorpay
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
   ```
5. **Webhooks** (needed in production; optional locally): **Account & Settings → Webhooks → Add New Webhook**.
   - URL: `https://<your-vercel-domain>/api/payments/webhook/razorpay` (or the Render URL directly)
   - Secret: a long random string, also set as `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`
   - Razorpay cannot reach `localhost`. To test webhooks locally, use a tunnel such as `ngrok http 5000`.
6. Pay with Razorpay's published test cards or test UPI IDs (see Razorpay docs → *Test Card Details*).

**How a payment is confirmed:**

1. `POST /api/payments/orders` creates a Razorpay order for the **server-calculated** total.
2. Razorpay Checkout collects the payment. Card data never touches HotelPro.
3. `POST /api/payments/razorpay/verify` checks the HMAC signature, then **fetches the payment from Razorpay** and requires `captured`, the same order id, amount and currency. Only then is the booking confirmed.
4. The `payment.captured` webhook does the same independently, so a closed browser tab still confirms the booking. Duplicate deliveries are ignored (event ids are stored).
5. If payment lands after the 15-minute hold expired, the server tries to re-acquire a room. If none is free, the booking stays expired and a full refund request is raised automatically.

**Refunds:** cancelling queues a refund request (amount set by the cancellation policy). A manager or admin processes it from the refund queue. With Razorpay this calls the refund API, and the refund is marked *Refunded* only when Razorpay reports it processed (synchronously or via the `refund.processed` webhook). Test-mode refunds are recorded as such.

## 17. Email configuration

Emails sent: verification, password reset, booking confirmation, cancellation, payment updates (captured, failed, refunded), plus contact-form forwarding. Staff and manager alerts arrive as in-app notifications.

Set SMTP in `server/.env`. With Gmail, use an **App Password** (Google Account → Security → 2-Step Verification → App passwords):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@gmail.com
SMTP_PASS=your-16-char-app-password
EMAIL_FROM=HotelPro <you@gmail.com>
```

Any SMTP provider works (Brevo, Mailgun, SendGrid SMTP). **Without SMTP, nothing is sent and the app does not pretend otherwise:**

- The email is written to the API log, including the verification or reset link in development.
- In development, the last 50 messages are visible at <http://localhost:5000/api/dev/outbox>. This endpoint is disabled in production.
- The UI says "Email delivery is not configured" where relevant.

## 18. Image storage configuration

Uploads are validated three ways: JPEG, PNG or WebP only, at most 5 MB, and the file signature must match (not just the extension). Only managers (for their hotels) and admins can upload. Filenames are generated by the server.

- **Production:** create a free Cloudinary account (<https://cloudinary.com>). Copy the *API environment variable* (`cloudinary://<key>:<secret>@<cloud_name>`) from the dashboard into `CLOUDINARY_URL` on Render.
- **Development without Cloudinary:** files go to `server/uploads/` (git-ignored) and are served at `/uploads/…`.
- **Production without Cloudinary:** uploads are disabled with a clear message, because Render's disk is wiped on every deploy. Managers can still add images by URL.
- The seed data uses Unsplash photo URLs (Unsplash licence, credited in the UI). Any image that fails to load shows a "Photo unavailable" placeholder.

## 19. Git and GitHub

```bash
# 1. Check Git (macOS asks to install the Command Line Tools if missing)
git --version

# 2. Configure your identity (once per machine)
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global init.defaultBranch main
```

3. Create a GitHub account at <https://github.com/signup> if you do not have one.
4. On GitHub: **New repository** → name `hotelpro` → Private or Public → **do not** add a README, .gitignore or licence (the project has them) → *Create repository*.

```bash
# 5. Initialise the repository (inside hotelpro/)
cd ~/Projects/hotelpro
git init

# Check that no secrets are about to be committed:
git status --ignored | grep -E "\.env$|node_modules" || true   # these must be listed as ignored
git add .
git status            # .env files and node_modules must NOT appear in "Changes to be committed"

# 6. First commit
git commit -m "Initial commit: HotelPro MERN hotel management system"

# 7. Connect to GitHub (copy the URL from your new repo page)
git remote add origin https://github.com/<your-username>/hotelpro.git

# 8. Push main
git push -u origin main
```

When `git push` asks for a password, use a **Personal Access Token** (GitHub → Settings → Developer settings → Personal access tokens → *Fine-grained*, with contents read/write on this repo), or install the GitHub CLI (`brew install gh`, then `gh auth login`).

```bash
# 9. Future changes
git add .
git commit -m "Describe the change"
git push
```

**10. Keeping credentials out of Git:** `.env` files are ignored, and only `.env.example` files with placeholders are committed. If you ever commit a secret, **rotate it immediately** (new Atlas password, new JWT secret, new Razorpay keys). Deleting the file in a later commit does not remove it from history.

## 20. Deployment instructions

Target: **Vercel** (frontend) + **Render** (API) + **MongoDB Atlas** (database), all on free plans. A beginner-level, dashboard-by-dashboard guide is in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**, with a tick-list in **[docs/DEPLOYMENT_CHECKLIST.md](docs/DEPLOYMENT_CHECKLIST.md)**. In short:

1. **Atlas**: cluster, database user, network access `0.0.0.0/0`, connection string ([section 9](#9-mongodb-atlas-setup)).
2. **Render** → New → Web Service → connect the GitHub repo. Settings:
   - Root Directory: `server`
   - Build Command: `npm ci --omit=dev`
   - Start Command: `npm start`
   - Health Check Path: `/api/health`
   - Environment: `NODE_ENV=production`, `TRUST_PROXY=2`, `MONGODB_URI`, `JWT_SECRET`, `CLIENT_URL=https://<your-app>.vercel.app`, `PAYMENT_PROVIDER=razorpay`, Razorpay keys and webhook secret, `CLOUDINARY_URL`, SMTP settings.
   - The API listens on Render's `PORT` and binds to `0.0.0.0`. Note the service URL, e.g. `https://hotelpro-api.onrender.com`.
3. **Edit `client/vercel.json`**: replace `YOUR-RENDER-SERVICE` in both rewrites with your Render service name, then commit and push.
4. **Vercel** → Add New → Project → import the repo. Root Directory: `client`. Framework: Vite. Build: `npm run build`. Output: `dist`. No secret environment variables are needed (`VITE_API_BASE_URL` defaults to `/api`).
5. Set `CLIENT_URL` on Render to the final Vercel URL (no trailing slash) and redeploy.
6. Create the first admin ([section 12](#12-creating-the-first-administrator)) and set the Razorpay webhook URL ([section 16](#16-payment-configuration-razorpay)).
7. Test: `https://<vercel-app>/api/health` returns `{"status":"ok","db":"connected"}`, then register, verify, book and pay with a test card.

**Free-plan limits:** Render free services sleep after about 15 minutes idle, and the first request afterwards takes 30–60 s (a cold start). Do a warm-up request before a demo. Render's free plan also has monthly usage limits. Atlas M0 has 512 MB of storage and shared resources. Vercel Hobby is for non-commercial use.

## 21. Demo credentials

Demo accounts exist only after you run the seeder. There are **no hardcoded passwords**: every demo account shares the password you set in `SEED_DEMO_PASSWORD`, or a random one printed by the seeder.

| Role | Email | Notes |
|---|---|---|
| Admin | `admin@hotelpro.demo` | everything |
| Manager | `manager@hotelpro.demo` | The Ivory Crest (Udaipur) and Marigold Bay (Goa) |
| Manager | `manager2@hotelpro.demo` | Deodar Ridge (Manali) and Harbour Line (Mumbai) |
| Staff | `staff@hotelpro.demo` | front desk, Udaipur |
| Staff | `housekeeping@hotelpro.demo` | housekeeping, Udaipur |
| Staff | `staff2@hotelpro.demo` | front desk, Goa |
| Staff | `staff3@hotelpro.demo` | Manali and Mumbai |
| Guest | `guest@hotelpro.demo` | has an in-house stay, an upcoming trip, past stays and a cancelled booking |

Suggested demo for a mentor (about 10 minutes):

1. As the guest: search Goa for next week, book, take a test payment, open the invoice, send a service request, then cancel and see the refund preview.
2. As `staff2`: see the request and resolve it.
3. As `staff`: check in an arrival, check out a departure, and watch the housekeeping task appear and finish it.
4. As `manager`: process the refund, change a price and add a season, then look at the reports.
5. As `admin`: change a user's role, see it in the audit log, and change the cancellation policy.

## 22. Common errors and troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Invalid server environment configuration: MONGODB_URI is required` | `server/.env` is missing. Run `cp server/.env.example server/.env` and fill it in |
| `JWT_SECRET must be at least 32 characters` | Generate one with the command in section 10 |
| `MongoServerSelectionError` / timeout | Atlas Network Access does not include your IP (or `0.0.0.0/0` for Render); or wrong cluster host |
| `bad auth : authentication failed` | Wrong DB user or password; URL-encode special characters in the password |
| `EADDRINUSE: address already in use :::5000` | Another process uses port 5000 (on macOS, *AirPlay Receiver* can). Run `lsof -i :5000` then `kill <PID>`, or set `PORT=5050` and `DEV_API_PROXY=http://localhost:5050` |
| Browser shows "Cannot reach the HotelPro server" | The API is not running, or (production) the `vercel.json` rewrite still says `YOUR-RENDER-SERVICE` |
| 403 `Request origin not allowed` | `CLIENT_URL` on Render does not exactly match the site origin (scheme, domain, no trailing slash). Add preview URLs to `CORS_ORIGINS` |
| Signed in, then immediately signed out (production) | Cookie not stored. Make sure the frontend calls `/api` on its own domain (Vercel rewrite). If you call Render directly, set `COOKIE_SAMESITE=none` |
| "Please verify your email address before making a booking" | No SMTP configured. Find the link in the API log or `/api/dev/outbox`, or have an admin tick *Email address confirmed* |
| 429 "Too many attempts" | Rate limit on login/registration (20 per 15 min per IP). Wait, or restart the dev server |
| Tests hang on first run | mongodb-memory-server is downloading MongoDB. Allow a few minutes on first run |
| Render deploy fails with `Cannot find module` | The Root Directory is not `server`, or the build command ran in the wrong folder |
| Render logs show `PAYMENT_PROVIDER=mock is not allowed` | Expected safety check. Configure Razorpay keys for production |
| Uploads say storage is not configured (production) | Set `CLOUDINARY_URL` on Render |
| Seeded "today" arrivals look wrong | Dates are computed in `HOTEL_TIMEZONE` (default Asia/Kolkata). Re-run the seed on the day you demo |

## 23. Security notes and limitations

What is in place:

- **Passwords:** bcrypt (cost 12). They are never returned, and responses take the same time whether or not the account exists.
- **Sessions:** HS256 JWT in an `HttpOnly`, `Secure` (production), `SameSite=Lax` cookie, never readable by JavaScript. On every request the user is reloaded from the database and a per-user `tokenVersion` is checked, so suspension, role change, password reset or password change revokes existing sessions immediately.
- **CSRF:** SameSite cookies, plus an Origin/Referer allow-list check on every state-changing request.
- **One-time tokens** (verification, reset) are 256-bit random values stored as SHA-256 hashes, single use and expiring (24 h and 30 min).
- **Authorisation:** role middleware on every protected route, plus hotel-scope checks. Another user's booking returns 404 to avoid leaking that it exists. Self-registration always creates a guest. Admins cannot demote or suspend themselves or remove the last admin.
- **Input:** Zod schemas on params, query and body with `.strict()` on writes (unknown fields like `total` or `role` are rejected). Keys starting with `$` are rejected (NoSQL injection). Regex search input is escaped. Body size is limited.
- **Errors:** one handler with safe messages and no stack traces in responses.
- **Headers:** Helmet on the API; `nosniff`, `DENY` framing and a referrer policy on Vercel.
- **Rate limits:** global, auth, email, booking and contact.
- **Payments:** amounts come from the server, signatures are verified, there is a server-side capture check, webhook idempotency, refunds are claimed atomically so they cannot be processed twice, and no card data is stored.
- **Audit log:** logins (including failures), password events, role and status changes, hotel, room, pricing and settings changes, assignments, cancellations, check-ins and outs, and refunds.

Limitations to be aware of:

- There is no account lockout beyond rate limiting, and no two-factor authentication.
- JWTs are not rotated mid-session. Sessions last 1 day and are revoked through `tokenVersion`.
- Rate-limit counters are kept in memory per instance. Use a shared store (Redis) if you run more than one instance.
- The CSRF check allows requests that have no Origin header (non-browser clients). Browsers always send Origin on cross-site writes, so this is safe for browser sessions.
- The Content-Security-Policy on the SPA itself is not set (Vercel headers set the basics). Razorpay Checkout needs `checkout.razorpay.com` if you add a CSP.

## 24. Known limitations

- **One currency (INR) and one GST rate**, platform-wide and set by an admin. Real hotel GST in India depends on the room rate band. The rate is configurable, but slab logic is not implemented.
- **Guests book a room type; the server assigns the physical room.** Staff can reassign a room within the same type.
- **Calendar dates use one timezone** (`HOTEL_TIMEZONE`). Hotels in different timezones would need a per-hotel timezone.
- **No partial-stay modifications** (changing dates). Guests cancel and rebook. Early check-out releases the remaining nights but does not refund them automatically.
- **Mock payments and seeded data are test data.** Revenue figures are labelled when they include them.
- **Refunds are processed by a manager or admin**, not automatically, by design.
- Email templates are plain HTML without attachments. Invoices are printable or saved as PDF from the browser, not generated as PDF files on the server.
- The UI is in English only and in a light theme only.
- Render's free tier sleeps when idle (cold starts) and has no persistent disk.

## 25. Future improvements

- Date changes and room upgrades on existing bookings, with price-difference payment or refund.
- A per-hotel timezone, currency and tax slabs; coupons and corporate rates.
- Server-generated PDF invoices attached to confirmation emails.
- Background jobs (BullMQ and Redis) for emails and hold expiry, and a Redis store for rate limits.
- Two-factor authentication for staff and admins, and account lockout after repeated failures.
- An availability calendar view and drag-to-reassign room board for managers.
- Real-time updates for the front desk (WebSocket / SSE).
- Playwright end-to-end tests in CI (GitHub Actions) and preview deployments per pull request.
- A dark theme and Hindi localisation.
