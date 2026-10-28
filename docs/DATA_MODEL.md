# HotelPro data model

MongoDB with Mongoose. All collections have `createdAt` / `updatedAt` unless noted.

## Relationships

```
User ─1───*─ StaffAssignment ─*───1─ Hotel ─1───*─ RoomCategory ─1───*─ Room
 │                                     │               │                 │
 │ guest                               │               │                 │
 └─1───*─ Booking ─*────────────────1──┘───────────────┘──────────1──────┘
            │  1
            ├──*─ RoomNight        (one per held/sold night; unique {room, date})
            ├──*─ Payment ──*─ refunds[] (embedded)
            ├──0..1─ Review
            ├──*─ ServiceRequest
            └──*─ HousekeepingTask (created at check-out)
User ─1───*─ Notification          User ─1───*─ AuditLog (actor)
Setting (singleton "platform")     Counter (invoice sequence)     WebhookEvent (idempotency, TTL 30 days)
```

## Collections

### User
| Field | Notes |
|---|---|
| name, email (unique, lowercase), phone, address{} | profile |
| passwordHash | bcrypt; `select:false`; never serialised |
| role | `guest` · `staff` · `manager` · `admin` (indexed) |
| status | `active` · `suspended` |
| emailVerified, emailVerifiedAt | verification |
| tokenVersion | incremented to revoke all sessions |
| verifyTokenHash/Expires, resetTokenHash/Expires | SHA-256 of one-time tokens; `select:false` |
| lastLoginAt | |

### Hotel
`name`, `slug` (unique), `tagline`, `description`, `address{line1, city, state, country, postalCode}`, `location{lat,lng}`, `contact{phone,email,website}`, `starRating`, `amenities[]`, `images[]{url, alt, credit, publicId}`, `checkInTime`, `checkOutTime`, `policies`, `status` (`active`/`inactive`), `ratingAvg`, `ratingCount` (recomputed from published reviews), `createdBy`.
Index: `{status, address.city}`. Managers and staff are linked through **StaffAssignment** rather than an array on the hotel, so there is a single source of truth for access.

### RoomCategory (room type)
`hotel`, `name` (unique per hotel), `description`, `maxGuests`, `bedType`, `sizeSqm`, `amenities[]`, `images[]`, `basePrice`, `seasonalRates[]{name, startDate, endDate (inclusive last night), price}`, `status`.
**Design decision:** price lives on the type, not on each room, because rooms of one type sell at one rate. Guests choose a type; the server assigns a room.

### Room (physical room)
`hotel`, `category`, `roomNumber` (unique per hotel), `floor`, `status` (`available`/`occupied`/`cleaning`/`maintenance`/`out_of_service`), `notes`.
Rooms in `maintenance` or `out_of_service` are never assigned to new bookings. `occupied` is set only by check-in.

### RoomNight (inventory lock)
`room`, `date` (UTC midnight), `booking`, `hotel`, `category`, `expiresAt` (`null` = confirmed; a date = unpaid hold).
**Unique index `{room: 1, date: 1}`**: this is the double-booking guarantee. Secondary indexes `{category, date}` and `{hotel, date}` serve availability and occupancy queries.
**Design decision:** a lock-per-night collection was chosen over "query for overlapping bookings, then insert". The query-then-insert pattern has a race window unless wrapped in transactions with a conflicting write. The unique index closes the race on any MongoDB deployment.

### Booking
| Field | Notes |
|---|---|
| confirmationCode | `HP-XXXXXXX`, unique, unambiguous alphabet |
| guest, hotel, category, room | references |
| checkIn, checkOut (UTC midnight), nights, guests | stay |
| guestDetails{name, email, phone}, specialRequests | lead guest (may differ from the account) |
| pricing{currency, nightly[{date, rate, season}], subtotal, taxRatePercent, taxes, total} | frozen at creation |
| status | `pending` `confirmed` `checked_in` `checked_out` `cancelled` `expired` `no_show` |
| paymentStatus | `unpaid` `failed` `paid` `refund_pending` `refunded` `partially_refunded` |
| holdExpiresAt | while pending |
| cancellation{cancelledAt, cancelledBy, reason, refundPercent, refundAmount, policyNote} | |
| checkedInAt/By, checkedOutAt/By | operations |
| invoice{number (unique, sparse), issuedAt} | `INV-YYYY-000123` from an atomic counter |
| reviewed, statusHistory[{status, at, by, note}] | |

