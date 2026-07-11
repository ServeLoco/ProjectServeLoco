# ProjectServeLoco — Rider Mode & Order Assignment

Spec date: 2026-07-11 · Updated: 2026-07-12 · Branch: `feat/riderMode` · Status: **PLAN — TASK 1–9 done; TASK 10+ OPEN**  
Instruction spec for an implementing AI. Follow it literally.

This plan turns the rider workflow diagram + rules into buildable work. It maps **what already exists**, **what must be built**, and **task-by-task steps** with files, acceptance criteria, and test commands.

**Product-owner answers (2026-07-11) are locked in §4 and §5. Do not re-ask. Do not invent policy.**

---

## 0. How to read this file

1. Read **BACKGROUND** + **EXISTING vs NEW** first — do not re-derive those from the codebase unless a path has moved.
2. Read **LOCKED DECISIONS** (§4) before coding. All former open questions are **RESOLVED** in §5.
3. Execute tasks **in order** (TASK 1 → last). Later tasks assume earlier ones are done.
4. Same AI rules as shop-owner specs: surgical changes only, additive API shapes (camelCase + snake_case where the surrounding response already duplicates), one commit per task, run tests after each backend/app task.

**Commit format:** `feat: RIDER TASK <n> — <short title>`

**DO NOT TOUCH (unless a task explicitly says so):**
- `apps/api/src/utils/coupons.js` rule engine / coupon `FOR UPDATE` locking
- Compare-and-set order status updates and their `409 CONCURRENCY_CONFLICT` responses (extend carefully; do not weaken)
- Idempotency-Key logic in `createOrder`
- `settings.shop_open` / `settings.delivery_available` semantics beyond the rider-availability sync this plan defines
- Shop-owner confirm/reject/ready as informational status (do not make shop confirm gate `orders.status` unless a later decision changes this)
- `cleanupDeadTokens` / existing Expo push hygiene

---

## 1. BACKGROUND — current platform (verified in code 2026-07-11)

### 1.1 Apps & roles today

| Surface | Path | Auth | Role in JWT |
|---|---|---|---|
| Customer + Shop Owner (same Expo app) | `apps/customer-app` | Firebase phone OTP → customer JWT | `role: 'customer'` always |
| Admin web | `apps/admin` | Admin JWT | `role: 'admin'` |
| API | `apps/api` | Express + Socket.IO | — |
| Web PWA / Landing | `apps/web`, `apps/landing` | not in scope for rider v1 | — |

**There is no rider table, rider API, rider navigator, or rider assignment engine today.** Grep for `rider` / delivery-partner finds nothing product-related.

### 1.2 Two “modes” in the mobile app (user language)

Users talk about **Customer mode** and **Shop owner mode**. Implementation:

- After OTP / `GET /auth/me`, if `users.id` owns an active shop (`shops.owner_user_id`), response includes `shop: { id, name, isOpen, … }`.
- `RootNavigator` branches: `isAuthenticated && shop ? <ShopOwnerNavigator /> : <CustomerNavigator />`.
- JWT stays `role: 'customer'`. Capability is **DB lookup**, not a JWT role change.
- Shop owner screens: Dashboard (open toggle + Accept/Reject popup), Orders, Products.
- Shop Accept/Reject is **per shop’s line items** via `order_items.shop_confirmed_at` / `shop_rejected_at` / `shop_ready_at`. It does **not** change `orders.status`.

**Note:** `store_modes` (`packed` / `fast_food` etc.) is a **catalog mode** (product catalog capsule), not customer/shop/rider app mode. Do not reuse `store_modes` for rider.

### 1.3 Order lifecycle today

```
Customer places order
        │
        ▼
   status = Pending
        │
        ├─ Admin PATCH status → Accepted   ─┐
        └─ Auto-accept after 120s           ─┤
                                             ▼
                                    notifyShopsForOrder()
                                    (push + socket shop.order.assigned)
                                             │
                                             ▼
                              Shop owner popup: Accept / Reject / Ready
                              (informational timestamps on order_items)
                                             │
                                             ▼
                    Admin manually: Preparing → Out for Delivery → Delivered
                    (or Cancelled)
```

**Status ENUM** (`orders.status`):  
`Pending` → `Accepted` → `Preparing` → `Out for Delivery` → `Delivered` | `Cancelled`  
Forward-only; compare-and-set with 409 on conflict.

### 1.4 Delivery availability today

- Global `settings.delivery_available` is the **master gate** for whether the business delivers.
- When `delivery_available = OFF`, `shop_open` is forced closed (see `syncGlobalShopOpenState` in `apps/api/src/utils/shops.js` and settings controller).
- When shops open/close, global `shop_open` auto-tracks **if** delivery is available.
- **No automatic coupling to riders** (riders do not exist yet).

### 1.5 Notification infra to reuse (do not rebuild)

| Channel | Where | Used for |
|---|---|---|
| Expo push | `apps/api/src/utils/expoPush.js` (`sendPushToUser`, `sendPushToMany`) | Customer + shop pushes (Expo tokens on `users.push_token`) |
| Customer inbox + push templates | `notificationService.js`, `notifications` table | Order status events |
| Admin inbox | `adminNotifications.js` + `admin_notifications` table | New order, shop rejected, auto-cancel, etc. |
| Socket.IO | `realtime/socket.js` | Rooms: `customer:{id}`, `customers`, `admin` only |
| Shop fan-out pattern | `utils/shops.js` → `emitToCustomer(ownerId, …)` + Expo push | Model for rider fan-out |

Diagram mentions **FCM** — production path is **Expo Push** (which may use FCM under the hood on Android). Implement with Expo push + Socket.IO, same as shop-owner. Do not add a separate raw FCM client unless a later decision requires it.

### 1.6 Shop-owner popup pattern to mirror for riders

- `NewOrderPopup.js` — full-screen non-dismissible Accept/Reject, **120s client countdown**.
- `useNewOrderAlert.js` — repeating local notification sound while popup open.
- Queue is **one order at a time** on the client; server still sends per shop independently for multi-shop.

Rider rules require **server-authoritative** 2-minute timer and **exactly one rider** offered an order at a time — stricter than shop fan-out.

---

## 2. TARGET PRODUCT FLOW (from diagram + rules)

### 2.1 Happy path (matches diagram step 1–assign)

```
1. Customer places order
2. Platform accepts order (admin or auto-accept) → shops notified
3. Shop owner(s) Accept (confirm) their items
4. When ALL shops on that order have accepted → Rider assignment starts  ← NEW
5. Backend: GET current active riders (online & available)
6. Exactly ONE selected rider gets popup + Expo push (2 min server timer)
7. Rider Accepts → order assigned; notify shop + customer; rider starts delivery
8. Rider and/or Admin: Picked up → Out for Delivery → Delivered
9. Customer / shop / admin notified at each step
```

**Diagram note:** The flowchart box still shows “Timer: 30–45 Seconds” and “IMPORTANT RULES #4: 30–45 sec”. **Owner override: use 2 minutes (120s) everywhere.** Ignore 30–45s in the image.

