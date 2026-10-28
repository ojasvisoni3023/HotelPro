# HotelPro API reference

Base URL: `/api` (locally `http://localhost:5000/api`, or through the Vite or Vercel proxy at `<site>/api`).

**Auth:** an HTTP-only session cookie `hp_session`, set by `/auth/login` or `/auth/register`. Browsers send it automatically (Axios `withCredentials: true`). For curl, use `-c cookies.txt -b cookies.txt`.

**Envelope:**

```jsonc
// success
{ "success": true, "data": <payload>, "meta": { "page": 1, "limit": 20, "total": 57, "pages": 3 } }   // meta on lists
// error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Some fields are invalid",
  "details": [{ "field": "body.email", "message": "Enter a valid email address" }] } }
```

**Status codes:**

| Code | Meaning |
|---|---|
| 200 / 201 | OK / created |
| 400 | Validation, bad id or malformed JSON |
| 401 | Not signed in or session revoked |
| 403 | Wrong role, not assigned to the hotel, bad Origin, or email not verified |
| 404 | Not found, or not yours |
| 409 | No availability, or a duplicate |
| 422 | Business rule (invalid transition, too early to check in, …) |
| 429 | Rate limited |
| 503 | Payment provider or storage unavailable |

**Lists:** take `page` (default 1) and `limit` (max 100).

**Who:** `public` · `user` (any signed-in role) · `guest` · `staff` · `manager` · `admin`. `team` = staff, manager or admin, restricted to **assigned hotels** (admins: all).

---

## System

| Method & path | Who | Purpose | Input → Output |
|---|---|---|---|
| GET `/health` | public | Deployment health check | → `{status:'ok', db:'connected', uptimeSeconds}`; 503 if the DB is down |
| GET `/config` | public | Public settings for the SPA | → tax rate, cancellation policy text, limits, support contacts, announcement, `payment{provider, keyId, testMode}`, `emailDelivery`, `imageStorage`, `today` |
| POST `/contact` | public (5/h) | Contact form → admin notification (+ email if SMTP) | `{name, email, subject, message}` → `{received, emailForwarded}` |
| GET `/dev/outbox` | public, **dev only** | Last 50 unsent emails (no SMTP) | → `[{to, subject, text, at}]`; 404 in production |

## Auth (`/auth`)

| Method & path | Who | Purpose | Input → Output |
|---|---|---|---|
| POST `/register` | public (20/15 min) | Create a guest account, send verification, sign in | `{name, email, password, phone?}` → `{user, verificationEmailDelivered}`. Any `role` field is rejected |
| POST `/login` | public (20/15 min) | Sign in | `{email, password}` → `{user}`; 401 `INVALID_CREDENTIALS`, 403 `ACCOUNT_SUSPENDED` |
| POST `/logout` | any | Clear the cookie | → `{loggedOut}` |
| GET `/session` | public | Current session for the SPA | → `{user}` or `{user:null}` |
| GET `/me` | user | Current user (401 if none) | → `{user}` |
| POST `/verify-email` | public | Confirm email | `{token}` → `{verified}`; tokens are single-use, 24 h |
| POST `/resend-verification` | user (6/h) | New verification email | → `{sent, delivered}` |
| POST `/forgot-password` | public (6/h) | Send reset link (same response whether or not the account exists) | `{email}` → `{message}` |
| POST `/reset-password` | public | Set a new password; revokes all sessions | `{token, password}` → `{reset}`; tokens are single-use, 30 min |
| POST `/change-password` | user | Change password; keeps this session, revokes others | `{currentPassword, newPassword}` → `{changed}` |
| PATCH `/profile` | user | Update name, phone, address (not email or role) | `{name?, phone?, address?{…}}` → `{user}` |

Password rule: 8–128 characters, including at least one letter and one number.

## Catalogue

