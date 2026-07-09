# LIVE ANALYTICS — spec for implementing AI

Business analytics for VillKro admin: live presence, behavior events, 30-day history,
per-user activity drill-down. MySQL untouched — all analytics data goes to MongoDB
(already connected, currently unused) with TTL auto-expiry so it can never grow unbounded.

## Rules (read first, follow literally)

1. Do exactly what the task says. No extra refactors, no renames outside task scope.
2. Run `npm test` in `apps/api` after every backend task. All tests must pass before commit.
3. One commit per task: `feat: ANALYTICS TASK <n> — <short title>`.
4. Tasks in order. Tick the checkbox with a one-line note when done.
5. DO NOT TOUCH: order creation flow, coupon engine (`utils/coupons.js`), payment/status
   compare-and-set logic, MySQL migrations (`db/migrate.js`). Analytics is additive only.
6. Response shape contract: new API responses may use camelCase only (new endpoints,
   no legacy clients), but never modify existing endpoint responses.
7. Analytics must NEVER break the request path: every analytics write is fire-and-forget
   (`.catch()` logged, never awaited in a way that can fail a user-facing request, never
   throws). If MongoDB is down, the app and API must behave exactly as today.
8. Privacy / Play Store guardrails (hard requirements):
   - Track only: screen names, product/category IDs, cart actions, session times,
     platform, app version. NEVER: raw search text, location, contacts, device
     identifiers (IMEI/ad ID), clipboard, anything from outside the app.
   - No background service in the customer app. Events fire only while app is
     foregrounded; the existing socket lifecycle (foreground/background) already
     models this.
   - Admin-only access: every new analytics endpoint requires admin auth middleware.

## Architecture

```
customer-app                      apps/api                          apps/admin
────────────                      ────────                          ──────────
existing socket ──connect/──────▶ presence tracker (in-memory Map) ──▶ socket room
(realtimeClient) disconnect       socketId → {userId, screen,          "admin" gets
                                  connectedAt, platform, version}      analytics.live
screen change ───socket evt─────▶ updates Map entry                    push every 5s
                                        │ on disconnect
                                        ▼
event batcher ───POST /batch────▶ analytics_events +  ────TTL 30d───▶ REST endpoints
(cart_add etc.,  every 15s or     analytics_sessions                   for history +
 max 20 events)  on background    (MongoDB)                            per-user pages
                                        │
                                  daily rollup (cron in-process,
                                  runs at 00:05) → analytics_daily (TTL 365d)
```

## MongoDB collections

### `analytics_sessions` — one doc per app session
```js
{
  userId: 123,                 // MySQL customer id (number)
  connectedAt: ISODate,
  disconnectedAt: ISODate,     // set on socket disconnect
  durationSec: 752,
  platform: 'android' | 'ios',
  appVersion: '1.4.2',
  screens: { Home: 3, Cart: 1, Checkout: 1 },   // visit counts
  createdAt: ISODate           // TTL anchor
}
```
Indexes: `{ createdAt: 1 }` TTL `expireAfterSeconds: 2592000` (30d);
`{ userId: 1, createdAt: -1 }`.

### `analytics_events` — one doc per business action
```js
{
  userId: 123,
  type: 'cart_add' | 'cart_remove' | 'product_view' | 'category_view'
      | 'checkout_start' | 'checkout_abandon' | 'order_placed',
  productId: 88,               // when applicable
  categoryId: 4,               // when applicable
  qty: 2,                      // cart events
  price: 45.0,                 // unit price at event time (cart events)
  orderId: 991,                // order_placed only
  at: ISODate,                 // client timestamp
  createdAt: ISODate           // server receive time, TTL anchor
}
```
Indexes: `{ createdAt: 1 }` TTL 30d; `{ userId: 1, createdAt: -1 }`;
`{ type: 1, createdAt: -1 }`; `{ productId: 1, type: 1, createdAt: -1 }`.

### `analytics_daily` — one doc per day, written by rollup job
```js
{
  date: '2026-07-09',
  visitors: 412,               // distinct userIds with a session
  sessions: 1103,
  newUsers: 18,                // first-ever session (no earlier session doc)
  avgSessionSec: 341,
  orders: 87,                  // count of order_placed events
  conversionPct: 21.1,         // orders-placing visitors / visitors
  cartAdds: 940, cartRemoves: 210,
  windowShoppers: 63,          // visitors with cart_add but no order_placed
  hourlyActive: [3,1,0,...],   // 24 ints, distinct users active per hour
  topAdded:   [{ productId, count }],   // top 10
  topRemoved: [{ productId, count }],
  topViewed:  [{ productId, count }],
  createdAt: ISODate           // TTL anchor
}
```
Indexes: `{ date: 1 }` unique; `{ createdAt: 1 }` TTL 365d (tiny docs, keep a year).

