# ProjectServeLoco — Mapbox Live Rider Tracking + Checkout Location Picker

Spec date: 2026-07-13 · Branch: `feat/mapboxTracking` · Status: **IN PROGRESS — TASKS 1–11 code done; TASK 12 live device E2E pending**
Instruction spec for an implementing AI. Follow it literally.

Two features, one Mapbox integration:

- **Feature A — Checkout location picker**: replace the invisible one-shot GPS pin on `CheckoutScreen` with an interactive Mapbox map. Default center: Fatehabad, Haryana, India — 125047. User pans map to pin, or taps "Use my current location". Address field fills on confirm, exactly as today.
- **Feature B — Live rider tracking**: rider app streams GPS while a delivery is active; customer sees rider marker + road route line on a map screen opened from `OrderDetailScreen` when the order is out for delivery.

**Product-owner decisions (2026-07-13) are locked in §4. Do not re-ask. Do not invent policy.**

---

## 0. How to read this file

1. Read **BACKGROUND** (§1) and **EXISTING vs NEW** (§2) first — verified in code 2026-07-13, do not re-derive unless a path has moved.
2. Read **LOCKED DECISIONS** (§4) before coding.
3. Execute tasks **in order** (TASK 1 → TASK 12). Later tasks assume earlier ones are done.
4. Surgical changes only. Additive API shapes: where a response already duplicates camelCase + snake_case, keep duplicating. One commit per task. Run `npm test` in `apps/api` after every backend task; run `npx eslint` on every file you touch.
5. Tick each task's checkbox with a one-line note when done.

**Commit format:** `feat: MAP TASK <n> — <short title>`

**DO NOT TOUCH (unless a task explicitly says so):**
- `apps/api/src/utils/coupons.js` and coupon `FOR UPDATE` locking
- Compare-and-set order status updates and `409 CONCURRENCY_CONFLICT` responses
- Idempotency-Key logic in `createOrder`
- The rider assignment engine in `apps/api/src/services/riderAssignment.js` — TASK 4 only *reads* the active assignment; never modify offer/acceptance/expiry logic
- Existing order events in `apps/api/src/realtime/orderEvents.js` — you add a new event elsewhere, never alter these
- `CheckoutScreen` address validation and order-payload shape (`deliveryAddress`, `address`, `latitude`, `longitude` fields at lines ~654-680) — Feature A changes *how the pin is chosen*, never *what is submitted*
- The delivery flow end-to-end: place order → shop confirm → rider offer → accept → picked up → delivered must behave identically after every task. TASK 12 re-verifies it.

---

## 1. BACKGROUND — current platform (verified in code 2026-07-13)

### 1.1 What exists

| Thing | Where | Notes |
|---|---|---|
| Rider presence heartbeat | `apps/customer-app/src/screens/rider/RiderDashboardScreen.js:136` | 35s `setInterval` → `riderApi.heartbeat()`. **No GPS coords.** |
| One-shot GPS at checkout | `apps/customer-app/src/screens/customer/CheckoutScreen/CheckoutScreen.js:576,586` | `Location.getCurrentPositionAsync` + `reverseGeocodeAsync`, no visible map |
| `expo-location` | `apps/customer-app/package.json` (`^19.0.0`) | already installed |
| Socket.IO server | `apps/api/src/realtime/socket.js` | JWT auth, roles `customer`/`admin` only. Rooms: `customer:${userId}`, `customers`, `admin`. **No per-order rooms.** Helpers: `emitToCustomer`, `emitToAdmins`, `emitToAllCustomers` (lines 156-175) |
| Rider events | `apps/api/src/services/riderAssignment.js` | `rider.offer.created` → rider's user room; `rider.assignment.updated` → customer's room (line 530). Copy this emit pattern. |
| Socket client | `apps/customer-app/src/api/realtimeClient.js` | Single socket. `ORDER_EVENTS` list (lines 7-15) + `subscribeOrderEvents` (84-90). Screens filter by orderId locally — see `OrderDetailScreen.js:223-225`. |
| `riders` table | `apps/api/src/db/migrate.js:126-138` | `id, user_id, display_name, phone, active, is_online, last_heartbeat_at`. **No lat/lng.** |
| `orders` table | `migrate.js:398+` | has `rider_id`, `rider_assigned_at`, customer `latitude`/`longitude` (delivery pin), `map_url`. `ensureColumn` additive pattern at lines 444-445 — copy it. |
| Coordinate validator | `apps/api/src/validators/index.js:25-29` | `validateCoordinates(lat, lng)` — reuse |
| Haversine distance | `apps/api/src/utils/deliveryPricing.js:28-47` | reuse for off-route drift check if implemented server-side; client needs its own copy |
| Expo config plugins | `apps/customer-app/app.json` | `@react-native-firebase/app`, `@react-native-firebase/auth`, `expo-notifications` (with options object), `expo-audio`, `expo-asset` |
| Android permissions | `app.json` | `ACCESS_FINE_LOCATION` present. `ACCESS_BACKGROUND_LOCATION` absent — **keep it absent** (§4.3) |
| Native android dir | `apps/customer-app/android/` | Checked in, stock prebuild output. `npm run android` = `expo run:android`; Play Store CI = `eas build --platform android --local` (`.github/workflows/playstore.yml`). **Neither regenerates `android/` — `app.json` edits alone do not ship.** |

