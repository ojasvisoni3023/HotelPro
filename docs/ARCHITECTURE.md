# HotelPro architecture

## 1. Deployment topology

```
┌──────────────┐  HTTPS, one origin   ┌───────────────────────┐   HTTPS (rewrite)   ┌─────────────────────┐   TLS   ┌───────────────┐
│   Browser    │ ───────────────────▶ │ Vercel                │ ──────────────────▶ │ Render              │ ──────▶ │ MongoDB Atlas │
│ React SPA    │  /            → SPA  │ static client/dist    │  /api/*, /uploads/* │ Express API         │         │ (M0 cluster)  │
│ cookie:      │  /api/*  → rewrite   │ + vercel.json rewrites│                     │ node src/server.js  │         └───────────────┘
│ hp_session   │                      └───────────────────────┘                     │  ├─ Razorpay SDK ───┼──▶ Razorpay
└──────────────┘                                                                    │  ├─ Nodemailer ─────┼──▶ SMTP
        ▲  Razorpay Checkout iframe (card/UPI data never reaches HotelPro)          │  └─ Cloudinary SDK ─┼──▶ Cloudinary
        └───────────────────────────────────────────────────────────────────────────┘                     │
                                                         Razorpay webhooks ──────────────▶ /api/payments/webhook/razorpay
```

**Why proxy `/api` through Vercel?** The browser sees one origin, so the session cookie is first-party:

- `SameSite=Lax` works, with no `SameSite=None` and no third-party-cookie blocking in Safari or Chrome.
- CORS is not involved for normal requests.
- The frontend has no API URL baked into the bundle (`VITE_API_BASE_URL=/api`).

Locally, the Vite dev server performs the same proxying (`vite.config.js`).

## 2. Request lifecycle (example: `POST /api/bookings`)

```
React (Checkout.jsx)
  api.post('/bookings', { categoryId, checkIn, checkOut, guests, guestDetails })   ← no price is sent
     │ Axios (withCredentials) → cookie hp_session travels automatically
     ▼
Express app.js
  1 helmet()                          security headers
  2 cors()                            allow-list = CLIENT_URL + CORS_ORIGINS
  3 express.json({ limit: 200kb })    (the Razorpay webhook route is mounted before this with a raw parser)
  4 cookieParser()
  5 rejectOperatorKeys                400 if any key starts with "$" (NoSQL injection)
  6 globalLimiter, originCheck        rate limit; 403 if Origin/Referer not in the allow-list (CSRF)
routes/index.js
  7 bookingLimiter
  8 authenticate                      verify JWT (HS256) → load User → status active → tokenVersion matches
  9 requireVerifiedEmail
 10 validate({ body: createBookingSchema })   Zod .strict(): unknown fields such as "total" are rejected
controllers/bookingController.createBooking
 11 bookingService.createBooking(user, input)
      validateStay()                  dates, past check, max nights, booking window (hotel timezone)
      load RoomCategory + Hotel       both must be active
      quoteStay()                     nightly rates incl. seasons → subtotal → GST → total (server)
      availability.acquireRoom()      insert RoomNight locks (unique {room,date}) with expiresAt = hold
      Booking.create({... status:'pending', holdExpiresAt })
 12 audit(...)                        AuditLog entry
 13 created(res, booking)             { success:true, data }
errors anywhere → errorHandler        ApiError / Mongoose / duplicate key / Multer → safe JSON error
```

Layers and responsibilities:

| Layer | Folder | Rule |
|---|---|---|
| Routes | `server/src/routes` | Wiring only: path → middleware → controller |
| Middleware | `server/src/middleware` | Cross-cutting: auth, role, validation, security, errors |
| Validators | `server/src/validators` | Zod schemas; controllers read only `req.valid.*` |
| Controllers | `server/src/controllers` | HTTP concerns: load, authorise ownership, call a service, shape the response |
| Services | `server/src/services` | Business rules: availability, pricing, bookings, payments, analytics, email, uploads, access |
| Models | `server/src/models` | Schemas, indexes, enums, transition tables |
| Config | `server/src/config` | Environment validation (fails fast) and DB connection |

## 3. Authentication and authorisation

- **Login** checks the password hash with bcrypt (a dummy hash keeps timing equal for unknown emails). It then sets `hp_session` = JWT `{ sub: userId, v: tokenVersion }`, `HttpOnly`, `Secure` in production, `SameSite=Lax`, expiring in 1 day.
- **Every request** re-reads the user. A suspended user, or a changed `tokenVersion` (password reset or change, role change, suspension), gives a 401. Revocation is therefore immediate, with no token blacklist.
- **Roles:** `authorize('admin','manager',…)` on routes. **Hotel scope:** `accessService` derives the hotels a manager or staff member may touch from active `StaffAssignment` documents. Every hotel-scoped query or mutation calls `assertHotelAccess` or `hotelScopeFilter`.
- **Ownership:** `bookingAccess.loadBookingFor()` returns a booking only to its guest or the hotel's team. Anyone else gets 404.
- **Frontend guards** (`ProtectedRoute`) only decide what to render. The API is the security boundary.

## 4. Inventory and double-booking prevention

A booking is for a **room type** (`RoomCategory`); the server assigns a physical `Room`. Every night a room is held or sold is a `RoomNight { room, date, booking, expiresAt }` document with a **unique index on `{ room, date }`**.