Indexes: `{guest, createdAt}`, `{hotel, checkIn}`, `{hotel, checkOut}`, `{hotel, status}`, `{status, holdExpiresAt}`.
The allowed transitions are in `BOOKING_TRANSITIONS` (`models/Booking.js`).

### Payment
`booking`, `user`, `hotel`, `amount`, `currency`, `provider` (`razorpay`/`mock`), `isTest`, `providerOrderId` (unique), `providerPaymentId`, `status` (`created`/`captured`/`failed`/`refunded`/`partially_refunded`), `method`, `failureReason`, `capturedAt`, `amountRefunded`, `refunds[]{amount, status, reason, providerRefundId, requestedBy/At, processedBy/At, note}`.
One document per payment attempt (Razorpay order). **No card data is ever stored.** Refunds are embedded because they are always read with their payment and never exceed a handful.

### Review
`booking` (unique, so one review per stay), `hotel`, `category`, `guest`, `rating` 1–5, `title`, `comment`, `status` (`published`/`hidden`), `moderatedBy`, `moderationNote`. Only bookings with status `checked_out` can be reviewed.

### ServiceRequest
`hotel`, `booking`, `guest`, `room`, `type` (`housekeeping`/`maintenance`/`room_service`/`amenities`/`other`), `description`, `priority`, `status` (`open`/`in_progress`/`resolved`/`cancelled`), `assignedTo`, `staffNote`, `resolvedAt`.

### HousekeepingTask
`hotel`, `room`, `booking?`, `type` (`checkout_clean`/`daily_service`/`deep_clean`/`inspection`/`maintenance`), `status` (`pending`/`in_progress`/`done`), `priority`, `assignedTo`, `notes`, `dueDate`, `completedAt`, `createdBy`. Completing a clean moves a `cleaning` room back to `available`.

### StaffAssignment
`user`, `hotel` (unique pair), `role` (`manager`/`staff`), `position`, `active`, `assignedBy`. A user's account role must match the assignment role. Changing a user's role deactivates their assignments.

### Notification
`user`, `type`, `title`, `message`, `link`, `read`, `readAt`. Index `{user, read, createdAt}`.

### AuditLog
`actor`, `actorEmail`, `actorRole`, `category` (`security`/`admin`/`activity`), `action` (e.g. `user.role_change`), `entityType`, `entityId`, `details` (before/after), `ip`, `userAgent`. Has `createdAt` only.

### Setting (singleton, key `platform`)
`taxRatePercent`, `freeCancellationHours`, `lateCancellationRefundPercent`, `maxStayNights`, `bookingWindowDays`, `supportEmail`, `supportPhone`, `announcement`, `updatedBy`.

### Counter, WebhookEvent
`Counter{_id: 'invoice-2026', seq}` gives gap-free invoice numbers via atomic `$inc`. `WebhookEvent{provider, eventId}` has a unique index for idempotency and a TTL index that removes entries after 30 days.

## Requested collections: what became of them

| Requested | Implemented as |
|---|---|
| User, Hotel, Room, RoomCategory, Booking, Payment, Review, Notification, ServiceRequest, HousekeepingTask, StaffAssignment, AuditLog | Collections as listed |
| Invoice | **Embedded** in Booking (`invoice.number`, `issuedAt`); the invoice document is derived on request from the frozen booking pricing and its payments, so it can never disagree with them |
| Additional | `RoomNight` (inventory locks), `Setting`, `Counter`, `WebhookEvent` |