### 2.2 Assignment rules (authoritative — auto-assign only)

There is **no admin manual rider pick** in v1. Assignment is 100% the engine below.

| Situation | Behavior |
|---|---|
| **0 active riders** when assignment starts (or after re-check) | `Delivery Available = OFF`; **Cancel order**; show on Admin Order page; **Notify Admin** |
| **1 active rider** | Send Accept/Reject popup + push to that rider only; start **2-minute** server timer |
| **>1 active riders** | Select rider with **least orders completed today**; if tie → **pick random** among ties; send popup to **only that one** |
| Rider **Accepts** | Assign order to that rider; notify shop; notify customer; rider starts delivery; stop assignment |
| Rider **Rejects** | Exclude that rider for this order forever; **re-fetch latest active riders**; if another eligible → offer them (same selection rules); if none → cancel + notify admin |
| **Timeout (2 min, no accept)** | Treat exactly as **Rejected** → same re-fetch / reassign / cancel chain |
| Rider goes **offline** after receiving popup | **Do NOT reject**. Offer stays pending for remaining time. On app restart / dashboard open, popup still shows until accept/reject/timeout. Only reject if not accepted in 2 min. |
| Rider **Accepts then cancels later** (before pickup only) | Treat as **Rejected**; remove rider from order; re-fetch active riders; continue flow excluding them |
| Rider tries to cancel **after pickup** | **Forbidden** (API 400) |
| No eligible riders left | Cancel order; Admin Order page; Admin notification |
| Same order offered to **multiple riders at once** | **Forbidden** (no duplicate accept) |
| Same rider offered same order again after reject/timeout/cancel | **Forbidden** |

### 2.3 Delivery availability auto rules

| Event | Action |
|---|---|
| Active rider count becomes 0 | Set `settings.delivery_available = OFF` (and existing side-effect: force `shop_open` closed via existing sync) |
| Any rider becomes active (online & available) | Set `settings.delivery_available = ON` (then existing shop_open sync can re-open banner if shops are open) |

**Active rider** definition (v1):

- Linked to a `riders` row with `active = 1` (admin kill switch).
- `is_online = 1` (rider toggled on / heartbeat not expired).
- `is_available = 1` (not busy on another active delivery — see decisions).
- Soft presence: last heartbeat within `RIDER_HEARTBEAT_TTL_SEC` (default 90s) **OR** explicit online toggle with heartbeat refresh — pick one implementation (TASK 2 query + TASK 4 endpoints) and document it in code comments.

### 2.4 Notifications matrix

| Who | When |
|---|---|
| **Rider** | Selected for offer: Expo push + in-app popup + 2 min countdown |
| **Customer** | Shop accepted (existing); rider assigned; picked up; out for delivery; delivered; cancelled (no rider) |
| **Shop** | Rider assigned; picked up; delivered; cancelled (assignment failed) |
| **Admin** | Zero riders / assignment exhausted / order cancelled for no rider |

---

## 3. EXISTING vs NEW (gap analysis)

### 3.1 Reuse as-is

| Asset | Path | Reuse how |
|---|---|---|
| Customer JWT + phone OTP | `authController`, `signCustomerToken` | Riders log in same way |
| Auth store branching | `useAuthStore`, `RootNavigator` | Add `rider` identity next to `shop` |
| Shop navigator pattern | `ShopOwnerNavigator` | Clone as `RiderNavigator` |
| New-order popup UX | `NewOrderPopup.js`, `useNewOrderAlert` | Clone as `RiderOfferPopup` (server timer remaining) |
| Expo push | `expoPush.js` | Offer + status pushes to riders |
| Admin inbox | `adminNotifications.js` | New types for rider failures |
| Order status pipeline | `adminController.updateOrderStatus`, `orderEvents` | Extend with rider-driven transitions |
| Delivery gate | `settings.delivery_available` | Auto-toggle from rider presence |
| Shop confirm hook point | `confirmMyOrder` | **Trigger** assignment when **all** shops on the order have confirmed |
| Auto-accept + admin accept | `orderAutoAccept`, `updateOrderStatus` | Still put order into Accepted → shops first; **not** the rider start trigger (except house-only items with no shop) |
| Cancel side-effects | coupon cancel, payment_status mapping, shop cancel notify | When assignment fails and order cancels |
| Admin Orders UI | `apps/admin/src/pages/Orders.jsx` | Show rider fields + cancel reasons (read-only assignment; no manual assign) |
| Admin Settings | delivery toggle UI | Label that Delivery Available is auto-managed by rider online state |

### 3.2 Must build (net-new)

| Area | What |
|---|---|
| Schema | `riders`, `rider_order_offers`, order rider columns, optional daily delivery counters |
| Auth exposure | `rider` object on login / `/auth/me` |
| Middleware | `requireRider` |
| Assignment engine | Server service: select → offer → timer → accept/reject/timeout → reassign → cancel |
| Presence / availability | Online toggle, heartbeat, auto delivery_available sync |
| API routes | `/api/rider/*` for me, toggle, offers, accept, reject, cancel-assignment, delivery status |
| Realtime | Socket rooms for riders (or reuse `customer:{id}` like shops); events `rider.offer.*` |
| Customer app UI | Rider navigator: Dashboard (online toggle + active job), Offers popup, History |
| Admin UI | **Riders page** (admin-only create/link user phone → rider), order detail rider panel, notifications |
| Tests | Unit + integration for selection, exclusion, timeout, cancel, delivery gate, mutual exclusion |
| Notification templates | New event keys for rider-assigned / picked-up / etc. |

### 3.3 Explicit non-goals (v1)

- Separate rider APK / different auth stack
- GPS live tracking map / route optimization
- Rider payouts / cash settlement
- Multi-rider batching (one rider many orders)
- Customer choosing a specific rider
- **Admin manual assign / force-pick a rider** (engine auto-assign only)
- Rider self-signup
- Same phone/user as both shop owner and rider
- Combos / multi-shop pickup optimization UI (schema supports multi-shop; UI can show shop names/addresses list only)

---

## 4. LOCKED DECISIONS (owner-confirmed 2026-07-11)

**Do not change these without an explicit product-owner update.**