| Method & path | Who | Purpose | Input → Output |
|---|---|---|---|
| GET `/hotels` | public | List active hotels (team: `includeInactive=true` for their own hotels) | `?q, city, sort=rating\|name\|price_asc\|price_desc, page, limit` → hotel cards with `minPrice` |
| GET `/hotels/:idOrSlug` | public | Hotel, active room types, latest reviews, policy text | → `{hotel, roomTypes, reviews, cancellationPolicy}` |
| GET `/hotels/:id/reviews` | public | Published reviews, paginated | → `[{rating, title, comment, guestName, createdAt}]` |
| POST `/hotels` | admin | Create a hotel | hotel body (name, description ≥ 20, address{line1, city, country}, …) → hotel |
| PATCH `/hotels/:id` | manager (own), admin | Edit a hotel; only admins may change `status` | partial body → hotel |
| DELETE `/hotels/:id` | admin | Delete; **deactivates instead** if it has bookings | → `{deleted}` or `{deactivated}` |
| POST `/hotels/:id/images` | manager (own), admin | Upload a photo (`multipart`, field `image`, JPEG/PNG/WebP ≤ 5 MB) | → image |
| DELETE `/hotels/:id/images/:imageId` | manager (own), admin | Remove a photo | → `{deleted}` |
| GET `/room-types?hotel=` | public (team sees inactive) | Room types of a hotel with `roomCount` | → list |
| GET `/room-types/:id` | public | Room type, hotel, other types, reviews, policy, tax rate | → object |
| GET `/room-types/:id/availability` | public | **Live availability + server quote** | `?checkIn, checkOut, guests` → `{available, availableRooms, fitsGuests, quote{nightly[], subtotal, taxes, total, averageNightly}, cancellationPolicy}` |
| POST `/room-types` | manager (own), admin | Create a room type | `{hotel, name, maxGuests, basePrice, seasonalRates?[{name,startDate,endDate,price}], …}` |
| PATCH `/room-types/:id` | manager (own), admin | Edit details and pricing (audit: `pricing.update`) | partial |
| DELETE `/room-types/:id` | manager (own), admin | Delete, or deactivate if it has rooms or bookings | |
| POST/DELETE `/room-types/:id/images…` | manager (own), admin | Photos, as for hotels | |
| GET `/search` | public | **Room search** | `?location, hotel, checkIn, checkOut, guests, minPrice, maxPrice, category, amenities=a,b, onlyAvailable, sort=recommended\|price_asc\|price_desc\|rating\|capacity, page, limit` → `[{roomType, hotel, nightlyPrice, quote, availableRooms, totalRooms}]`, `meta.stay`, `meta.facets.amenities` |

## Physical rooms (`/rooms`): team only

| Method & path | Who | Purpose |
|---|---|---|
| GET `/rooms?hotel=&category=&status=&q=` | team | Rooms with `currentGuest` and `soldTonight` |
| POST `/rooms` | manager, admin | Add a room `{hotel, category, roomNumber, floor?, status?, notes?}` |
| PATCH `/rooms/:id` | manager, admin | Edit (type change blocked while it has active bookings) |
| PATCH `/rooms/:id/status` | team | Operational status (`available`, `cleaning`, `maintenance`, `out_of_service`); `occupied` is set only by check-in |
| DELETE `/rooms/:id` | manager, admin | Only rooms without booking history |

## Bookings (`/bookings`)

| Method & path | Who | Purpose | Input → Output |
|---|---|---|---|
| POST `/bookings` | user with verified email (40/15 min) | Create a **pending** booking and hold a room for 15 min | `{categoryId, checkIn, checkOut, guests, guestDetails?{name,email,phone}, specialRequests?}` → booking. **No price fields accepted.** 409 `NO_AVAILABILITY`, 403 `EMAIL_NOT_VERIFIED` |
| GET `/bookings/mine` | user | Own bookings | `?scope=upcoming\|past\|cancelled\|all, page` |
| GET `/bookings/:id` | owner or team | Booking, payments, service requests, review, `actions{canPay, canCancel, canReview, canRequestService, hasInvoice}`, `refundPreview` | 404 for anyone else |
| POST `/bookings/:id/cancel` | owner, or manager/admin of the hotel | Cancel per policy; queues the refund; releases the room | `{reason?}` → booking; 422 `INVALID_TRANSITION` |
| GET `/bookings/:id/invoice` | owner or team | Invoice data (after payment) | → seller, billed to, lines, subtotal, GST, total, paid, refunded, `testMode` |

## Payments (`/payments`)

| Method & path | Who | Purpose | Input → Output |
|---|---|---|---|
| GET `/payments/config` | public | Provider, public key id, test mode | |
| POST `/payments/orders` | owner | Create (or reuse) a provider order for the **server total** | `{bookingId}` → `{provider, keyId, orderId, amount, amountMinor, currency, testMode, holdExpiresAt, prefill}`; 422 if expired or already paid |
| POST `/payments/razorpay/verify` | owner | Verify the Checkout result: HMAC signature + server fetch must show `captured`, with the same order, amount and currency | `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` → `{bookingId, status, paymentStatus}` |
| POST `/payments/webhook/razorpay` | Razorpay | Raw-body HMAC (`X-Razorpay-Signature`), idempotent on `X-Razorpay-Event-Id`. Handles `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed` | → `{duplicate, event}`; 400 bad signature |
| POST `/payments/mock/complete` | owner, **mock mode only** | Simulate an outcome in local test mode | `{orderId, outcome:'success'\|'failure'}`; 404 when Razorpay is active |
| GET `/payments/mine` | user | Payment history with refunds | |

## Reviews, notifications, service requests