Size check: at 2,000 DAU ≈ 80 MB sessions + ~300 MB events per rolling month. Fits
current cluster; TTL keeps it flat.

---

## TASK 1 — API: analytics module (Mongo collections, indexes, repositories)

- [ ] Done —

Create `apps/api/src/services/analytics/` with:

- `collections.js` — `ensureAnalyticsIndexes(db)` creating the three collections'
  indexes exactly as specced above. Called once at startup from `db/index.js`
  AFTER Mongo connect succeeds; wrap in try/catch — index failure logs an error
  but must not crash startup.
- `sessionStore.js` — `openSession({userId, platform, appVersion})` inserts session
  doc, returns its `_id`; `closeSession(_id, screens)` sets `disconnectedAt`,
  `durationSec`, `screens`.
- `eventStore.js` — `insertEvents(userId, events[])` validates each event
  (whitelist `type`, numeric ids, cap 50 events per call, drop invalid silently)
  and bulk-inserts.

All writes fire-and-forget per Rule 7. Unit-test the validator (valid types pass,
unknown types/extra fields dropped, cap enforced) using the existing mongo mock
pattern in `tests/__mocks__`.

## TASK 2 — API: live presence tracker on Socket.IO

- [ ] Done —

New `apps/api/src/realtime/presence.js`:

- In-memory `Map<socketId, {userId, role, platform, appVersion, screen, connectedAt, sessionId}>`.
- Wire into `socket.js` `io.on('connection')`: on customer connect, read `platform`
  and `appVersion` from `socket.handshake.auth` (client sends them, Task 4), add Map
  entry, call `sessionStore.openSession`. On `disconnect`, remove entry and call
  `closeSession` with the screen counts accumulated for that socket.
- Listen for socket event `analytics:screen` `{ screen: string }` (whitelist:
  Home, Categories, ProductList, ProductDetail, Cart, Checkout, Orders, Search,
  Profile — anything else ignored). Update Map entry + increment that socket's
  screen counter.
- Every 5 seconds (only when at least one admin socket is in the `admin` room —
  check `io.sockets.adapter.rooms`), emit to admins `analytics.live`:
  ```js
  {
    onlineCount, peakToday,
    byScreen: { Home: 8, Cart: 3, ... },
    byPlatform: { android: 10, ios: 2 },
    users: [{ userId, screen, platform, connectedMin }]   // customers only
  }
  ```
- `peakToday`: single in-memory integer, reset when the date changes.
- Admin sockets are never counted as online users.

Do not change the auth middleware or existing room logic.

## TASK 3 — API: event ingestion + admin analytics endpoints

- [ ] Done —

New routes (all under existing auth middleware):

**Customer (customer role):**
- `POST /api/analytics/events` — body `{ events: [...] }`, calls
  `eventStore.insertEvents(auth.userId, events)`. Responds `202 {accepted: n}`
  immediately. Rate-limit: reuse the API's existing rate-limit approach, 6 req/min
  per user.

**Admin (admin role) — `GET /api/admin/analytics/...`:**
- `summary?days=30` — daily_stats docs for range + today-so-far computed live from
  sessions/events.
- `products?days=30` — topAdded/topRemoved/topViewed aggregated across range,
  joined with product names from MySQL (single `WHERE id IN (...)` query).
- `window-shoppers?days=7` — users with cart_add but no order_placed in range:
  `[{ userId, name, phone, lastActiveAt, cartAdds, cartRemoves }]` (name/phone
  from MySQL users table).
- `user/:id?days=30` — per-user drill-down:
  ```js
  {
    user: { id, name, phone, joinedAt },          // MySQL
    totals: { sessions, totalTimeSec, avgSessionSec, orders, cartAdds, cartRemoves },
    sessions: [ { connectedAt, durationSec, platform, screens } ],   // latest 50
    timeline: [ { at, type, productId, productName, qty } ]          // latest 200 events
  }
  ```
- `hourly?days=14` — hourlyActive arrays for heatmap.

Aggregations use Mongo pipelines on indexed fields only. Add jest tests for the
window-shoppers pipeline shape and the user drill-down endpoint (mocked Mongo).

## TASK 4 — API: daily rollup job

- [ ] Done —

`apps/api/src/services/analytics/rollup.js`:

- `computeDailyStats(dateStr)` — aggregates sessions + events for that calendar day
  (server timezone) into one `analytics_daily` doc per the schema above. Upsert on
  `date` so re-runs are safe.
- Schedule with plain `setTimeout`/`setInterval` in-process (compute ms until next
  00:05, run, reschedule). On startup, also backfill yesterday if its doc is missing.
- No new dependencies (no node-cron package).

Test `computeDailyStats` math with mocked collections: visitors distinct-count,
conversionPct, windowShoppers logic.

## TASK 5 — customer app: analytics client (screen + events, batched)

- [ ] Done —

New `apps/customer-app/src/api/analyticsClient.js`:

- `trackScreen(name)` — emits `analytics:screen` on the existing socket from
  `realtimeClient.js` if connected; silently no-ops otherwise. Wire via the app's
  navigation container `onStateChange` (map route names to the whitelist names).
- `trackEvent(type, payload)` — pushes into an in-memory queue. Flush queue via
  `POST /api/analytics/events` when: 15 s elapsed since first queued event, OR queue
  reaches 20, OR app goes to background (AppState listener). Failed flush: retry
  once on next flush, then drop (never persist to disk, never block UI, never throw).
- Extend the socket `auth` payload in `realtimeClient.js` with
  `{ platform: Platform.OS, appVersion: <expo constants version> }`. Do not change
  anything else about connection handling.

Event call sites (add one line each, no logic changes):
- `stores/useCartStore.js` — `cart_add` / `cart_remove` (with productId, qty, price)
  in the add/remove/decrement actions.
- `ProductDetailScreen` — `product_view` on mount.
- `CategoriesScreen` — `category_view` on category tap.
- `CheckoutScreen` — `checkout_start` on mount; `order_placed` (with orderId) on
  successful order; `checkout_abandon` on unmount without order.

Run customer-app jest tests.

## TASK 6 — admin: live analytics panel

- [ ] Done —

New page `apps/admin/src/pages/Analytics.jsx` (+ css), route + sidebar entry
"Analytics". Follow existing page structure/styling conventions (match
Dashboard.jsx patterns, same card styles).

Live section (top of page), fed by `analytics.live` socket event via the existing
admin `realtimeClient.js`:
- Big number: users online now; small: peak today.
- Chips: count per screen; android/ios split.
- Live user table: name (fetch names once per unknown userId from the existing
  admin customers endpoint, cache in component), current screen, platform, minutes
  connected.
- "Stuck at checkout" highlight: users on Checkout screen > 5 min shown with
  warning style.
- Show "—" gracefully when socket disconnected.

## TASK 7 — admin: history & product analytics

- [ ] Done —

Extend Analytics.jsx with sections below the live panel (data from Task 3
endpoints, day-range selector 7/14/30):

- **Today so far** — visitors, sessions, orders, conversion %, cart adds/removes,
  window shoppers count.
- **Daily visitors chart** — visitors + orders per day (use whatever chart approach
  Reports.jsx already uses; if none, simple CSS bar chart, no new heavy chart lib).
- **Active-hours heatmap** — 24-column grid, intensity by hourlyActive.
- **Product behavior tables** — Most added / Most removed / Most viewed, columns:
  product name, count. Most-removed is the headline table (pricing/doubt signal).
- **Window shoppers table** — name, phone, cart adds/removes, last active; row
  click → user drill-down.

## TASK 8 — admin: per-user drill-down

- [ ] Done —

- Route `analytics/user/:id`, opened from window-shoppers table and live user table
  (and a search-by-customer box on the Analytics page reusing the customers list
  endpoint).
- Shows: user header (name, phone, joined), totals cards (sessions, total time,
  orders, cart adds/removes), sessions list (when logged in, how long, platform,
  screens visited), and an event timeline ("added 2× Amul Butter", "removed 1× …",
  "placed order #991") newest first, from the `user/:id` endpoint.
- Times in local timezone, durations humanized ("12 min").

## TASK 9 — docs + Play Console note

- [ ] Done —

- Append a short section to this file (below) titled "Data Safety declaration"
  reminding: Play Console → App content → Data safety must declare
  "App interactions" collected, linked to identity, for analytics purposes.
  This is a console form update, no code.
- Add `.env.example` entries if any new config was introduced (target: none).

---

## Data Safety declaration

**Play Console → App content → Data safety** must be updated to declare the
analytics data collected by this feature:

- **Category:** App interactions
  - Collected: Yes
  - Linked to identity: Yes (user account ID)
  - Purpose: Analytics
  - Description: Screen views, cart actions, checkout flow, and session
    duration are collected to help us understand app usage and improve the
    shopping experience.

- **Category:** App interactions (optional detail)
  - The app collects: screen names, product/category IDs (numeric only),
    cart add/remove events, checkout start/abandon, order placed, session
    length, platform (Android/iOS), and app version.
  - The app does NOT collect: raw search text, location, contacts, device
    identifiers (IMEI/ad ID), clipboard, or any data from outside the app.
  - No background service — events fire only while the app is foregrounded.
  - Data is retained for 30 days (auto-deleted via MongoDB TTL index); daily
    summary docs are retained for 1 year.

This is a **console form update only** — no code change required. The guardrails
are enforced in code (event whitelist, field whitelist, no background service,
admin-only endpoints, fire-and-forget writes).

### .env.example

No new config was introduced. Analytics uses the existing `MONGODB_URI` and
`MONGODB_DATABASE` env vars already present in `.env.development` /
`.env.production`. No additions needed.