| # | Decision | LOCKED value |
|---|---|---|
| D1 | App surface | Same Expo app as customer/shop. Login OTP → if user is a **rider** (and not shop), show **RiderNavigator**. |
| D2 | One role per phone/user | **Hard mutual exclusion.** One `users` row / phone is **either** shop owner **or** rider **or** plain customer — **never** shop+rider. Admin create-rider rejects if user owns a shop; assign-shop-owner rejects if user is a rider. UI is completely different per role. |
| D3 | JWT | Still `role: 'customer'`. Capability from DB (`requireRider` looks up `riders` by `user_id`). |
| D4 | Assignment trigger | Start when **all shop owners on that order have Accepted** (`shop_confirmed_at` set for every distinct non-null `shop_id` on the order). First shop alone is not enough. House-only / no-shop items: start when order reaches `Accepted`. |
| D5 | Offer timer | **120 seconds (2 minutes)**, server-side. Client shows remaining from `expires_at`. Diagram “30–45s” is **wrong / obsolete**. |
| D6 | Offline during offer | Do **not** reject for offline. Offer stays pending full 2 min. App restart / dashboard reopen still shows popup until accept, reject, or timeout. |
| D7 | Post-accept cancel | Allowed **only before pickup** (`rider_picked_up_at IS NULL`). Treated as reject → reassignment excluding that rider. **After pickup: cannot cancel.** |
| D8 | Selection metric | Least **completed deliveries today** (`status = 'Delivered'`, `rider_id = X`, calendar day in **`Asia/Kolkata`**). Ties → random among tied riders. After reject, re-select among remaining eligible (exclude rejectors) with same rule. |
| D9 | Status after accept | Set `orders.rider_id`, `rider_assigned_at`; do **not** auto-jump to Out for Delivery. Rider marks **Picked up** (`rider_picked_up_at`). |
| D10 | Who sets Out for Delivery / Delivered | **Both rider and admin** may advance status (rider only for orders assigned to them; admin global as today). Minimal ENUM: no new status values; use timestamps + existing statuses. |
| D11 | Zero / exhausted riders | Cancel order (`cancel_reason` e.g. `No riders available` / `No rider accepted`); Admin Orders page; Admin notification. Sync `delivery_available = OFF` when zero active riders globally. |
| D12 | delivery_available | **Automatic** from active rider count: any rider online → ON; zero online → OFF. Call existing `syncGlobalShopOpenState` after flips. |
| D13 | Concurrent capacity | Rider with an active assignment (order with their `rider_id` and status not Delivered/Cancelled) is **not** eligible for new offers. |
| D14 | Push / alert | Expo push + Socket.IO in-app popup (see §16). Payload `{ type: 'rider_offer', orderId, offerId, expiresAt }`. **One rider at a time.** |
| D15 | Multi-instance API | DB `expires_at` + periodic sweeper (5–10s) + boot rehydrate. Never rely only on in-memory timers. |
| D16 | Rider creation | **Admin only.** New Admin panel **Riders** page: create by linking existing customer phone/user; activate/deactivate. No self-signup. |
| D17 | Assignment mode | **Auto-assign engine only** (diagram rules). No admin “pick this rider” UI in v1. Admin can still cancel order / change status. |

---

## 5. RESOLVED QUESTIONS (was open — now closed)

| # | Question | Owner answer | Plan impact |
|---|---|---|---|
| Q1 | When does rider assignment start? | When **all** shop owners accept (confirm) the order | D4; `maybeStartRiderAssignment` after last confirm |
| Q2 | Who marks Out for Delivery / Delivered? | **Both** rider and admin | D10; rider status endpoints + existing admin PATCH |
| Q3 | Cancel after pickup? | **No** | D7; API rejects cancel if `rider_picked_up_at` set |
| Q4 | Admin manual assign? | **No** — only the auto rules you specified | D17; remove retry-manual-assign as product feature (optional internal recover endpoint not required) |
| Q5 | Rider create? | **Admin only** + admin panel page | D16; TASK 9 Riders page |
| Q6 | Timezone for “today”? | **Yes → Asia/Kolkata** | D8 |
| Q7 | Same user shop + rider? | **No** — one phone = one role only (UI differs) | D2; enforce on admin create |

No remaining product questions. Implementers execute tasks.

---

## 6. DATA MODEL

### 6.1 Table: `riders`

```sql
CREATE TABLE IF NOT EXISTS riders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,              -- FK users.id; same phone login as customer
  display_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NULL,                   -- denormalized for admin list; source of truth users.phone
  active BOOLEAN DEFAULT TRUE,              -- admin kill switch
  is_online BOOLEAN DEFAULT FALSE,          -- rider toggle
  last_heartbeat_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_riders_online (active, is_online, last_heartbeat_at)
);
```

Semantics:

- Customer-visible “active rider” = `active=1 AND is_online=1 AND last_heartbeat_at > NOW() - INTERVAL N SECOND` (and no open assignment per D13).
- Deleting a user cascades rider row.

### 6.2 Columns on `orders`

```js
await ensureColumn('orders', 'rider_id', 'rider_id INT NULL AFTER cancel_reason');
await ensureColumn('orders', 'rider_assigned_at', 'rider_assigned_at TIMESTAMP NULL DEFAULT NULL AFTER rider_id');
await ensureColumn('orders', 'rider_picked_up_at', 'rider_picked_up_at TIMESTAMP NULL DEFAULT NULL AFTER rider_assigned_at');
// Optional but useful for audit:
await ensureColumn('orders', 'rider_assignment_status',
  "rider_assignment_status ENUM('none','searching','offered','assigned','failed') DEFAULT 'none' AFTER rider_picked_up_at");
```

Index: `idx_orders_rider (rider_id, status)`.

No FK required on `rider_id` if following shop pattern of application integrity; FK to `riders(id)` is fine if preferred.

### 6.3 Table: `rider_order_offers`

Tracks each sequential offer (one row per attempt). Enforces single concurrent offer per order via application lock + unique partial logic.

```sql
CREATE TABLE IF NOT EXISTS rider_order_offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  rider_id INT NOT NULL,
  status ENUM('pending','accepted','rejected','expired','cancelled') NOT NULL DEFAULT 'pending',
  offered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  responded_at TIMESTAMP NULL DEFAULT NULL,
  reject_reason VARCHAR(64) NULL,           -- 'manual' | 'timeout' | 'post_accept_cancel' | 'admin'
  -- NO unique key on (order_id, status): multiple rejected/expired rows per order are expected.
  -- "Only one status='pending' per order" is enforced in the service layer (see below).
  UNIQUE KEY uq_offer_order_rider (order_id, rider_id), -- HARD no-re-offer guarantee: a rider can
  -- ever get at most ONE offer row per order → assignment loop always terminates at DB level.
  INDEX idx_offer_rider_status (rider_id, status),
  INDEX idx_offer_expires (status, expires_at),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE
);
```

**Do not rely on** `UNIQUE (order_id, status)` alone for “one pending” (multiple rejected rows share status). Enforce with:

```sql
SELECT id FROM rider_order_offers WHERE order_id = ? AND status = 'pending' FOR UPDATE;
```

inside a transaction before insert.

### 6.4 Rejected riders set (anti-loop memory)

Derived from `rider_order_offers` where `status IN ('rejected','expired')` for that `order_id`. No separate table needed — DB rows are the persistent “rejected riders” memory (survive restarts; per-order, so a rider excluded here is still eligible for *other* orders).

**Post-accept cancel counts as rejected:** when a rider cancels after accepting (§7.9), UPDATE their `accepted` offer row to `status='rejected', reject_reason='post_accept_cancel'` (audit preserved via reject_reason + responded_at). Do **not** insert a second row. `status='cancelled'` is reserved for offers revoked because the *order* was cancelled — those riders are not “rejectors”.

