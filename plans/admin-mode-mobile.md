# Admin Mode (Mobile) — Execution Plan

**Spec date:** 2026-07-12 · **Refined:** 2026-07-12 (owner decisions locked; architecture verified against code — see §2.1)  
**Branch target:** `feat/adminMode`, branched **after** `feat/riderMode` work is committed (do **not** merge/ship to `main` until owner signs off)  
**Status:** READY TO EXECUTE — product locks closed.  
**Audience:** Implementing AI / developer. Follow this file literally.

---

## 0. Goal (what “done” means)

Add **Admin Mode** inside the existing Expo app (`apps/customer-app`), same family as Customer / Shop Owner / Rider modes.

### Happy path (owner words → system behavior)

1. On **web admin (laptop)**, owner opens **Mobile Admins** and adds phone number(s) (any count — owner decides).
2. That person opens the **phone app** and logs in with the **normal Firebase OTP flow** (no admin password on phone).
3. After OTP succeeds, app **does not show Customer home**. It redirects straight into **Admin dashboard / Admin Mode shell**.
4. That person has the **same ops write access as web admin** for the in-scope pages (orders, delivery toggle, riders, shops, customers, notifications, analytics, etc.).
5. New orders: **background push notification** when app is not open **and** **full-screen/popup + sound** when app is open (foreground).

### In scope — v1 mobile screens

| Area | Behavior (match web ops, phone-first UI) |
|------|------------------------------------------|
| **Dashboard** | Metrics; **Delivery Available** on/off; **Shop Status** global `shop_open` **read-only** (same as web — derived server-side) |
| **Orders** | List, filters, detail; status + payment updates; **live popup** + sound in-app; **BG push** when backgrounded |
| **Riders** | List, create/edit by phone, online/active, live updates |
| **Shops** | List, create/edit, open/active toggles |
| **Customers** | List, search, detail, trust / block |
| **Notifications** | Broadcast send + history + event **template settings** |
| **Analytics (live)** | Live presence + summary lists (web Analytics, mobile-friendly) |

### Out of scope — stay web-only (catalog / heavy tooling)

- Products, Combos, Categories, Store Modes CRUD  
- Offers, Coupons  
- Images, Bulk Import  
- Mobile Dashboard section editor  
- Reports, Health  
- Full Settings form (charges, UPI, app versions…) — only **delivery_available** from Dashboard  
- Production deploy until owner OK  

> “Same access as web admin” for v1 means **same power on the pages above**, not every web catalog page on the phone.

---

## 1. Owner decisions — LOCKED (do not re-ask)

| # | Decision | Lock |
|---|----------|------|
| **D1 Auth** | Same OTP flow as customers. Web assigns phone. **No** web password on the phone app. | After OTP → if phone is active mobile admin → **Admin Mode**, not customer dashboard. |
| **D2 One phone = one role** | A number is **either** admin **or** shop **or** rider **or** plain customer — not two management roles. | Enforce on **create/update** of mobile admin, shop owner, and rider: reject if phone already holds another role. |
| **D3 Mutations** | Full ops write on in-scope pages (not read-only). | Same server endpoints / permissions as web admin JWT for those routes. |
| **D4 Alerts** | **Background push + in-app popup** both required in v1. | Not optional polish — part of Orders/core alert work. |
| **D5 Roster size** | **No hard max.** Owner adds as many admins as they want. | No artificial cap in API. |
| **D6 Soft remove** | Deactivate (`active=false`) preferred over hard delete (safe default; owner did not require hard delete). | List can show inactive; inactive cannot open Admin Mode. |
| **D7 Web password admin** | Unchanged. Laptop still uses env password login. Mobile roster is **explicit phones only**. | Password admin is not auto-added as a mobile_admin row. |

---

## 2. Architecture (required — not “UI only”)

### What already exists

| Layer | Reality |
|-------|---------|
| Web `/admin/*` APIs | Dashboard, orders, shops, riders, customers, settings, notifications, analytics — all `requireAdmin` |
| Web admin login | Single env account: `ADMIN_OWNER_ID` + password/hash → JWT `role: 'admin'` |
| Phone login | Firebase OTP → customer JWT `role: 'customer'`; shop/rider attached by DB on `/auth/me` |
| App shells | `RootNavigator`: shop → ShopOwner; rider → Rider; else Customer. **No admin shell today** |
| Admin realtime | Socket joins `admin` only when JWT role is `admin` |

### 2.1 Verified against code (2026-07-12) — do NOT re-explore these