| Method & path | Who | Purpose |
|---|---|---|
| POST `/reviews` | owner of a `checked_out` booking | `{bookingId, rating 1–5, title?, comment ≥ 10}`; one per booking |
| GET `/reviews/mine` | user | Own reviews (including moderation note) |
| GET `/notifications?unread=true` | user | List (`meta.unread`) |
| GET `/notifications/unread-count` | user | `{unread}` |
| PATCH `/notifications/:id/read` · POST `/notifications/read-all` | user | Mark read |
| POST `/service-requests` | owner of a confirmed or in-house booking | `{bookingId, type, description, priority}`; notifies the hotel team |
| GET `/service-requests/mine` · POST `/service-requests/:id/cancel` | owner | List and cancel own open requests |

## Hotel operations (`/operations`): team, assigned hotels

| Method & path | Purpose |
|---|---|
| GET `/operations/dashboard?hotel=` | Counts (arrivals, departures, in house, open tasks and requests), room status breakdown, queues |
| GET `/operations/front-desk?hotel=` | Today's arrivals, departures, in-house guests and overdue departures (hotel timezone) |
| GET `/operations/lookup?q=&hotel=` | Find reservations by code, name, email or phone |
| GET `/operations/movements?hotel=` | Arrivals and departures for the next 7 days |
| GET `/operations/team?hotel=` | Active team members (for assignment drop-downs) |
| POST `/operations/bookings/:id/check-in` | `{roomId?}`. Requires a confirmed and paid booking, between the arrival day and departure; room → occupied |
| POST `/operations/bookings/:id/check-out` | Room → cleaning, creates a departure-clean task, issues the invoice, releases unused nights |
| POST `/operations/bookings/:id/no-show` | After the arrival day; releases the room |
| GET/POST `/operations/housekeeping`, PATCH `/operations/housekeeping/:id` | Tasks: create, assign (team members of that hotel only), progress. Finishing a clean → room available |
| GET `/operations/service-requests`, PATCH `/operations/service-requests/:id` | Status, assignment, note; the guest is notified on status change |

## Management (`/manage`): manager (assigned hotels) and admin

| Method & path | Who | Purpose |
|---|---|---|
| GET `/manage/hotels` | team | Hotels the user may operate |
| GET `/manage/reservations` | team | `?hotel, status, paymentStatus, from, to (check-in range), q, sort=checkIn\|-checkIn\|-createdAt, page` |
| PATCH `/manage/reservations/:id/room` | manager, admin | Reassign to another free room of the same type `{roomId}` |
| GET `/manage/refunds?status=requested\|processing\|processed\|rejected&hotel=` | manager, admin | Refund queue |
| POST `/manage/payments/:paymentId/refunds/:refundId/process` | manager, admin | Execute the refund (Razorpay refund API, or test mode). Claimed atomically; cannot run twice |
| POST `/manage/payments/:paymentId/refunds/:refundId/reject` | manager, admin | `{note}`; the guest is notified |
| GET/POST `/manage/assignments`, PATCH/DELETE `/manage/assignments/:id` | manager (staff only, own hotels), admin | `{hotel, email, role:'manager'\|'staff', position?}`; the user's account role must match |
| GET `/manage/analytics?hotel=&from=&to=` | manager, admin | Revenue, refunds, net, test-mode share, booking value, pending value, occupancy, status counts, daily series. Definitions are in ARCHITECTURE.md §6 |

## Dashboards

| Method & path | Who | Purpose |
|---|---|---|
| GET `/dashboard/guest` | user | Upcoming and past stays, recent payments, unread notifications, status counts |
| GET `/dashboard/admin?from=&to=` | admin | Totals (users, hotels, rooms, bookings, pending refunds, hidden reviews), users by role, platform analytics, recent audit activity |

## Administration (`/admin`): admin only

| Method & path | Purpose |
|---|---|
| GET `/admin/users?q=&role=&status=` | Users |
| PATCH `/admin/users/:id` | `{role?, status?, emailVerified?}`. Cannot change your own role or status, or remove the last admin. Role and status changes revoke sessions and are audit-logged with before/after |
| GET `/admin/payments?status=&provider=&hotel=&q=` | All payments |
| GET `/admin/reviews?status=&hotel=&rating=` · PATCH `/admin/reviews/:id` | Moderate `{status:'published'\|'hidden', moderationNote?}`; the hotel rating is recomputed |
| GET `/admin/audit-logs?category=&q=` | Audit trail |
| GET/PATCH `/admin/settings` | `{taxRatePercent, freeCancellationHours, lateCancellationRefundPercent, maxStayNights, bookingWindowDays, supportEmail, supportPhone, announcement}` |

## Example (curl)

```bash
B=http://localhost:5000/api
curl -s -c c.txt -H 'content-type: application/json' -d '{"email":"guest@hotelpro.demo","password":"<seed password>"}' $B/auth/login
curl -s "$B/search?location=goa&checkIn=2026-11-10&checkOut=2026-11-12&guests=2" | jq '.data[0].quote.total'
curl -s -b c.txt -H 'content-type: application/json' -d '{"categoryId":"<id>","checkIn":"2026-11-10","checkOut":"2026-11-12","guests":2}' $B/bookings
```