```
acquireRoom(type, checkIn, checkOut):
  rooms   = sellable rooms of the type (not maintenance / out_of_service)
  reclaim = expire any lapsed holds on those nights (releases their locks)
  busy    = rooms with a blocking lock on any night  (expiresAt null OR in the future)
  for room in rooms − busy:
      insertMany(one RoomNight per night)          ← atomic per document; unique index
      success → return room
      duplicate-key error → delete our partial inserts, try next room
  return none → 409 NO_AVAILABILITY
```

- Two requests racing for the same room-night: MongoDB lets exactly one insert succeed. This needs no multi-document transactions, so it works on any deployment (Atlas, a local standalone server, the in-memory test server). Verified by a test that fires 8 concurrent bookings for 1 room.
- **Holds:** a pending booking's locks carry `expiresAt = now + 15 min`. Payment confirmation clears `expiresAt` (making the locks permanent). A sweeper runs every minute, and `acquireRoom` reclaims lapsed holds lazily, so abandoned checkouts free inventory.
- **Release:** cancellation and no-show delete the locks. Early check-out deletes the remaining nights.
- **Availability queries** count rooms with no blocking lock across the range (`availabilityByCategory`).

## 5. Booking and payment state

```
Booking.status        pending ─pay→ confirmed ─check-in→ checked_in ─check-out→ checked_out
                         │              │  └─(after arrival day) no_show
                         ├─timeout→ expired ─(late payment re-acquires room)→ confirmed
                         └─cancel→ cancelled ←─cancel── confirmed
Booking.paymentStatus unpaid → paid → refund_pending → refunded | partially_refunded
                      unpaid → failed (retry allowed while the hold lasts)
Payment.status        created → captured → refunded | partially_refunded ;  created → failed
Refund.status         requested → processing → processed | failed ;  requested → rejected
```

Transitions are guarded by `BOOKING_TRANSITIONS` and by **conditional updates** (`findOneAndUpdate({ _id, status: <expected> }, …)`), so concurrent actors (two admins, a webhook racing the browser callback) cannot apply the same transition twice.

**Payment confirmation flow (Razorpay):**

1. `POST /payments/orders` creates a Razorpay order from `booking.pricing.total`.
2. Checkout returns `{order_id, payment_id, signature}` to the browser.
3. `POST /payments/razorpay/verify` checks the HMAC signature with the key secret, then calls `payments.fetch(payment_id)` and requires `captured` with matching order, amount and currency. Only then does `markCaptured` run.
4. Independently, the `payment.captured` webhook checks the raw-body HMAC with the webhook secret and records the event id in `WebhookEvent` (a unique index gives idempotency) before calling `markCaptured`.
5. `markCaptured` is conditional on `status ∈ {created, failed}`, so whichever path arrives second is a no-op.

## 6. Pricing, policy and analytics definitions

- **Nightly rate:** the seasonal rate whose `[startDate, endDate]` contains the night (the latest-starting season wins on overlap), otherwise `basePrice`.
- **Subtotal** = Σ nightly rates. **Taxes** = round(subtotal × GST% / 100, 2 dp). **Total** = subtotal + taxes. These are stored on the booking at creation, so later price changes do not affect existing bookings.
- **Cancellation refund:**
  - 100% if cancelled at least `freeCancellationHours` before the check-in time (the hotel's `checkInTime` in `HOTEL_TIMEZONE`);
  - `lateCancellationRefundPercent` if cancelled after that but before check-in;
  - 0% once the stay has started;
  - 100% if the hotel cancels.
  Defaults are 48 h and 50%, editable by admins.
- **Analytics** (`analyticsService.summary`), with all periods interpreted in `HOTEL_TIMEZONE`:

  | Metric | Definition |
  |---|---|
  | Revenue received | Σ `Payment.amount` captured in the period (by `capturedAt`) |
  | Refunded | Σ refunds with status `processed` in the period (by `processedAt`) |
  | Net revenue | received − refunded |
  | Test-mode revenue | the part of revenue received from `isTest` payments |
  | Booking value | Σ `pricing.total` of confirmed, checked-in or checked-out bookings whose check-in is in the period (an estimate; not cash) |
  | Awaiting payment | Σ totals of `pending` bookings created in the period |
  | Occupancy | permanent `RoomNight` count ÷ (sellable rooms × nights in period) |

## 7. Frontend structure

- `main.jsx` → `ErrorBoundary` → `BrowserRouter` → `ConfigProvider` (public settings) → `AuthProvider` (session from `/auth/session`) → `App` (routes).
- Public and booking pages use `PublicLayout`. Account, staff, manager and admin areas use `DashboardLayout` with a role-specific sidebar. Staff and manager areas add `HotelScopeProvider` (which hotel is being operated).
- Signed-in areas are lazily loaded chunks.
- Data loading uses the `useApi(loader, deps)` hook, which gives `{ data, meta, loading, error, reload }` and ignores stale responses. Every list renders skeletons, empty states and error states with retry.
- All money and date formatting is in `utils/format.js`. Booking dates are calendar dates stored at UTC midnight and always formatted in UTC, so they never shift a day.
- Design tokens are in `styles/theme.css` (lake navy, ivory, brass; Marcellus for headings, Manrope for text and figures). Chart colours were validated for colour-blind separation and contrast.

## 8. Background work

- **Hold sweeper:** `setInterval` every 60 s in `server.js` expires lapsed `pending` bookings and their locks. It is idempotent; with several instances, each runs it harmlessly.
- **Email and notifications** are sent inline after the database change has been committed. Failures are logged and never roll back the booking.