**Loop termination invariant:** every re-selection excludes all riders with an existing offer row for this order; `uq_offer_order_rider` makes re-offering the same rider impossible at DB level. Each cycle shrinks the eligible pool by ≥1, pool is finite → flow always ends in **accepted** or **failAssignment (cancel)**. Never loops.

### 6.5 Admin notification types (add to `TYPES`)

```js
RIDER_ASSIGNMENT_FAILED: 'rider_assignment_failed',
RIDER_ZERO_AVAILABLE: 'rider_zero_available',
ORDER_CANCELLED_NO_RIDER: 'order_cancelled_no_rider',
```

---

## 7. ASSIGNMENT ENGINE (server design)

### 7.1 Module layout

| File | Responsibility |
|---|---|
| `apps/api/src/services/riderAssignment.js` (new) | Pure orchestration: start, offer, accept, reject, expire, fail |
| `apps/api/src/utils/riders.js` (new) | `getRiderForUser`, `listActiveRiders`, `countCompletedToday`, `syncDeliveryAvailabilityFromRiders` |
| `apps/api/src/controllers/riderController.js` (new) | HTTP handlers |
| `apps/api/src/routes/riderRoutes.js` (new) | Mount at `/api/rider` |
| `apps/api/src/middleware/riderMiddleware.js` (new) | `requireRider` after `requireCustomer` |
| `apps/api/src/realtime/riderOfferSweeper.js` (new) | Interval job to expire offers + rehydrate on boot |
| Hook points | End of `confirmMyOrder` (after all shops confirmed); optional admin “retry assignment” |

### 7.2 Pseudocode — `startAssignment(orderId)`

```
BEGIN TX / row lock order
  if order cancelled or already has rider_id → return
  if rider_assignment_status in ('searching','offered','assigned') → return (idempotent)
  set rider_assignment_status = 'searching'
COMMIT

riders = listEligibleRiders(excludeRiderIds=[])
if riders empty:
  failAssignment(orderId, reason='no_riders')
  return

chosen = selectRider(riders)  // min completed today, random tie-break
createOffer(orderId, chosen, expires_at = now+120s)
set rider_assignment_status = 'offered'
push + socket to chosen.user_id
```

### 7.3 Pseudocode — `selectRider(riders)`

```
for each rider: completedToday = COUNT delivered orders today by rider_id
min = min(completedToday)
candidates = riders where completedToday == min
return random(candidates)
```

### 7.4 Pseudocode — `onRejectOrExpire(offerId)`

```
mark offer rejected/expired
clear any transient state
excluded = all riders with rejected/expired for this order
riders = listEligibleRiders(exclude=excluded)
if empty → failAssignment
else createOffer to selectRider(riders)
```

### 7.5 Pseudocode — `failAssignment(orderId)`

```
set rider_assignment_status = 'failed'
cancel order (same side effects as admin/shop auto-cancel):
  status=Cancelled, payment_status map, coupon cancel, cancel_reason
admin notification
notify customer (status_cancelled)
notify shops (notifyShopsOrderCancelled)
emit order status realtime
// delivery_available OFF only if zero active riders globally — syncDeliveryAvailabilityFromRiders()
```

### 7.6 Pseudocode — `acceptOffer(offerId, riderUserId)`

```
BEGIN TX
  lock offer pending + lock order
  if offer not pending or expired → 409
  if order already has rider → 409
  mark offer accepted
  set order.rider_id, rider_assigned_at, rider_assignment_status='assigned'
COMMIT
notify customer + shops + admin socket
```

### 7.7 Concurrency / no double accept

- Always lock offer row `FOR UPDATE` before accept.
- Only `status='pending' AND expires_at > NOW()` can be accepted.
- Never create a second pending offer while one is pending (transactional check).
- Sweeper uses compare-and-set: `UPDATE … status='expired' WHERE id=? AND status='pending' AND expires_at <= NOW()`.

### 7.8 Offline during popup

- Offer remains `pending` until expire.
- Rider app on cold start: `GET /api/rider/offers/active` returns pending offer with `secondsRemaining`.
- Going offline does not call reject API.

### 7.9 Post-accept cancel (before pickup only)

```
rider cancels assignment:
  if rider_picked_up_at IS NOT NULL → 400 CANNOT_CANCEL_AFTER_PICKUP
  clear order.rider_id, rider_assigned_at
  set rider_assignment_status = 'searching'
  UPDATE their accepted offer row → status='rejected', reject_reason='post_accept_cancel'
  (same row, no new insert — see §6.4; keeps them in the excluded set → they can NEVER
   be re-offered this order, so no accept→cancel→re-offer loop)
  onRejectOrExpire flow excluding that rider (re-fetch active, least-orders, one popup, …)
```

---

## 8. API SURFACE

### 8.1 Auth shape (additive)

`POST /auth/firebase-verify` and `GET /auth/me` already return `shop`. Add:

```json
{
  "token": "...",
  "user": { "...": "..." },
  "shop": null,
  "rider": {
    "id": 1,
    "displayName": "Ravi",
    "isOnline": true,
    "active": true
  }
}
```

Both casings where surrounding responses already do: `isOnline` / `is_online`.

### 8.2 Rider routes (`/api/rider`, all `requireCustomer` + `requireRider`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/me` | Rider profile + online state + current assignment summary |
| PATCH | `/me/online` | body `{ isOnline: boolean }` — toggle online; refresh heartbeat; sync delivery_available |
| POST | `/me/heartbeat` | Keepalive while online (every 30–45s from app) |
| GET | `/offers/active` | Current pending offer for this rider (or null) + `expiresAt` |
| POST | `/offers/:offerId/accept` | Accept |
| POST | `/offers/:offerId/reject` | Reject |
| GET | `/assignments/current` | Active assigned order (if any) with customer address + shop list |
| POST | `/assignments/:orderId/cancel` | Post-accept cancel → reassignment (**400 if already picked up**) |
| POST | `/assignments/:orderId/picked-up` | Set `rider_picked_up_at` |
| PATCH | `/assignments/:orderId/status` | Allowed: `Out for Delivery`, `Delivered` (only if `orders.rider_id` is this rider) |
| GET | `/assignments/history` | Paginated past deliveries |

### 8.3 Admin routes (under existing admin auth)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/riders` | List riders |
| POST | `/api/admin/riders` | Create: `{ userId }` or `{ phone }` + displayName. **Reject 400** if user owns a shop. |
| PATCH | `/api/admin/riders/:id` | Update active, displayName |
| — | *(no manual assign endpoint)* | Assignment is engine-only (D17) |

When admin creates/updates a **shop** owner (`owner_user_id`), reject if that user is already a rider (D2).

### 8.4 Public / settings

- Customer cart/order already reads `delivery_available`. No new public endpoint if settings payload already includes it.
- When auto-toggled, emit existing realtime events if any (`settings` updates) so customer app banners refresh — mirror `settings.shop_open.updated` pattern with `settings.delivery_available.updated` if not present.