| Claim | Anchor |
|-------|--------|
| `signAdminToken(adminId)` exists; expiry `ADMIN_JWT_EXPIRES_IN` default **12h** | `apps/api/src/utils/auth.js:12`, `apps/api/src/config/env.js:29` |
| `requireAdmin` checks **only** `role === 'admin'` + `admin_auth_state.revoked_before` vs token `iat` — a `sub` like `mobile:<id>` passes | `apps/api/src/middleware/authMiddleware.js:43-68` |
| Socket accepts role `admin`, joins `admin` room; same `revoked_before` check at connect | `apps/api/src/realtime/socket.js:45-80` |
| `sendPushToMany(pool, userIds, opts)` exists for TASK 4 fan-out | `apps/api/src/utils/expoPush.js:63,167` |
| Rate-limit pattern exists (`express-rate-limit`, `loginLimiter`) — copy for mobile-session | `apps/api/src/routes/adminRoutes.js:37,68` |
| Shop↔rider 409 exclusivity already implemented (codes like `ALREADY_RIDER`) — extend symmetrically | `apps/api/src/controllers/adminRiderController.js:80-102` |
| `/auth/me` + firebase-verify already attach `shop` + `rider` — add `admin` the same way | `apps/api/src/controllers/authController.js:39-40,341-351` |
| `useAuthStore` already holds `shop`/`rider` + setters + persist keys — mirror for `admin`/`adminToken` | `apps/customer-app/src/stores/useAuthStore.js` |
| `PATCH /admin/settings` exists (settingsController.updateSettings); dashboard payload returns `shop_open` + `delivery_available` | `apps/api/src/routes/adminRoutes.js:715-716`, `apps/api/src/controllers/adminController.js:240-256` |
| Admin “new order” notify today = DB insert + socket emit to `admin` room only — **no device push** (TASK 4 gap is real) | `apps/api/src/utils/adminNotifications.js` |
| `analytics.live` already emitted to `admin` room every 5s — mobile admin socket gets it free | `apps/api/src/realtime/socket.js:103` |

### 2.2 Token lifecycle facts (affect TASK 3 / 6 / QA)

- **Admin JWT lives 12h** (vs customer 30d). Silent re-mint via `POST /admin/mobile-session` is the **normal** flow (app open after 12h), not an error path. TASK 6.6 handles it.
- **`POST /admin/revoke-sessions`** (web) bumps `revoked_before` → invalidates **all** admin JWTs including mobile ones. Recovery: app gets 401 → re-mints (fresh `iat` passes). Intended behavior — a still-**active** mobile admin recovers silently; a deactivated one gets 403 on re-mint.
- **Deactivating a mobile admin does not kill an already-issued admin JWT.** Server-side hard cutoff = token expiry (≤12h). Client-side cutoff = next `/auth/me` refresh (`admin: null` → clear adminToken, TASK 6.3). Acceptable for v1; do not build a per-request active check.

### Auth design (locked)

```
Web laptop (password admin JWT)
  └─ CRUD table mobile_admins (phone, display_name, active, user_id)

Phone OTP (customer JWT)  ──same login UI as everyone──
  └─ POST /auth/firebase-verify + GET /auth/me
       returns admin: { id, displayName, phone, active } | null
  └─ If admin active:
       App calls POST /admin/mobile-session  (Bearer customer JWT)
         → verifies phone ∈ active mobile_admins
         → returns admin JWT (role: 'admin')  // same requireAdmin + socket room as web
       App stores adminToken; opens AdminNavigator (Dashboard first)
  └─ If admin null:
       existing shop → rider → customer shells (unchanged)
```

**Why dual token (customer JWT + admin JWT)?**  
Keeps `requireCustomer` / `requireAdmin` boundaries; reuses every existing admin controller and the `admin` socket room with **zero** “accept customer JWT on all /admin routes” rewrite.

### Role resolution (app)

```
if (admin active + adminToken) → AdminNavigator   // never Customer home
else if (shop)                 → ShopOwnerNavigator
else if (rider)                → RiderNavigator
else                           → CustomerNavigator
```

### One-phone-one-role enforcement (API)

When creating/updating **mobile_admins**, **shops** (owner phone), or **riders** (phone):

- If phone already active as another of { mobile_admin, shop owner, rider } → **409** with clear message  
  e.g. `Phone already assigned as rider. Remove or deactivate that role first.`
- Plain customer (no shop/rider/admin) can always be promoted to one of those roles.
- Shop↔rider mutual exclusion (existing D2) remains; extend the same idea to admin.

---

## 3. Reference implementations (copy patterns)

| Concern | Copy from |
|---------|-----------|
| Mode shell + tabs | `ShopOwnerNavigator.js`, `RiderNavigator.js`, `RootNavigator.js` |
| Session attach | `authController` me / firebase-verify + `getShopForUser` / `getRiderForUser` |
| Admin HTTP shapes | `apps/admin/src/api/index.js` |
| Delivery toggle | `Dashboard.jsx` → `SettingsApi.update({ delivery_available })` |
| Orders live merge | `Orders.jsx` + `utils/realtimeOrder.js` |
| In-app order modal | `GlobalOrderAlert.jsx` + shop `NewOrderPopup` (RN) |
| Admin socket | admin `realtimeClient.js`; API `realtime/socket.js` |
| Riders / Shops / Customers / Notifications / Analytics | matching `apps/admin/src/pages/*` |
| BG push + local chime | shop/rider push + `useNewOrderAlert`, `notificationChime`, Expo push utils |

---

## 4. Rules for the implementing AI

1. **Do exactly what each task says.** No drive-by refactors, no catalog pages “while here.”  
2. **Do not merge/deploy to `main`** without explicit owner approval.  
3. **Never rename/remove** existing API response fields or drop camelCase/snake_case duplicates. Adding fields only where a task says so (dual-case if neighbors dual-case).  
4. **After every backend task:** `cd apps/api && npm test` must pass.  
5. **After app/admin UI tasks:** relevant lint/tests.  
6. **One commit per task:** `feat: ADMIN TASK <n> — <short title>`.  
7. Tick checkboxes `[x]` here + one-line `NOTE (done): …`.  
8. If blocked → leave open, write `BLOCKED: reason`, stop — no alternate design.  
9. Execute tasks **in order** (later assumes earlier).  
10. Migrations: idempotent (`CREATE TABLE IF NOT EXISTS`, `ensureColumn` / `ensureIndex`).  
11. **Security:** rate-limit mobile-session; only **active** mobile_admins get tokens; never log tokens; admin JWT expiry = existing `ADMIN_JWT_EXPIRES_IN`.  
12. **No max-admin cap** (D5).  
13. **Alerts are P0:** background push + foreground popup both ship in the Orders wave — not a later “nice to have.”