### 1.2 What does NOT exist

- No map library anywhere in the repo (no `react-native-maps`, no Mapbox).
- No rider GPS capture loop.
- No `rider.location.*` socket event.
- No map-rendering component (`orders.map_url` is stored but never rendered).

### 1.3 Mapbox install facts (read from official docs 2026-07-13 — do not improvise)

- Library: **`@rnmapbox/maps`** (maintained RN binding, has Expo config plugin). **Does not work in Expo Go** — requires `npx expo prebuild --clean` + native build.
- Underlying SDK: Mapbox Maps SDK for Android **v11** (current 11.x). Maven repo: `https://api.mapbox.com/downloads/v2/releases/maven`. v11 artifacts download without auth, but the plugin still accepts a downloads token — set it anyway (harmless, future-proof).
- Config plugin entry (in `app.json` `plugins` array):
  ```json
  ["@rnmapbox/maps", { "RNMapboxMapsDownloadToken": "sk.…" }]
  ```
  ⚠️ Do NOT hardcode the sk. token in `app.json` (it's committed). Use `app.config.js` reading `process.env.MAPBOX_DOWNLOADS_TOKEN`, or accept plugin default without token (v11 works without) — see TASK 1.
- Public token: set at runtime via `Mapbox.setAccessToken(<pk.…>)` before first MapView render.
- Directions API: `https://api.mapbox.com/directions/v5/mapbox/driving/{lng},{lat};{lng},{lat}?geometries=geojson&access_token=pk.…` → GeoJSON LineString.
- ⚠️ The official native install guide (docs.mapbox.com/android/maps/guides/install/) describes **manual native integration**: editing `settings.gradle.kts`, declaring `com.mapbox.maps:android:11.x` directly, adding a `res/values/mapbox_access_token.xml` string resource. **Do NOT follow those steps by hand.** The `@rnmapbox/maps` config plugin injects the maven repo, SDK dependency, and token wiring during `expo prebuild`. Hand-adding them too = duplicate SDK classes / dependency conflicts at build. The guide is reference only (for verifying what prebuild should have produced in TASK 2's diff check).

### 1.4 Pricing (why usage discipline matters — user is an early-stage startup)

| Product | Free tier | Billed by |
|---|---|---|
| Maps SDK (MapView) | 25,000 MAU/month | unique device installs that render a map, per billing month |
| Directions API | 100,000 req/month | per request, separate line item |
| Geocoding (`reverseGeocodeAsync` uses OS geocoder, not Mapbox — free) | n/a | n/a |

Budget rules baked into tasks: Directions fetched **once per delivery** (+ re-fetch only on >150 m off-route drift); reverse geocode **once per checkout confirm** (never per pan frame); GPS ping every **10 s** (rider battery/server load, not a Mapbox cost).

---

## 2. EXISTING vs NEW

| Piece | Status |
|---|---|
| `riders.last_lat/last_lng/last_location_at` columns | NEW (TASK 3) |
| `POST /rider/me/location` | NEW (TASK 4) |
| `rider.location.updated` socket event | NEW (TASK 4) |
| `riderApi.updateLocation` | NEW (TASK 5) |
| `useRiderLocationTracking` hook | NEW (TASK 5) |
| `@rnmapbox/maps` + native config | NEW (TASK 1-2) |
| `MapboxMap`-init util + token env | NEW (TASK 2) |
| `LocationPicker` component | NEW (TASK 7) |
| `CheckoutScreen` integration | MODIFY (TASK 8) |
| `RiderTrackingScreen` | NEW (TASK 9-10) |
| `OrderDetailScreen` "Track rider" entry | MODIFY (TASK 10) |
| Order-detail response + rider last position | MODIFY (TASK 4) |
| Realtime client new event | MODIFY (TASK 6) |
| Delivery-flow regression pass | VERIFY (TASK 12) |

---

## 3. TOKENS (already created by product owner — ask user to paste values at execution time, never commit them)

- `pk.` public token → runtime map init + Directions calls. Lives in `.env.development` / `.env.production` as `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN` and in `eas.json` build-profile env.
- `sk.` downloads token (scope `DOWNLOADS:READ`) → build-time only. Local: `~/.gradle/gradle.properties` as `MAPBOX_DOWNLOADS_TOKEN`. CI: GitHub Actions secret injected in `playstore.yml`. **Never in the JS bundle, never committed.**

---

## 4. LOCKED DECISIONS

1. **Provider**: Mapbox via `@rnmapbox/maps`. No Google Maps, no react-native-maps.
2. **Route line**: yes — road-following polyline via Mapbox Directions API (driving profile).
3. **Foreground-only rider tracking** (v1). No `ACCESS_BACKGROUND_LOCATION`, no `NSLocationAlwaysAndWhenInUseUsageDescription`. Tracking stops when rider backgrounds the app; customer marker just goes stale. Acceptable v1.
4. **Track only during active assignment** — GPS watch runs only while rider has an assigned order. Never track idle/online riders.
5. **Checkout default center**: Fatehabad, Haryana 125047. Constant `DEFAULT_MAP_CENTER = { latitude: 29.5152, longitude: 75.4548 }` — implementer verifies centroid once (any geocoder) before shipping and corrects the constant if off.
6. **Ping cadence**: 10 s time interval / 20 m distance interval, whichever first.
7. **Directions budget**: 1 fetch per tracking-screen mount + re-fetch only when rider >150 m from the fetched route line. No per-ping fetches.
8. **Reverse geocode**: once per checkout confirm. No live address preview while panning.
9. **Latest-position only**: mutable columns on `riders`, no history/trail table.
10. **No new socket rooms** — reuse `customer:${userId}` room via `emitToCustomer`, same as `rider.assignment.updated`.
11. **Rider initial position on tracking screen**: extend the customer order-detail response with `rider.lastLat/lastLng/lastLocationAt` (+ snake_case duplicates) rather than a new GET endpoint.

---

## 5. TASKS

### — Phase 0: native foundation —

### TASK 1 — Install `@rnmapbox/maps` + Expo plugin config
- [x] `cd apps/customer-app && npm install @rnmapbox/maps`
- [x] Convert token handling safely: add plugin entry to `app.json` **without** the sk token inline:
  ```json
  ["@rnmapbox/maps", {}]
  ```
  (v11 maven downloads need no auth; if the plugin errors demanding a token at prebuild, switch `app.json` → `app.config.js` that spreads the existing json and injects `RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOADS_TOKEN` — keep the json as the base, do not fork config.)
- [x] Add `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN` placeholder line to `.env.development` and `.env.production` (ask user for the pk value; commit files only if they are already gitignored — check first, they may contain other secrets conventions).
- [x] `npx eslint .` in `apps/customer-app` — clean.
- Acceptance: `package.json` has dependency; plugin listed; no secret committed (`git diff` shows no `sk.` string).
- Commit: `feat: MAP TASK 1 — add @rnmapbox/maps dependency + plugin config`
  - Done 2026-07-13: `@rnmapbox/maps@^10.3.2`; plugin `["@rnmapbox/maps", {}]`; env keys gitignored placeholders (fill real `pk.` value if still empty); eslint clean; no sk in commit.

### TASK 2 — Prebuild native android + Mapbox init util
- [x] Snapshot current native dir: `git status` clean first, then `npx expo prebuild --clean --platform android`.
- [x] Diff regenerated `android/` against HEAD: confirm Firebase (`google-services.json` application), `expo-notifications` icon/color res, package id `com.yashsiwach.villkro`, and version/build numbers survive. If anything regressed, fix via `app.json` (the source of truth), re-run prebuild — never hand-edit generated files.
- [x] Verify Mapbox wiring landed: `android/build.gradle` or `android/app/build.gradle` references the Mapbox maven repo `api.mapbox.com/downloads/v2/releases/maven`.
- [x] New file `apps/customer-app/src/utils/mapbox.js`:
  - imports `@rnmapbox/maps`, calls `Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN)` once, exports the configured `Mapbox` module + `DEFAULT_MAP_CENTER` constant (§4.5).
  - Guard: if the env token is missing, export a `mapboxAvailable = false` flag instead of crashing — screens render a "map unavailable" fallback (keeps app booting on misconfigured builds).
- [x] Full native build proof: `npm run android` completes and app boots on the connected device (`QC89XG4LWGLJ69LZ`).
- Acceptance: build succeeds from committed `android/`; app boots; no runtime crash on start (Mapbox not yet rendered anywhere).
- Commit: `feat: MAP TASK 2 — prebuild android with Mapbox + init util` (include regenerated `android/` in this commit)
  - Done 2026-07-13: prebuild OK; maven repo + firebase + package/versionCode 7 survive; mapbox.js with mapboxAvailable guard (not barrel-exported from utils/index — keeps cold start free of Mapbox); BUILD SUCCESSFUL; reinstalled debug APK after signature mismatch; Metro bundle OK, app PID up, no JS crash.

### — Phase 1: backend —

### TASK 3 — Migration: rider last-position columns
- [x] In `apps/api/src/db/migrate.js`, after the existing riders-table block, add `ensureColumn` calls (copy the exact pattern at lines 444-445):
  - `riders.last_lat DECIMAL(10,7) NULL`
  - `riders.last_lng DECIMAL(10,7) NULL`
  - `riders.last_location_at TIMESTAMP NULL DEFAULT NULL`
- [x] `cd apps/api && npm test` — green.
- [x] `npm run db:migrate:dev` — runs clean; verify with `DESCRIBE riders` (or migration log output).
- Acceptance: three columns exist; all existing tests pass untouched.
- Commit: `feat: MAP TASK 3 — riders last-position columns`
  - Done 2026-07-13: ensureColumn last_lat/last_lng/last_location_at; npm test 655 pass; DESCRIBE riders shows three columns.

### TASK 4 — Location ingest endpoint + socket event + order-detail enrichment
- [x] `apps/api/src/controllers/riderController.js`: new `updateLocation` handler.
  - Same auth/middleware chain as `heartbeat` (customer JWT + rider lookup via `riders.user_id`).
  - Body `{ lat, lng }` (accept `latitude`/`longitude` aliases too). Validate with `validateCoordinates` from `validators/index.js`; 400 `INVALID_COORDINATES` on failure.
  - `UPDATE riders SET last_lat=?, last_lng=?, last_location_at=NOW() WHERE id=?`.
  - Look up the rider's active order (`orders WHERE rider_id=? AND status IN (<the active out-for-delivery statuses used by riderAssignment — read them from that file, do not guess>)`), take its `id` and `customer_id`.
  - If an active order exists: `emitToCustomer(customer_id, 'rider.location.updated', { orderId, order_id, riderId, rider_id, lat, lng, latitude, longitude, at })` — camelCase + snake_case duplication per house style.
  - Respond `{ ok: true }`. If no active order: still persist + respond ok, just skip the emit.
- [x] `apps/api/src/routes/riderRoutes.js`: `router.post('/me/location', …)` wired identically to the heartbeat route.
- [x] Customer order-detail response (find the controller shaping the order-detail payload the customer app consumes — likely `orderController.js` `getOrderById`-style): when `order.rider_id` is set, join/attach `rider: { …existing fields…, lastLat, lastLng, lastLocationAt, last_lat, last_lng, last_location_at }`. **Additive only** — never remove or rename existing response fields.
- [x] Tests in `apps/api/tests/` (new file `riderLocation.test.js`, follow mock style of neighbouring rider tests): valid ping persists + emits; invalid coords → 400; ping with no active order persists without emit; non-rider user → 403.
- [x] `npm test` green, `npm run lint` clean.
- Acceptance: all above; existing rider/order tests untouched and green.
- Commit: `feat: MAP TASK 4 — rider location ingest + rider.location.updated event`
  - Done 2026-07-13: POST /me/location, emit on active assignment, order-detail rider last_* additive; riderLocation.test.js green; full suite 660 pass.

### — Phase 2: rider app GPS —

### TASK 5 — Rider GPS watch hook
- [x] `apps/customer-app/src/api/riderApi.js`: add `updateLocation(lat, lng)` → `POST /rider/me/location`, mirroring `heartbeat()`.
- [x] New hook `apps/customer-app/src/hooks/useRiderLocationTracking.js`:
  - Signature `useRiderLocationTracking(activeAssignment)`.
  - When `activeAssignment` becomes truthy: request foreground permission (`Location.requestForegroundPermissionsAsync`; if denied, no-op silently — do not nag every render), then `Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 20 }, cb)`.
  - `cb` fires `riderApi.updateLocation(coords.latitude, coords.longitude).catch(() => {})` — fire-and-forget, same defensive pattern as the heartbeat at `RiderDashboardScreen.js:133`.
  - When assignment becomes falsy or on unmount: `subscription.remove()`. Ref-guard against double-subscription on fast toggles.
- [x] Wire into `RiderDashboardScreen.js`: one line, `useRiderLocationTracking(assignment)` (use the screen's existing assignment state variable — read the file to get its exact name). **No other changes to that screen** — do not touch heartbeat, offer popup, or status buttons.
- [x] `npm test` in customer-app (jest) — green; eslint clean.
- Acceptance: watch starts only with assignment, stops on delivered/unmount; pings visible in API logs every ~10 s during a live test.
- Commit: `feat: MAP TASK 5 — rider GPS tracking hook`
  - Done 2026-07-13: updateLocation API, useRiderLocationTracking, wired on RiderDashboardScreen; jest 190 pass.

### TASK 6 — Realtime client: new event
- [x] `apps/customer-app/src/api/realtimeClient.js`: add `RIDER_LOCATION_EVENTS = ['rider.location.updated']`, bind in `bindSocketEvents` alongside existing groups, export `subscribeRiderLocation(handler)` modeled exactly on `subscribeOrderEvents` (lines 84-90).
- [x] Re-export from `apps/customer-app/src/api/index.js` next to the other realtime exports.
- Acceptance: eslint clean; no behavior change for existing subscribers.
- Commit: `feat: MAP TASK 6 — subscribeRiderLocation realtime channel`
  - Done 2026-07-13: RIDER_LOCATION_EVENTS + subscribeRiderLocation re-exported.

### — Phase 3: checkout picker —

### TASK 7 — `LocationPicker` component
- [x] New `apps/customer-app/src/components/LocationPicker/LocationPicker.js` + `index.js`, export from `components/index.js` (house convention).
- [x] Props: `{ visible, initialCenter, onConfirm(lat, lng), onClose }`. Render as bottom-sheet/modal consistent with `VariantSheet` mechanics (overlay `Pressable` closes on outside tap — same pattern just built there).
- [x] Content: `MapView` (from `src/utils/mapbox.js`) filling the sheet, `Camera` centered on `initialCenter || DEFAULT_MAP_CENTER`, a **fixed center-screen pin icon** overlaid with absolute positioning (map pans under it — no draggable marker gestures).
- [x] "Use my current location" button: one-shot `getCurrentPositionAsync` (reuse the exact call pattern from `CheckoutScreen.js:576`) → `camera.setCamera({ centerCoordinate, zoomLevel: 16 })`.
- [x] "Confirm location" button: read map center via `mapRef.getCenter()`, call `onConfirm(lat, lng)`. **No geocoding inside this component** — parent handles it (keeps the request-budget rule in one place).
- [x] If `mapboxAvailable === false`: render fallback body "Map unavailable" + keep the current-location button working (degrades to today's behavior).
- Acceptance: component renders on device, pan moves map under fixed pin, both buttons work; eslint clean.
- Commit: `feat: MAP TASK 7 — LocationPicker map component`
  - Done 2026-07-13: LocationPicker modal + fixed pin; jest mock for @rnmapbox/maps; 190 pass.

### TASK 8 — CheckoutScreen integration
- [x] Read `CheckoutScreen.js` GPS flow fully before editing (lines ~560-640). Replace the *trigger* of the one-shot GPS flow: tapping the GPS/location option now opens `LocationPicker` (visible-state boolean) instead of immediately calling `getCurrentPositionAsync`.
- [x] On `onConfirm(lat, lng)`: run the existing reverse-geocode block (`reverseGeocodeAsync` at ~586) against the picked coords, fill `address` state exactly as the current code does, store lat/lng in the same state the order payload already reads (`latitude`/`longitude` at ~654-680). **Do not alter the submitted payload shape.**
- [x] Manual-entry path, validation messages (~724-728), the Gorakhpur warning banner (added 2026-07-13), and everything else on the screen stay byte-identical.
- [x] Jest + eslint green.
- Acceptance: place a real order end-to-end on device via picker → order stores same field shapes as before (verify in API DB/log); manual-entry path untouched.
- Commit: `feat: MAP TASK 8 — checkout interactive location picker`
  - Done 2026-07-13: GPS mode opens LocationPicker; reverse-geocode once on confirm; payload shape unchanged; jest 190 pass.

### — Phase 4: customer tracking screen —

### TASK 9 — `RiderTrackingScreen`
- [x] New `apps/customer-app/src/screens/customer/RiderTrackingScreen/RiderTrackingScreen.js` + `index.js`, folder-per-screen convention.
- [x] Route param `{ orderId }`. On mount: fetch order detail (existing customer order-detail API call used by `OrderDetailScreen`) → destination = order `latitude`/`longitude`, rider start = `rider.lastLat/lastLng` (TASK 4 enrichment; tolerate null → center on destination, show "waiting for rider location…" chip).
- [x] Map: `MapView` + `Camera` fitting both points (`fitBounds` with padding), destination marker, rider marker (`PointAnnotation` or `MarkerView`).
- [x] Route line: one Directions API fetch on mount (driving profile, `geometries=geojson`, pk token) rider→destination; render via `ShapeSource` + `LineLayer`. Keep the fetched coordinates array in a ref.
- [x] Live updates: `subscribeRiderLocation` (TASK 6), filter `String(payload.orderId ?? payload.order_id) === String(orderId)` — copy the filter idiom from `OrderDetailScreen.js:223-225`. On match: update rider marker coordinate state only (no MapView remount, no camera jump every ping — recenter only if marker exits viewport).
- [x] Off-route re-fetch: haversine from new position to nearest fetched route coordinate; if >150 m, re-fetch Directions once and replace the line (guard with an in-flight flag so concurrent pings can't double-fetch).
- [x] Also subscribe to order events: on `order.status.updated` → delivered/cancelled for this order, show a "Delivered 🎉"/"Cancelled" state and stop expecting pings.
- [x] Register in the customer stack navigator next to `OrderDetailScreen` (find the navigator under `src/navigation/`).
- Acceptance: screen renders with mock/seed data; eslint + jest green.
- Commit: `feat: MAP TASK 9 — RiderTrackingScreen with route line`
  - Done 2026-07-13: RiderTrackingScreen + route line + live socket updates + navigator route; jest 190 pass.

### TASK 10 — OrderDetail entry point
- [x] `OrderDetailScreen.js`: add a "Track rider" button/banner, visible only when the order has `rider_id`/rider attached AND status is the out-for-delivery status (use the exact status constant the screen already switches on — read it, don't invent). Navigates to `RiderTrackingScreen` with `{ orderId }`.
- [x] Match existing screen styling (theme tokens, existing button components).
- Acceptance: button appears only in the correct status window; navigation works; nothing else on the screen changed.
- Commit: `feat: MAP TASK 10 — track-rider entry from order detail`

### — Phase 5: CI + regression —

### TASK 11 — CI token reuse (verified, no action needed)
**Verified 2026-07-13**: `playstore.yml` runs on `runs-on: [self-hosted, linux, x64, villkro-android]`, which resolves to systemd service `actions.runner.ServeLoco-ProjectServeLoco.linux-server.service` with `User=linux-server` — the **same OS user** as local dev on this machine. `~/.gradle/gradle.properties` (TASK 0) is one file, read by both local `npm run android` and CI builds. **No GitHub Actions secret, no workflow edit required.**
- [x] Confirm token present: `grep -q MAPBOX_DOWNLOADS_TOKEN ~/.gradle/gradle.properties` before running TASK 12's live build/verify.
- Acceptance: a real `main`-branch push (major bump path) builds without a missing-token gradle error.
  - Done 2026-07-13: MAPBOX_DOWNLOADS_TOKEN present in ~/.gradle/gradle.properties (same user as self-hosted CI).
- No commit — verification-only task.

### TASK 12 — Full delivery-flow regression + live tracking verification
No code. Live verification on device `QC89XG4LWGLJ69LZ` (mobile-mcp) + API logs. All steps must pass; fix regressions before ticking.
- [ ] **Regression — delivery flow unchanged** (device offline at recovery — re-run when QC89XG4LWGLJ69LZ connected): place order (manual address) → shop confirm → rider receives offer → accept → picked up → delivered. Every status push arrives as before; no new errors in API log.
- [ ] **Checkout picker**: map opens centered on Fatehabad default; pan-to-pin fills address on confirm; "use my current location" recenters; reverse geocode fires once per confirm (count calls in log); order payload fields identical to pre-change orders (compare DB rows).
- [ ] **Gorakhpur warning banner still renders** above the Recommend pill.
- [ ] **Rider tracking**: with an assigned order, rider pings hit API every ~10 s (API log); stop after delivered. Customer opens Track rider: both markers + route line render (screenshot); marker moves on emulator location change within ~10 s; Directions called once on mount + not per ping (count in client network log); background the rider app → pings stop, customer screen stays stable (no crash, stale marker OK).
- [ ] **Variant sheet, cart, coupons**: quick smoke — VariantSheet Done/outside-tap still works, cart totals right, coupon apply unaffected.
- [x] `npm test` green in `apps/api` and `apps/customer-app`; eslint clean on all touched files.
- Commit: `feat: MAP TASK 12 — verification notes` (tick boxes + one-line notes in this file only)
  - Automated 2026-07-13: api 660 pass + lint clean; customer-app 190 pass. Device QC89XG4LWGLJ69LZ not attached at crash-recovery time — live E2E (delivery flow / map pan / rider pings) still needs human+device pass when phone is reconnected. Fill EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN (pk.) in .env.development/.env.production before map screens render tiles.

---

## 6. OPEN ITEMS (implementer flags, does not decide)

1. Exact Fatehabad 125047 centroid — verify the `DEFAULT_MAP_CENTER` constant against a geocoder once; correct if the placeholder (29.5152, 75.4548) is off.
2. If `ios/` native dir exists/checked in later, repeat TASK 2's prebuild treatment for iOS before any TestFlight build.
3. ETA text (Directions `duration` field) and marker styling polish — follow-up design pass, not v1.
4. If a future "delivery trail replay" feature is requested, the mutable `riders.last_*` columns must be replaced by an append-only table — flag at that time.