### 8.5 Socket events (new)

| Event | Room | Payload |
|---|---|---|
| `rider.offer.created` | `customer:{userId}` of rider | `{ offerId, orderId, orderNumber, expiresAt, address summary? }` |
| `rider.offer.expired` | same | `{ offerId, orderId }` |
| `rider.offer.revoked` | same | if admin cancelled order mid-offer |
| `rider.assignment.updated` | rider + customer + admins | status changes |
| `admin.order.rider_updated` | `admin` | assignment progress |

Reuse `emitToCustomer` for riders (same as shops). Optional later: dedicated `rider:{id}` room — not required if user_id room works.

---

## 9. CLIENT (customer-app) PLAN

### 9.1 Auth & navigation

1. Extend `useAuthStore`: `rider` field next to `shop`; hydrate from login/me.
2. `RootNavigator` branch order (D2 guarantees shop and rider are never both set for one user):

```js
if (isAuthenticated && shop) return <ShopOwnerNavigator />;
if (isAuthenticated && rider) return <RiderNavigator />;
return <CustomerNavigator />;
```

Admin must never create overlapping roles; if data is corrupt and both exist, prefer shop and log error.

3. New `RiderNavigator` tabs (v1):
   - **Dashboard** — online toggle, active job card, empty state
   - **History** — past deliveries
   - **Profile** — logout, support phone

### 9.2 Screens & components

| Component | Behavior |
|---|---|
| `RiderOfferPopup` | Clone shop `NewOrderPopup`; Accept/Reject; countdown from **server `expiresAt`**, not a fresh 120s on mount only (compute remaining; if app was backgrounded, remaining shrinks correctly) |
| `useRiderOfferAlert` | Clone `useNewOrderAlert` sound loop while popup open |
| `RiderDashboardScreen` | Online toggle; if pending offer → popup; if assigned order → job card with actions (Picked up, Out for Delivery, Delivered, Cancel assignment) |
| Heartbeat | `AppState` + interval while `isOnline`; call `/me/heartbeat` |
| Cold start | On mount, fetch `/offers/active` + `/assignments/current` so restart restores popup (D6) |

### 9.3 What rider popup shows

- Order number
- Countdown remaining
- Delivery address (customer needs rider to deliver — **unlike shop popup**, address is required)
- Shop names / pickup notes (list of shops that confirmed)
- **No payment internal details** beyond COD/UPI label if useful
- Accept / Reject only; non-dismissible

### 9.4 Push handling

- Extend `useLocalNotifications` deep-link: `type === 'rider_offer'` → open Rider dashboard / popup.
- Register same Expo push token path as customer (already on `users.push_token`).

---

## 10. ADMIN UI PLAN

| Page | Work |
|---|---|
| New **Riders** page | List, create (pick customer by phone), activate/deactivate, see online state |
| **Orders** detail | Show rider name, assignment status, offer history, cancel reason if no rider |
| **Notifications** | New types appear in existing bell (`AdminNotificationsBell`) |
| **Settings** | Label that Delivery Available auto-follows riders; keep manual override |

Sidebar entry + route in admin router.

---

## 11. HOOK INTO SHOP ACCEPT (critical integration)

**File:** `apps/api/src/controllers/shopOwnerController.js` → `confirmMyOrder`

After successful confirm:

```js
// After setting shop_confirmed_at:
await maybeStartRiderAssignment(orderId);
```

`maybeStartRiderAssignment`:

1. Load distinct `shop_id`s on order (non-null).
2. If any shop still has any item without `shop_confirmed_at` and without full rejection → return.
3. If all shops rejected → existing auto-cancel handles it; do not start riders.
4. Else `startAssignment(orderId)`.

Also handle **orders with only house items** (`shop_id` all null): call `startAssignment` from admin accept + auto-accept paths when status becomes `Accepted`.

**Do not** start assignment from shop reject.

---

## 12. DELIVERY AVAILABILITY SYNC

**File:** `apps/api/src/utils/riders.js` → `syncDeliveryAvailabilityFromRiders`

```
activeCount = countActiveRiders()
desired = activeCount > 0
UPDATE settings SET delivery_available = desired WHERE delivery_available != desired
if changed:
  syncGlobalShopOpenState()  // existing
  emit settings.delivery_available.updated to customers
```

**Definition for the gate:** `countActiveRiders()` counts riders that are `active=1 AND is_online=1 AND heartbeat fresh` — **ignoring** whether they are busy on a delivery. This follows the diagram literally (“Delivery OFF only when all riders offline”). Busy-ness (D13) only affects *offer eligibility*, not the gate.

> ⚠️ **OWNER CHECK (non-blocking):** consequence of this definition — if the *only* online rider is mid-delivery, customers can still place orders, and those orders will be **cancelled at assignment** (zero eligible riders, D11/D13). Alternatives if unwanted: (a) gate counts only *eligible* (non-busy) riders → delivery flips OFF while the sole rider is on a job; or (b) engine waits/retries instead of cancelling when all online riders are busy → new policy, not in locked rules. Default implemented: literal diagram behavior above. Change requires an owner update to D11/D12/D13.

Call from:

- Rider online toggle
- Heartbeat expiry sweeper (mark offline if heartbeat stale, then sync)
- Rider deactivate (admin)
- Optionally after failAssignment when no riders left

**Customer effect:** cart/checkout already refuses when delivery off — verify tests still cover this.

---

## 13. DETAILED TASKS

### TASK 1 — Schema: riders + order columns + offers  `[P0]`

**Goal:** Idempotent migration only.

**Files:** `apps/api/src/db/migrate.js`

**Steps:**

- [x] 1.1 Create `riders` table (section 6.1) after shops block; log `Riders table ready.`
  NOTE (done): `riders` table + `idx_riders_online` after shops block.
- [x] 1.2 Create `rider_order_offers` table (section 6.3). Prefer **no** broken unique on `(order_id, status)`; add indexes listed; enforce single pending in service layer.
  NOTE (done): Table after order_items with `uq_offer_order_rider` + indexes; no unique on status.
- [x] 1.3 `ensureColumn` on `orders`: `rider_id`, `rider_assigned_at`, `rider_picked_up_at`, `rider_assignment_status`.
  NOTE (done): Four ensureColumns after idempotency columns.
- [x] 1.4 Indexes: `idx_orders_rider`, offer indexes.
  NOTE (done): `idx_orders_rider (rider_id, status)`; offer indexes in CREATE TABLE.
- [x] 1.5 Seed nothing by default.
  NOTE (done): No seed rows.
- [x] 1.6 `npm test` in `apps/api`.
  NOTE (done): 53 suites, 543 passed, 1 skipped.

**Acceptance:** Fresh migrate + re-run migrate both succeed; existing tests green.

---

### TASK 2 — Utils: rider identity + active query + delivery sync  `[P0]`

**Files:** `apps/api/src/utils/riders.js` (new), tests `apps/api/tests/ridersUtils.test.js`

**Steps:**