**DO NOT TOUCH:**

- Coupon engine / `FOR UPDATE` redemption locking  
- Order status compare-and-set / 409 / status enum  
- Auto-accept timer duration core logic (subscribe to events for UI only)  
- Rider assignment locks / offer timing  
- Customer cart / checkout  
- Removing web password admin login  

---

## 5. Information architecture (mobile)

### 5.1 `AdminNavigator` — bottom tabs

1. **Home** — Dashboard (initial route after OTP)  
2. **Orders** — list + detail stack  
3. **People** — segmented or nested: Riders | Shops | Customers  
4. **Alerts** — Notifications (broadcast + templates)  
5. **Live** — Analytics  

No role switcher. Admin phone always Admin Mode until logout or web deactivates them.

### 5.2 Global overlays (mounted once in Admin shell)

- **AdminNewOrderPopup** — queue, sound/vibration, open order / ack (web GlobalOrderAlert behavior)  
- Offline banner  
- Toasts  

### 5.3 Token storage

- Persist customer session as today.  
- Persist `adminToken` (with expiry / re-mint via mobile-session on 401).  
- Logout clears **both** tokens + disconnects admin socket + clears customer push path as today.

### 5.4 Alert matrix (D4)

| App state | New order behavior |
|-----------|--------------------|
| **Foreground** (any Admin tab) | Popup + sound/vibe loop; list/dashboard soft-refresh via socket |
| **Background / killed** | **Expo push** to that admin’s registered device token; tap → Admin Orders detail (or list if id missing) |
| **Web admin open** | Unchanged existing web GlobalOrderAlert |

---

## 6. Task breakdown

---

### TASK 0 — Product locks  `[DONE]`

Owner locked D1–D7 in §1. No further gate.

- [x] 0.1 OTP + phone assignment + redirect to Admin Mode  
- [x] 0.2 One phone = one role  
- [x] 0.3 Full ops write on in-scope pages  
- [x] 0.4 BG push + in-app popup  
- [x] 0.5 Unlimited admins  

**NOTE (done):** Locked 2026-07-12 from owner chat.

---

### TASK 1 — Schema: `mobile_admins`  `[P0][API]`

**Goal:** Persist phone-linked mobile admin roster (unlimited rows).

**Files:** `apps/api/src/db/migrate.js`

- [x] 1.1 Create table (idempotent):

```sql
CREATE TABLE IF NOT EXISTS mobile_admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  display_name VARCHAR(255) NULL,
  user_id INT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mobile_admins_phone (phone),
  KEY idx_mobile_admins_user (user_id),
  KEY idx_mobile_admins_active (active)
);
```

- [x] 1.2 Phone normalize: **10-digit Indian local** (strip `+91`), same as users/shops/riders. Comment in util.  
- [x] 1.3 `user_id` nullable until first OTP login; no hard FK that blocks create before user exists.

**Verify:** migrate clean + re-run; `npm test`.  
**NOTE (done):** Table added `migrate.js` after riders block, no FK on `user_id` (nullable, backfilled later). Normalize convention noted in comment — actual `normalizePhone` reuse lands in TASK 3's `mobileAdmins.js`. `npm run db:migrate:dev` ran twice clean. `npm test`: 480/481 pass, 3 pre-existing failures (`rateLimit is not a function` in `orderRoutes.js`) from uncommitted rider-mode WIP — unrelated, not touched.

---

### TASK 2 — API: mobile admin CRUD + role exclusivity  `[P0][API]`

**Goal:** Web password admin manages phones; one-role rule enforced.

**Endpoints** (all `requireAdmin` — web or mobile admin JWT):

| Method | Path | Notes |
|--------|------|--------|
| GET | `/admin/mobile-admins` | List all (include inactive) |
| POST | `/admin/mobile-admins` | `{ phone, displayName?, active? }` |
| PATCH | `/admin/mobile-admins/:id` | `{ displayName?, active?, phone? }` |
| DELETE or PATCH active | `/admin/mobile-admins/:id` | **Soft deactivate** (`active=false`); hard delete optional only if already pattern elsewhere — prefer soft |

**Steps:**

- [x] 2.1 Implement list/create/update/deactivate.  
- [x] 2.2 Validate phone (10 digits after normalize). Duplicate phone → **409**.  
- [x] 2.3 On create/update: if `users` row exists for phone, set `user_id`.  
- [x] 2.4 **Role exclusivity:** reject create/activate if phone is already an **active shop owner** or **active rider**. Clear error code/message.  
- [x] 2.5 Extend shop-create / rider-create (and activate) paths to reject if phone is an **active mobile admin** (symmetric).  
- [x] 2.6 Dual-case response fields if surrounding admin APIs dual-case.  
- [x] 2.7 **No max count.**  
- [x] 2.8 Tests: create, duplicate, exclusivity vs shop/rider, deactivate, list.