- [x] 2.1 `getRiderForUser(userId)` → rider shape or null (mirror `getShopForUser`).
  NOTE (done): `utils/riders.js` riderShape + getRiderForUser.
- [x] 2.2 `listEligibleRiders({ excludeIds = [] })` — active, online, heartbeat fresh, no open assignment, not in excludeIds.
  NOTE (done): SQL with heartbeat TTL + NOT EXISTS open assignment + excludeIds.
- [x] 2.3 `countCompletedDeliveriesToday(riderId, timezone)`.
  NOTE (done): Asia/Kolkata via `+05:30` CONVERT_TZ day boundary.
- [x] 2.4 `selectRiderByLeastOrders(riders)` — pure function, unit-tested for ties/random seed injectability.
  NOTE (done): pure + inject random; selectEligibleRider attaches counts.
- [x] 2.5 `syncDeliveryAvailabilityFromRiders()` as section 12.
  NOTE (done): ON/OFF from countActiveRiders; bust cache + socket + syncGlobalShopOpenState.
- [x] 2.6 `npm test`.
  NOTE (done): 54 suites, 560 passed (incl. ridersUtils).

---

### TASK 3 — Auth: expose `rider` on login / me  `[P0]`

**Files:** `authController.js`, `utils/riders.js`, auth tests

**Steps:**

- [x] 3.1 On `firebaseVerify` success and `me`, attach `rider: await getRiderForUser(userId)` (null if none).
  NOTE (done): `me`, firebaseVerify success path, and race path all return `rider`.
- [x] 3.2 Do not change JWT claims.
  NOTE (done): JWT still role customer only.
- [x] 3.3 If both shop and rider exist, return both; client applies D2 priority (document). Optional: log warning.
  NOTE (done): returns both + console.warn on dual role.
- [x] 3.4 `npm test`.
  NOTE (done): 54 suites green.

---

### TASK 4 — Middleware + rider routes skeleton  `[P0]`

**Files:** `riderMiddleware.js`, `riderController.js`, `riderRoutes.js`, `app.js`

**Steps:**

- [x] 4.1 `requireRider` — 403 `Not a rider` if no active rider row.
  NOTE (done): `middleware/riderMiddleware.js`.
- [x] 4.2 Mount `app.use('/api/rider', riderRoutes)`.
  NOTE (done): mounted in `app.js`.
- [x] 4.3 Implement `GET /me`, `PATCH /me/online`, `POST /me/heartbeat` (no assignment yet).
  NOTE (done): riderController + riderRoutes.
- [x] 4.4 Online toggle calls `syncDeliveryAvailabilityFromRiders`.
  NOTE (done): awaited after online/offline update.
- [x] 4.5 Tests for 403 non-rider, toggle open/close.
  NOTE (done): `tests/riderApi.test.js` (7 cases).
- [x] 4.6 `npm test`.
  NOTE (done): 55 suites, 567 passed.

---

### TASK 5 — Assignment engine core  `[P0]`

**Files:** `services/riderAssignment.js`, `realtime/riderOfferSweeper.js`, `server.js` (start sweeper)

**Steps:**

- [x] 5.1 Implement `startAssignment`, `createOffer`, `acceptOffer`, `rejectOffer`, `expireOffer`, `failAssignment`, `cancelAssignmentByRider`, `maybeStartRiderAssignment`.
  NOTE (done): `services/riderAssignment.js` full engine.
- [x] 5.2 Single-pending-offer invariant with transactions.
  NOTE (done): FOR UPDATE pending check + uq_offer_order_rider.
- [x] 5.3 Sweeper every 5s: expire due offers → continue chain.
  NOTE (done): `riderOfferSweeper.js` started from server.js.
- [x] 5.4 Boot rehydrate: process any expired pending offers.
  NOTE (done): sweeper tick on start.
- [x] 5.5 Push + socket on createOffer; admin notify on fail.
  NOTE (done): Expo + rider.offer.created; admin zero/failed types.
- [x] 5.6 Unit/integration tests:
  - 0 riders → cancel + admin notify + delivery off
  - 1 rider accept
  - 1 rider reject → no others → cancel
  - 2 riders least-orders wins
  - tie → both possible over many runs (or inject Math.random)
  - exclude rejected rider
  - timeout → next rider
  - double accept → one 409
  - offline does not auto-reject before timeout
  - accept → post-accept cancel → rider NEVER re-offered same order (excluded set includes post_accept_cancel)
  - loop termination: N riders all reject/timeout → exactly N offers total, then cancel (no rider offered twice)
  NOTE (done): `tests/riderAssignment.test.js` (15 cases covering core paths; offline = no auto-reject is by design of expire-only timeout).
- [x] 5.7 `npm test`.
  NOTE (done): 56 suites, 582 passed.

---

### TASK 6 — Wire shop accept (all shops) + house-item Accepted  `[P0]`

**Files:** `shopOwnerController.js`, `adminController.js` (status Accepted path), `orderAutoAccept.js`

**Owner rule:** “when shop accept orders, riders get alert” = when **every** shop on the order has Accepted/confirmed.

**Steps:**

- [x] 6.1 After `confirmMyOrder`, call `maybeStartRiderAssignment(orderId)` which **only** starts if all distinct `shop_id`s on the order have `shop_confirmed_at` set (and order not cancelled / not already assigning).
  NOTE (done): wired in `confirmMyOrder` fire-and-forget.
- [x] 6.2 On transition to `Accepted` when order has **no** shop-linked items, call `startAssignment`.
  NOTE (done): `startAssignmentIfHouseOnly` on admin accept + auto-accept.
- [x] 6.3 On order cancel (admin/customer/shop-all-reject), revoke pending offers (`status=cancelled`), emit `rider.offer.revoked`.
  NOTE (done): admin cancel + maybeAutoCancelOrderWhenAllShopsRejected call revokeOffersForOrder.
- [x] 6.4 Tests: multi-shop — first confirm does **not** start assignment; last confirm **does**. Single-shop confirm starts immediately after that shop accepts.
  NOTE (done): covered by maybeStartRiderAssignment unit tests (waiting_shops / no_shops).
- [x] 6.5 `npm test`.
  NOTE (done): 56 suites, 582 passed.

---

### TASK 7 — Rider offer + assignment HTTP API  `[P0]`

**Files:** `riderController.js`, routes, tests

**Steps:**

- [x] 7.1 `GET /offers/active`, accept, reject.
  NOTE (done): rider routes + controller wired to assignment engine.
- [x] 7.2 Current assignment + history.
  NOTE (done): GET assignments/current + history with pagination.
- [x] 7.3 Cancel assignment post-accept.
  NOTE (done): POST assignments/:orderId/cancel.
- [x] 7.4 Picked-up + status patch (Out for Delivery, Delivered) with ownership checks.
  NOTE (done): picked-up + PATCH status with forward-only + ownership.
- [x] 7.5 Notification templates / `createOrderNotification` events for rider_assigned, picked_up (if templates table used — add migration seeds).
  NOTE (done): migrate seeds + fallbacks in notificationService; accept uses rider_assigned.