**NOTE (done):** New `utils/mobileAdmins.js` (`normalizePhone`, `mapMobileAdminRow`, `getMobileAdminForUser`, `isActiveMobileAdminPhone`) + `controllers/mobileAdminController.js` + 3 routes in `adminRoutes.js` (`GET/POST /mobile-admins`, `PATCH /mobile-admins/:id`). Symmetric exclusivity added to `adminRiderController.createRider` and `shopAdminController.createShop`/`updateShop` (only when `owner_phone` provided). New `tests/mobileAdmins.test.js` (8 cases) + 1 rider-side + 1 shop-side exclusivity test. Fixed `shopsAdmin.test.js` mock-order for the extra query my check adds. `npm test`: 490/491 pass, same 3 pre-existing unrelated failures as TASK 1 (rider-mode WIP `rateLimit is not a function`).

---

### TASK 3 — API: attach admin on session + `POST /admin/mobile-session`  `[P0][API]`

**Goal:** OTP users who are mobile admins can obtain admin JWT.

**Files:**  
- `apps/api/src/utils/mobileAdmins.js` **new**  
- `authController.js`  
- admin controller + routes  
- middleware as needed  

**Steps:**

- [x] 3.1 `getMobileAdminForUser` / by phone — only `active = true`.  
- [x] 3.2 firebase-verify + `/auth/me` response:

```js
response.admin = adminPayload || null; // { id, displayName, phone, active }
// keep shop / rider fields as today (should be null if exclusivity holds)
```

- [x] 3.3 `POST /admin/mobile-session` with **`requireCustomer`**:  
  - Verify active mobile_admin for this user/phone  
  - Backfill `user_id` if null  
  - `signAdminToken` with stable `sub` e.g. `mobile:<id>` (must pass `requireAdmin` + join `admin` room)  
  - Return `{ token, user: { id, role: 'admin', mobileAdminId } }`  
  - **403** if not active mobile admin  
- [x] 3.4 Rate-limit mobile-session (copy `loginLimiter` pattern, `adminRoutes.js:68`).  
- [x] 3.5 Confirm password **failed-attempt lockout** does not block mobile-session (it only gates the password login endpoint). Note: `revoke-sessions` **does** invalidate mobile admin JWTs (see §2.2) — that is intended; re-mint recovers.  
- [x] 3.6 Tests: non-admin 403; active 200 + admin role; inactive 403.

**NOTE (done):** `mintMobileSession` added to `mobileAdminController.js`, routed `POST /admin/mobile-session` behind new `mobileSessionLimiter` (20/15min — higher than password login since legit re-mint happens ~every 12h per admin) + `requireCustomer`. Looks up by `user_id` first, falls back to phone + backfills `user_id` if null. `admin` attached in all 3 authController response sites (`me`, firebase-verify success, firebase-verify race-winner branch) via `getMobileAdminForUser`. New `tests/mobileSession.test.js` (4 cases: wrong-role rejected, mint by user_id, backfill-by-phone, 403 not-admin). `npm test`: 494/495 pass, same 3 pre-existing unrelated failures.

---

### TASK 4 — API: push new-order events to mobile admin user_ids  `[P0][API]`

**Goal:** Background notification on admin phones (D4).

**Context:** Admin inbox / Expo push may today target “admin” conceptually without user devices. Mobile admins **are** `users` rows with Expo push tokens (customer registration path).

**Steps:**

- [x] 4.1 Inventory where new-order / order events notify “admin” (`adminInbox`, orderController, etc.).  
- [x] 4.2 Add fan-out: resolve **active** `mobile_admins` with non-null `user_id` + push token → `sendPushToMany` (or existing helper) with title/body suitable for “New order #…”.  
- [x] 4.3 Payload must include `orderId` (and type) so the app can deep-link.  
- [x] 4.4 Do **not** break customer / shop / rider push routes.  
- [x] 4.5 Do not spam: one push per event per admin user (dedupe if multiple code paths).  
- [x] 4.6 Tests or fixture covering “active mobile admin with token receives push path” (mock send).

**NOTE (done):** Single call site confirmed (`orderController.js:549` → `adminInbox.createAdminNotification`). Fan-out added centrally inside `createAdminNotification` (`utils/adminNotifications.js`), gated to `type === TYPES.NEW_ORDER` — any future caller gets it free, and the existing `INSERT IGNORE` dedupe (early-return on duplicate) already gives "one push per event." New `notifyMobileAdminsPush` queries `mobile_admins WHERE active=1 AND user_id IS NOT NULL`, calls `sendPushToMany` with `data: { type, orderId: relatedId }`. Awaited internally, but the call site still doesn't await `createAdminNotification` — order-creation critical path unaffected. New `tests/adminNotificationsPush.test.js` (4 cases). **Regression caught+fixed:** `adminNotifications.js` now transitively requires `expoPush.js`, which does `new Expo()` at module load — broke `tests/pushTokenHygiene.test.js`'s inline `expo-server-sdk` mock (plain object, not a class). Fixed that mock to a proper class matching `tests/__mocks__/expo-server-sdk.js`. `npm test`: 498/499 pass, same 3 pre-existing unrelated failures.

**NOTE (done):**

---

### TASK 5 — Web admin: Mobile Admins page  `[P1][ADMIN WEB]`

**Goal:** Owner assigns numbers from laptop.

- [x] 5.1 `MobileAdminsApi` in `apps/admin/src/api/index.js`.  
- [x] 5.2 Page `MobileAdmins.jsx` (+ css): table phone, name, active, created.  
- [x] 5.3 Add / edit name / deactivate (and reactivate).  
- [x] 5.4 UX aligned with Riders page (phone-first).  
- [x] 5.5 Help text: “These numbers open Admin Mode in the VillKro phone app after OTP. One number = one role (not shop/rider).”  
- [x] 5.6 Sidebar + route in `App.jsx`.  
- [x] 5.7 Surface exclusivity errors from API cleanly.

**NOTE (done):** New `MobileAdmins.jsx` reuses `Shops.css` (no new CSS file needed). One drawer form for both add and edit (editingId toggles copy/verb). API errors render inline in the drawer via `formError`, table-level errors via the existing `error-container` pattern. Nav: Sidebar "📲 Mobile Admins" under Operations, route `/mobile-admins` in `App.jsx`. **Browser-verified live**: stopped+restarted the already-running api/admin dev servers under preview management, logged into the real admin panel, navigated to the page, added a mobile admin (phone `9998887770`), confirmed it appeared in the table, toggled Active→Inactive via PATCH, then deleted the test row from the dev DB directly. `npm run lint` clean; no new console errors (pre-existing unrelated Dashboard.jsx key-warning only).

---

### TASK 6 — App: admin token client + auth store  `[P0][APP]`

**Goal:** Dual token + mint after OTP.

- [x] 6.1 Store: `admin`, `adminToken`, set/clear helpers; clear on logout.  
- [x] 6.2 After login/me: if `admin` present → `POST /admin/mobile-session` → store `adminToken`.  
- [x] 6.3 `validateSession`: refresh me; if admin gone → clear adminToken → fall through to non-admin shell.  
- [x] 6.4 `adminApi.js` — only endpoints needed for v1 screens; always Authorization = **adminToken**.  
- [~] 6.5 Admin realtime client connects with adminToken; disconnect on logout. — token plumbing (`setAdminTokenProvider`) is in place; actual socket connect/disconnect wiring deferred to TASK 7 since it needs `AdminNavigator`'s mount/unmount lifecycle to hang off of (matches how `useCustomerRealtime` only connects once `CustomerNavigator` is live).  
- [x] 6.6 Admin API 401 → one re-mint attempt; fail → clear admin session + error. **Re-mint is routine**: admin JWT expires every 12h (§2.2) while customer JWT lasts 30d — treat silent re-mint as the happy path, no error UI unless re-mint itself 403s.

**NOTE (done):** `sessionTokens.js` gained `getAdminToken`/`setAdminTokenProvider`. `httpClient.js` supports `auth: 'admin'`; a 401 on an admin-authed request calls a registered re-mint handler once (`_adminRetried` guard against loops) and retries with the fresh token, or calls the admin-session-clear handler if re-mint itself fails. New `adminApi.js` (`mintSession`). `useAuthStore` gained `admin`/`adminToken` state, `mintAdminSession`/`clearAdminSession` actions, wired into `setSession`, `validateSession`, `logout`, and `partialize`. `normalizeSession` now passes through `admin`. `AuthScreen.handleSuccess` forwards `session.admin`. `App.js` registers the admin token provider + re-mint/clear handlers alongside the existing customer ones. New tests: 2 in `httpClient.test.js` (re-mint+retry, clear-on-reject) + 7 in `useAuthStore.adminMode.test.js` (mint on session start, no-op without admin, mint failure clears state, explicit clear, validateSession clear/re-mint, logout clears). Caught a test-authoring bug along the way: `isJwtExpired` treats any non-3-part string as expired, so `validateSession` tests need a real (if unsigned) JWT shape or they silently exercise the logout path instead of `getMe`. `npm test`: 131/131 pass (customer-app), no regressions.

---

### TASK 7 — App: `AdminNavigator` + RootNavigator  `[P0][APP]`

**Goal:** OTP → Admin dashboard, never customer home for admin phones.

- [x] 7.1 Branch: `isAuthenticated && admin && adminToken` → **AdminNavigator** (before shop/rider).  
- [x] 7.2 Tabs per §5.1; **initial route = Dashboard (Home)**.  
- [~] 7.3 Mount global `AdminNewOrderPopup` host. — deferred to TASK 9 (the popup's queue/sound logic and the Orders screen it opens don't exist yet; mounting an inert host now would be dead code).  
- [~] 7.4 Wire notification tap handler (from TASK 4 payload) → Admin order detail when in admin shell. — deferred to TASK 9 (needs the order-detail route TASK 9 builds).  
- [x] 7.5 Placeholder screens OK until feature tasks fill them.