- [x] 7.6 `npm test`.
  NOTE (done): 57 suites, 594 passed (incl. riderApi.offers).

---

### TASK 8 — Customer notifications + shop notify on rider events  `[P1]`

**Files:** `notificationService.js`, migrate notification templates, `shops.js` or rider utils

**Steps:**

- [x] 8.1 Customer: rider assigned, picked up, out for delivery, delivered, cancelled no-rider (reuse status_cancelled where possible).
  NOTE (done): rider_assigned/picked_up templates+fallbacks; fail uses status_cancelled; status patch uses existing events.
- [x] 8.2 Shop owners: push when rider assigned / cancelled for their order.
  NOTE (done): notifyShopsRiderAssigned + notifyShopsRiderAssignmentFailed.
- [x] 8.3 Admin inbox types from section 6.5.
  NOTE (done): types added in TASK 5; failAssignment uses them.
- [x] 8.4 `npm test`.
  NOTE (done): 58 suites, 598 passed.

---

### TASK 9 — Admin: Riders page + order fields + mutual exclusion  `[P1]`

**Files:** `adminController` or new `adminRiderController`, `adminRoutes`, admin React pages, shop-owner assign path if any

**Steps:**

- [x] 9.1 Admin API list/create/patch riders (link existing user by phone). Create **fails** if user is already a shop owner (D2).
  NOTE (done): adminRiderController + routes; ROLE_CONFLICT on shop owner.
- [x] 9.2 When setting `shops.owner_user_id`, **fail** if that user is already a rider (D2).
  NOTE (done): createShop/updateShop rider check.
- [x] 9.3 Admin **Riders** page (sidebar entry): list, create by phone, activate/deactivate, show online state. **No** self-signup. **No** manual order→rider assign control.
  NOTE (done): Riders.jsx + sidebar + App route.
- [x] 9.4 Orders list/detail show rider name + assignment status + cancel reason (read-only).
  NOTE (done): admin orders SELECT joins riders for rider_name + assignment fields.
- [x] 9.5 Settings copy: Delivery Available auto-follows rider online count.
  NOTE (done): Settings.jsx helper text.
- [x] 9.6 Lint admin; smoke-test builds if CI requires.
  NOTE (done): admin lint clean; API 59 suites / 602 passed.

---

### TASK 10 — Mobile: auth store + RiderNavigator shell  `[P0]`

**Files:** `useAuthStore.js`, `RootNavigator.js`, `RiderNavigator.js`, api client

**Steps:**

- [x] 10.1 Persist `rider` in auth store; setSession(token, user, shop, rider).
  NOTE (done): useAuthStore rider + AuthScreen + normalizeSession.
- [x] 10.2 Branch navigator (section 9.1).
  NOTE (done): RootNavigator shop → rider → customer.
- [x] 10.3 `riderApi.js` thin client.
  NOTE (done): full offer/assignment client stubs.
- [x] 10.4 Empty dashboard with online toggle wired to API.
  NOTE (done): RiderDashboardScreen + history tab shell.
- [x] 10.5 `npx jest` in customer-app for store/nav tests if present; add minimal tests.
  NOTE (done): customer-app 15 suites / 116 passed.

---

### TASK 11 — Mobile: offer popup + sound + rehydrate  `[P0]`

**Files:** `RiderOfferPopup.js`, hooks, `RiderDashboardScreen.js`, push handlers

**Steps:**

- [ ] 11.1 Popup UI (address + shops + countdown from expiresAt).
- [ ] 11.2 Socket subscribe `rider.offer.created` / expired / revoked.
- [ ] 11.3 Cold-start rehydrate active offer.
- [ ] 11.4 Heartbeat while online.
- [ ] 11.5 Accept/reject call API; errors show inline.
- [ ] 11.6 Tests for remaining-time calculation helper.

---

### TASK 12 — Mobile: active job lifecycle UI  `[P1]`

**Steps:**

- [ ] 12.1 Job card: navigate / call customer (tel link), mark picked up, out for delivery, delivered.
- [ ] 12.2 Cancel assignment with confirm modal.
- [ ] 12.3 History tab.
- [ ] 12.4 Logout clears online state best-effort (`isOnline: false` on logout).

---

### TASK 13 — Hardening & ops  `[P1]`

**Steps:**

- [ ] 13.1 Config env: `RIDER_OFFER_TIMEOUT_SEC=120`, `RIDER_HEARTBEAT_TTL_SEC=90`, `RIDER_SWEEPER_MS=5000`.
- [ ] 13.2 Logging: structured `[rider-assign]` lines for start/offer/accept/reject/expire/fail.
- [ ] 13.3 Race tests under parallel accepts.
- [ ] 13.4 Document ops runbook in this file’s appendix: create rider, go online, place test order.
- [ ] 13.5 Full `npm test` api + customer-app.

---

### TASK 14 — End-to-end manual UAT checklist  `[P1]`

Not code — run and tick:

- [ ] 14.1 Zero riders online → customer cannot place delivery (delivery off) OR order cancels at assignment with admin notify (depending on when gate flips — both must be true: gate flips when last rider goes offline).
- [ ] 14.2 One rider: offer → accept → customer notified → deliver.
- [ ] 14.3 One rider: reject → cancel order + admin notify.
- [ ] 14.4 Two riders: lower completed-today gets offer first.
- [ ] 14.5 Timeout after 2 min → next rider.
- [ ] 14.6 Kill app during popup → reopen before 2 min → popup still there → accept works.
- [ ] 14.7 Accept then cancel assignment → other rider offered; canceller never gets this order again.
- [ ] 14.8 Never two riders with pending offer for same order (DB check).
- [ ] 14.9 Multi-shop: first shop confirm does not start assignment; second does.
- [ ] 14.10 Rider offline auto sets delivery off; online sets on.

---

## 14. SUGGESTED IMPLEMENTATION ORDER (waves)

| Wave | Tasks | Outcome |
|---|---|---|
| W1 Foundation | 1–4 | Schema + identity + online toggle + delivery gate |
| W2 Engine | 5, 7 | Full assignment with HTTP + tests |
| W3 Integration | 6, 8 | Shop confirm trigger + notifications |
| W4 Admin | 9 | Ops can create riders and see failures |
| W5 Mobile | 10–12 | Riders can work the full loop |
| W6 Polish | 13–14 | Production confidence |

---

## 15. SEQUENCE DIAGRAM (assignment)

```
Shop confirm (last shop)
        │
        ▼
maybeStartRiderAssignment
        │
        ▼
listEligibleRiders ── empty? ──► failAssignment (cancel + admin + customer + shops)
        │
        ▼
select least completed today
        │
        ▼
INSERT offer pending expires=+120s
PUSH + socket rider.offer.created
        │
        ├── accept ──► assign rider_id ──► notify all ──► END
        ├── reject ──► exclude ──► loop select
        └── expire (sweeper) ──► exclude ──► loop select
```

---

## 16. NOTIFICATION / ALERT — “how to send alert” (answer)