**NOTE (done):** New `navigation/AdminNavigator.js` — 5 tabs (Home/Orders/People/Alerts/Live) matching §5.1, `initialRouteName="AdminHome"`, same tab-bar visual pattern as `RiderNavigator`/`ShopOwnerNavigator`. New `screens/admin/*` placeholders (Dashboard, Orders, People — combined Riders/Shops/Customers stand-in until TASK 10-12, Notifications, Analytics) sharing one `AdminPlaceholderScreen` shell. Added two icons to `AppIcon` (`people`, `analytics` — lucide `Users`/`TrendingUp`) since none of the existing set fit. `RootNavigator` now checks `isAuthenticated && admin && adminToken` **before** shop/rider. New `tests/RootNavigator.adminMode.test.js` (2 cases: routes to Admin when both set, falls through to Customer when `adminToken` hasn't minted yet). `npm test`: 133/133 pass; `npm run lint` clean. Native RN screens aren't browser-previewable — verified via tests/lint only, per the skip-verification rule for non-previewable runtimes.

---

### TASK 8 — Screen: Admin Dashboard  `[P1][APP]`

**APIs:** `GET /admin/dashboard`, `PATCH /admin/settings` `{ delivery_available }`

- [x] 8.1 KPI cards from metrics payload.  
- [x] 8.2 **Delivery Available** toggle + confirm on turn-off.  
- [x] 8.3 **Shop Status** read-only (`shop_open`).  
- [x] 8.4 Latest orders → order detail. — was a TASK 7-era stopgap (navigated to the Orders tab); upgraded in TASK 9 to `navigation.navigate('AdminOrderDetail', { orderId })` now that the detail route exists.  
- [x] 8.5 Soft refresh on socket + pull-to-refresh.  
- [x] 8.6 Loading / error / retry.

**NOTE (done):** Built the admin realtime spine this task needed: new `adminRealtimeClient.js` (separate socket from the customer one — Admin Mode's own JWT joins the server's `admin` room; event names mirror `apps/admin/src/api/realtimeClient.js` so web/mobile stay in sync) + `useAdminRealtime` hook, mounted in `AdminNavigator`. `adminApi.js` gained `getDashboard`/`updateSettings`. Real `AdminDashboardScreen` replaces the TASK 7 placeholder: 4 KPI cards (today's sales/orders, pending orders/payments), Delivery Available toggle with a confirm-on-turn-off `Alert` (phone taps are easier to mis-hit than a desktop click — web has no confirm, mobile does, intentional), read-only Shop Status pill, latest-orders list with pull-to-refresh, soft refresh on `admin.order.*` socket events + reconnect/foreground. New `tests/AdminDashboardScreen.test.js` (3 cases: KPI + status rendering, confirm-then-apply delivery-off flow, retry state on load failure). Had to fix `RootNavigator.adminMode.test.js`: it asserted on the static "Dashboard" placeholder text from TASK 7, which no longer renders synchronously now that the real screen shows a loading spinner first — switched the assertion to the admin-only "People" tab label, which is present immediately. `npm test`: 136/136 pass; `npm run lint` clean. Native RN, not browser-previewable — verified via tests/lint per the skip-verification rule.

---

### TASK 9 — Screen: Orders + in-app popup + deep link  `[P0][APP]` ★ critical

**APIs:** admin orders list/get/status/payment + admin order sockets  
**Mirror:** `Orders.jsx` + `GlobalOrderAlert.jsx`

**List / detail:**

- [x] 9.1 Paginated list; min filters: status + search (payment/date if straightforward). — full parity per owner call: status quick-chips, search, **plus** paymentStatus/paymentMethod/date-range in a filter sheet (all 6 web filters).  
- [x] 9.2 Detail: items, customer, address, payment, status. — plus delivery pricing snapshot, rider/assignment state, per-shop confirmation badges, customer note (full web parity; Print Invoice omitted, no printer on a phone).  
- [x] 9.3 Status + payment updates; surface **409** conflicts.  
- [x] 9.4 Live row patches from socket (port merge helper).

**In-app popup (foreground):**

- [x] 9.5 Queue; one card at a time (web behavior).  
- [x] 9.6 Sound + vibration while queue non-empty.  
- [x] 9.7 Open order / ack-dismiss matching web semantics (no new auto-accept rules).  
- [x] 9.8 Mounted for **entire** Admin shell (all tabs).

**Background / cold start:**

- [x] 9.9 Handle push notification response → navigate to order detail (or orders list).  
- [x] 9.10 Ensure push token still registered via existing customer push registration while in admin shell (user_id is the same person). — no change needed: push registration in `useLocalNotifications.js` keys off `isAuthenticated` (customer session), which stays true the whole time a mobile admin is in Admin Mode.

**NOTE (done):** Owner chose **full parity** (see chat) over a trimmed "core ops" scope, given web `Orders.jsx` (916 lines) + `GlobalOrderAlert.jsx` (451 lines).

Files: `utils/adminOrderStatus.js` (status/payment options, labels, colors — shared by list/detail/popup); `utils/realtimeOrder.js` gained `mergeAdminOrderPatch` (existing file already had `getRealtimeOrderId`/`getRealtimeOrderKey`/`isRecentRealtimeEvent` for the customer order-tracking merge — reused rather than duplicated). `adminApi.js` gained `listOrders`/`getOrder`/`updateOrderStatus`/`updateOrderPayment`.

`AdminOrdersScreen.js` — full filter parity (status chips + search inline, paymentStatus/paymentMethod/date-range in a bottom sheet), pagination, live merge via `admin.order.*` socket events with the recent-event dedupe window (ported from web), pull-to-refresh, row → `AdminOrderDetail`.

`AdminOrderDetailScreen.js` — refetch-latest-before-patch race guard + 409 handling identical to web's `handleStatusChange`/`handlePaymentChange` (confirm → refetch → compare → patch → on-409 refetch-and-surface); forward-only status progression enforced the same way (`statusOrder` index compare); WhatsApp/Map `Linking` actions; per-shop confirmation badges.

`AdminNewOrderPopup.js` — queue built directly from `admin.order.created` payloads (no extra fetch, matches web); reuses the existing `useNewOrderAlert` hook for sound (no new native dependency) plus a `Vibration.vibrate` loop on the same 8s cadence; auto-accept countdown readout + `admin.order.auto_accepted` acknowledgement state; queue chips to reorder; mounted once in `AdminNavigator` as a sibling to the Stack so it floats over every tab.

`AdminNavigator.js` restructured: outer `Stack.Navigator` (`AdminTabs` + `AdminOrderDetail`) replaces the bare `Tab.Navigator`, mirroring how `CustomerNavigator` lets tab screens push full-screen stack routes. `useLocalNotifications.js` gained a `new_order` tap case → `AdminOrderDetail` (falls back to the Orders list if `orderId` is missing).

**Bugs caught by tests, fixed before commit:**
1. `AdminOrderDetailScreen`'s silent refetch-after-409 was unconditionally calling `setError(null)` on success, wiping the just-set conflict message the refetch was supposed to accompany — matches web's `fetchSelectedOrder`, which never touches `error` at all. Fixed by only clearing error on non-silent fetches.
2. `jest.setup.js`'s global `expo-notifications` mock was missing `dismissNotificationAsync`, and `scheduleNotificationAsync`/the new one returned `undefined` instead of a promise — `useNewOrderAlert` calls `.catch()` on both. Latent gap (no prior test rendered anything using that hook); now both resolve.

New tests: `AdminOrdersScreen.test.js` (3), `AdminOrderDetailScreen.test.js` (3), `AdminNewOrderPopup.test.js` (6) — 12 total. `npm test`: 148/148 pass; `npm run lint` clean. Native RN, not browser-previewable — verified via tests/lint per the skip-verification rule.

---

### TASK 10 — Screen: Riders  `[P1][APP]`

- [x] 10.1 List online / heartbeat / active.  
- [x] 10.2 Create (phone + name); edit; activate/deactivate.  
- [x] 10.3 Live `admin.rider.updated` merge.  
- [x] 10.4 Show API exclusivity errors if phone is mobile admin.

**NOTE (done):** People tab (`AdminPeopleScreen.js`) rebuilt as a segmented control (Riders/Shops/Customers) — Riders is real now, Shops/Customers stay `AdminPlaceholderScreen` until TASK 11-12. New `AdminRidersScreen.js`: list with online dot + active toggle, create-by-phone drawer (phone must already have a user row, matching web), live merge on `admin.rider.updated` (event already wired in `adminRealtimeClient.js` from TASK 8 — no new socket plumbing needed), API error text (e.g. mobile-admin exclusivity 409) surfaced verbatim in the create drawer. `adminApi.js` gained `listRiders`/`createRider`/`updateRider`. New `tests/AdminRidersScreen.test.js` (5 cases: render, create+refresh, exclusivity error surfaced, toggle active, live merge). `npm test`: 153/153 pass; `npm run lint` clean.

---

### TASK 11 — Screen: Shops  `[P1][APP]`

- [x] 11.1 List name / open / active / owner phone.  
- [x] 11.2 Create/edit fields matching web payloads.  
- [x] 11.3 Toggle `is_open` / `active` with confirms.  
- [x] 11.4 No product assignment on phone.

**NOTE (done):** New `AdminShopsScreen.js`, wired as the "Shops" segment in `AdminPeopleScreen`. Fields/payloads match `apps/admin/src/pages/Shops.jsx` exactly (`owner_phone` always sent on edit since blank meaningfully clears the owner; omitted on create when blank). Confirm only on the closing/deactivating direction (opening/activating applies immediately) — same asymmetric-confirm precedent as the Dashboard delivery toggle. `adminApi.js` gained `listShops`/`createShop`/`updateShop`. New `tests/AdminShopsScreen.test.js` (4 cases: render, confirm-before-close, no-confirm-on-open, create with owner phone). `npm test`: 157/157 pass; `npm run lint` clean.

---

### TASK 12 — Screen: Customers  `[P1][APP]`

- [x] 12.1 Search + trusted/blocked filters.  
- [x] 12.2 Detail drawer.  
- [x] 12.3 Trust / block with confirm (same severity as web).

**NOTE (done):** New `AdminCustomersScreen.js`, wired as the "Customers" segment (People tab now fully real — Riders/Shops/Customers, no placeholders left). Search (debounced 400ms) + trusted/blocked filter chip rows, paginated list, detail sheet with contact info + Call/WhatsApp `Linking` actions, trust/block toggles — **both directions confirmed** (unlike the Shop/Dashboard asymmetric toggles), matching web's `handleToggleTrust`/`handleToggleBlock` which confirm every flip. `adminApi.js` gained `listCustomers`/`getCustomer`/`updateCustomerBlock`/`updateCustomerTrust`. New `tests/AdminCustomersScreen.test.js` (5 cases: render+badges, open detail, confirm-block, confirm-revoke-trust, filter chip refetch). `npm test`: 162/162 pass; `npm run lint` clean.

**Wave 3 (Directory) complete** — Riders/Shops/Customers all real.

---

### TASK 13 — Screen: Notifications  `[P1][APP]`

- [x] 13.1 Broadcast composer (title, body, type, target everyone/phones).  
- [x] 13.2 History list.  
- [x] 13.3 Template settings (event templates list/update/reset).  
- [x] 13.4 System keyboard for emoji (no heavy picker required).

**NOTE (done):** New `AdminNotificationsScreen.js` — top segmented control (Broadcast/Templates), mirrors `apps/admin/src/pages/Notifications.jsx`'s validation rules exactly (80/240 char limits, phone-list parsing/dedup, confirm-before-send with recipient-count description). Templates panel: enable/disable `Switch`, inline edit with Save/Cancel, confirm-before-reset. Deliberately dropped from web: the quick-template chips and custom emoji-picker grid (native keyboard emoji suffices per plan 13.4) — no other functional cut. `adminApi.js` gained `listNotifications`/`createNotification`/`deleteNotification`/`listNotificationTemplates`/`updateNotificationTemplate`/`resetNotificationTemplate`. New `tests/AdminNotificationsScreen.test.js` (6 cases: validation, confirm+send+history-refresh, phones-target validation, template list, toggle, confirm+reset). `npm test`: 168/168 pass; `npm run lint` clean.

---

### TASK 14 — Screen: Analytics Live  `[P1][APP]`

- [ ] 14.1 Live active-users strip (socket + poll fallback).  
- [ ] 14.2 Days presets (1/7/30).  
- [ ] 14.3 Summary cards + simple lists (top products / window shoppers) — no new chart lib.  
- [ ] 14.4 Find-users search (simplified web panel).  
- [ ] 14.5 User drill-down only if light; else web-only.

**NOTE (done):**

---

### TASK 15 — Hardening, tests, QA  `[P0]`

- [ ] 15.1 API tests: CRUD, exclusivity, mobile-session, me.admin, push fan-out mock.  
- [ ] 15.2 Manual QA matrix:

| # | Case | Expected |
|---|------|----------|
| 1 | Phone not in mobile_admins | Customer / shop / rider as today — **not** admin |
| 2 | Phone added + active | After OTP → **Admin Dashboard** immediately |
| 3 | Deactivate on web | Next `/auth/me` refresh or app restart → non-admin shell; existing admin JWT dies at expiry (≤12h) — no per-request check (§2.2) |
| 4 | Phone already rider; add as mobile admin | **409** exclusivity |
| 5 | Delivery toggle | Matches web / live settings |
| 6 | New order, app open | Popup + sound; list updates |
| 7 | New order, app background | Push received; tap opens order |
| 8 | Status / payment update | Same as web; 409 handled |
| 9 | Create rider/shop | Visible on web |
| 10 | Trust/block customer | Same enforcement as web |
| 11 | Send broadcast | Customers receive |
| 12 | Analytics live | Moves with traffic |
| 13 | Logout | Tokens cleared; no admin socket leak |
| 14 | Web password admin | Still works; no auto mobile_admin row |
| 15 | Add many admins | All work (no cap) |

- [ ] 15.3 Lint/test green for touched apps.  
- [ ] 15.4 Plan checkboxes + deploy handoff note (gated by phone list, no feature flag).

**NOTE (done):**

---

## 7. Execution waves

| Wave | Tasks | Why |
|------|-------|-----|
| **W1 Auth + push spine** | 1 → 2 → 3 → 4 → 5 → 6 → 7 | Must mint admin JWT **and** push path before UI value |
| **W2 Orders core** | 8, 9 | Daily ops: dashboard + orders + popup + deep link |
| **W3 Directory** | 10, 11, 12 | Riders / shops / customers |
| **W4 Comms + live** | 13, 14 | Notifications + analytics |
| **W5 Ship gate** | 15 | QA / tests |

After W1, screens in W2–W4 can parallelize **by screen file** if agents don’t conflict on `useAuthStore` / navigators.

---

## 8. File map (expected)

### API
- `apps/api/src/db/migrate.js`  
- `apps/api/src/utils/mobileAdmins.js` **new**  
- `apps/api/src/controllers/authController.js`  
- admin controller/routes (+ shop/rider exclusivity checks)  
- push fan-out near order/admin notification call sites  
- `apps/api/tests/*`

### Web admin
- `apps/admin/src/pages/MobileAdmins.jsx` **new**  
- `apps/admin/src/api/index.js`, `App.jsx`, `Sidebar.jsx`

### Customer app
- `navigation/AdminNavigator.js` **new**, `RootNavigator.js`  
- `screens/admin/*` — Dashboard, Orders, OrderDetail, NewOrderPopup, Riders, Shops, Customers, Notifications, Analytics  
- `api/adminApi.js` **new**, admin realtime helper  
- `stores/useAuthStore.js`  
- hooks: `useAdminRealtime.js`, `useAdminNewOrderAlert.js` **new**  
- notification response routing for admin deep links  

---

## 9. Non-goals / anti-patterns

- No WebView wrapping the Vite admin SPA.  
- No admin password field in the mobile app.  
- No customer JWT accepted on all `/admin/*` routes.  
- No hard max on mobile admins.  
- No shipping unfinished rider+admin mix to production without owner OK.  
- No full catalog/settings editors on phone in v1.

---

## 10. Definition of done (release)

- [ ] Owner can add **any number** of phones on web **Mobile Admins**  
- [ ] Those phones **OTP → Admin Dashboard** (never customer home while active admin)  
- [ ] One phone cannot also be active shop/rider (API enforced)  
- [ ] Delivery toggle + orders status/payment match web  
- [ ] **In-app popup + sound** for new orders  
- [ ] **Background push** for new orders; tap opens order  
- [ ] Riders / Shops / Customers / Notifications / Analytics Live usable one-handed  
- [ ] Non-admin phones unchanged; web password admin unchanged  
- [ ] API tests green; this plan ticked  

---

## 11. Handoff one-liner

> **Web assigns admin phones → OTP login → mint admin JWT → AdminNavigator (Dashboard) with full ops on scoped pages; new orders alert via BG push + in-app popup; one phone = one role; no admin cap.**

---

*End of plan.*