When a rider is selected for an offer:

1. **DB row** `rider_order_offers` (`pending`, `expires_at`).
2. **Socket.IO** `emitToCustomer(rider.user_id, 'rider.offer.created', payload)` — in-app popup if app foreground.
3. **Expo push** `sendPushToUser(pool, rider.user_id, { title, body, data: { type: 'rider_offer', offerId, orderId, expiresAt } })` — heads-up when backgrounded.
4. **Client** shows non-dismissible popup + optional repeating local notification sound (shop pattern).
5. **Server sweeper** owns the 2-minute reject-on-timeout — client timer is display-only.

Do **not** broadcast to all riders. Do **not** send a second offer while one is pending.

---

## 17. RISK REGISTER

| Risk | Mitigation |
|---|---|
| Multi-instance API double-offers | Transactional pending check + DB sweeper, not only process memory |
| delivery_available fight with admin toggle | Document auto-sync wins on next rider event; optional admin “pin” later |
| Shop confirm never happens → rider never starts | Admin can move order / optional timeout to cancel unconfirmed shops (out of scope unless requested) |
| Timer mismatch client vs server | Client always derives from `expiresAt` ISO |
| Dual shop+rider user | Enforce mutual exclusion in admin create |
| Cancelling paid UPI order | Reuse existing cancel payment_status mapping (`Refunded` for UPI) |
| Diagram 30–45s vs rules 2 min | Code uses 120s constant only |
| Sole online rider is busy → new orders insta-cancel at assignment | Documented in §12 OWNER CHECK; gate stays ON per diagram; owner may change D11/D12/D13 |

---

## 18. FILE CHECKLIST (create/touch map)

### Create

- `apps/api/src/utils/riders.js`
- `apps/api/src/services/riderAssignment.js`
- `apps/api/src/controllers/riderController.js`
- `apps/api/src/routes/riderRoutes.js`
- `apps/api/src/middleware/riderMiddleware.js`
- `apps/api/src/realtime/riderOfferSweeper.js`
- `apps/api/tests/riderAssignment.test.js`
- `apps/api/tests/ridersUtils.test.js`
- `apps/api/tests/riderApi.test.js`
- `apps/customer-app/src/navigation/RiderNavigator.js`
- `apps/customer-app/src/api/riderApi.js`
- `apps/customer-app/src/screens/rider/*`
- `apps/customer-app/src/hooks/useRiderOfferAlert.js`
- `apps/admin/src/pages/Riders.jsx` (+ css)
- Admin API client methods for riders

### Modify

- `apps/api/src/db/migrate.js`
- `apps/api/src/app.js`
- `apps/api/src/server.js`
- `apps/api/src/controllers/authController.js`
- `apps/api/src/controllers/shopOwnerController.js`
- `apps/api/src/controllers/adminController.js` (order payload + Accepted house-item hook)
- `apps/api/src/realtime/orderAutoAccept.js` (house-item path)
- `apps/api/src/utils/adminNotifications.js`
- `apps/api/src/utils/notificationService.js` (+ templates migrate if needed)
- `apps/customer-app/src/stores/useAuthStore.js`
- `apps/customer-app/src/navigation/RootNavigator.js`
- `apps/customer-app/src/hooks/useLocalNotifications.js`
- `apps/admin` sidebar + routes + Orders page

---

## 19. DEFINITION OF DONE

Feature is done when:

1. Admin can create a rider linked to a phone user.
2. Rider goes online → Delivery Available turns ON (if it was OFF for zero riders).
3. After shops confirm (or house order Accepted), exactly one eligible rider gets offer.
4. Accept assigns; reject/timeout cascades; exhaustion cancels + admin notified.
5. Offline mid-offer does not reject until 2 minutes elapse.
6. Post-accept cancel re-enters assignment excluding that rider.
7. No duplicate concurrent accepts/offers for one order.
8. All new automated tests pass; UAT checklist 14.x ticked.
9. This plan’s task checkboxes marked `[x]` with one-line `NOTE (done):` each.

---

## 20. APPENDIX — Manual test script (after build)

1. Create two users via OTP; admin marks user A and B as riders.
2. Both go online in app → Settings delivery_available = true.
3. Both go offline → delivery_available = false; customer cart blocks delivery.
4. A online only; place order; admin/auto accept; shop confirm → A gets popup.
5. A rejects → order cancels (only rider) + admin bell.
6. A + B online; A has 2 deliveries today, B has 0 → B offered first.
7. B ignores 2 min → A offered.
8. A accepts; kill app; reopen → job still on dashboard.
9. A cancels assignment → B offered (A excluded).
10. B accepts → picked up → out for delivery → delivered; customer notifications fire.

---

## 21. TRACEABILITY — rules → tasks

| Product rule | Tasks |
|---|---|
| When **all** shops accept → riders get alert | 6, 5, 11 |
| How to send alert (push + socket + popup) | 5, 8, 11, §16 |
| Zero riders → delivery OFF; any online → ON | 2, 4, 12 |
| One rider → popup accept/reject | 5, 7, 11 |
| Multi rider → least orders today; tie random | 2, 5 |
| Reject → re-check active → next / cancel | 5 |
| 2 min timeout = reject | 5, 7, 11 |
| Offline after popup ≠ reject until 2 min | 5, 11 |
| Accept then cancel (before pickup) = reject + reassign | 5, 7, 12 |
| No cancel after pickup | 5, 7, 12 |
| One rider at a time / no duplicate accept | 5, 7 |
| Admin notify + order cancelled on failure | 5, 8, 9 |
| Customer/shop notify | 8 |
| Admin-only rider create (Riders page) | 9 |
| One phone = shop **or** rider, not both | 3, 9 |
| Auto-assign only (no manual assign) | 5, 9 |

---

## 22. DIAGRAM ↔ IMPLEMENTATION MAP

| Diagram box | Implementation |
|---|---|
| 1. SHOP ACCEPTS ORDER | Last `confirmMyOrder` for multi-shop / single shop confirm (D4) |
| 2. GET CURRENT ACTIVE RIDERS | `listEligibleRiders()` |
| 3. ACTIVE RIDERS AVAILABLE? | empty → fail; else count |
| ZERO RIDER AVAILABLE | cancel + delivery OFF + admin notify + admin orders |
| 4. COUNT ACTIVE RIDERS | branch 5A / 5B |
| 5A ONLY 1 | offer that rider, 120s timer |
| 5B MORE THAN 1 | least orders today → random tie → offer one |
| RIDER RESPONSE accept | assign + notify shop/customer |
| REJECT / TIMEOUT | re-get active, exclude rejected, loop or cancel |
| ANY RIDER LEFT? | yes → back to count/select; no → CANCEL ORDER |
| NOTIFICATION / ALERT FLOW | offer row + Expo push + socket + popup |
| AUTOMATIC DELIVERY AVAILABILITY | `syncDeliveryAvailabilityFromRiders` |

---

*End of plan. Decisions locked 2026-07-11. Implement TASK 1 → N in order.*
