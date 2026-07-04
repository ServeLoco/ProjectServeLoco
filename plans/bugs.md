# ProjectServeLoco — Implementation Spec (bugs & security fixes)

Audit date: 2026-07-04 · Branch: `adminfixes` · Status: coupon fixes (C1–C6) DONE, remaining tasks below.
This file is written as an **instruction spec for an implementing AI**. Follow it literally.

---

## RULES FOR THE IMPLEMENTING AI — read before any task

1. **Do exactly what each task says. Nothing more.** Do not refactor, rename, reformat, or "improve" code outside the listed steps. Do not upgrade or add dependencies unless a task explicitly says to.
2. **Line numbers are approximate** (code has changed since the audit). Locate code by **file path + function name + the quoted snippet**, never by line number alone.
3. **Never change an API response shape** (field names, nesting) unless the task explicitly says to. Clients depend on both camelCase and snake_case duplicates — keep both where they exist. Adding a new field is allowed only where a task says so.
4. **After every backend task**: run `npm test` inside `apps/api`. All tests must pass before moving on. If a task breaks an existing test, fix the test **only if** the task changed that behavior intentionally; otherwise fix your code.
5. **Mark the task's checkboxes `[x]`** in this file when done, and append a one-line note of what you did (like the C1–C6 entries show).
6. **Do not touch** anything in the "DO NOT ATTEMPT (owner/manual)" section or the "Verified OK" section.
7. The coupon rule engine `apps/api/src/utils/coupons.js` was just fixed and tested (C1–C6). **Do not modify it at all** — no open task requires changes to it.
8. Work on the current branch (`adminfixes`). One commit per task, message format: `fix: TASK <n> — <short title>`.
9. If a step is impossible as written (file moved, function renamed), **stop that task**, leave its checkbox unticked, and add a note `BLOCKED: <reason>` under it. Do not invent an alternative.
10. Execute tasks **in order** (TASK 5 → TASK 20). Do not skip ahead; later tasks assume earlier ones are done (e.g. TASK 15 assumes the app pings `/ping` from TASK 7).

---

## ALREADY COMPLETED — do not redo, do not revert

- **C1** Admin-cancel now soft-cancels the coupon redemption in a transaction (test in `remaining.test.js`).
- **C2** `free_delivery` discounts only the **standard** fee; fast premium survives (`standardDeliveryCharge` threaded through engine + both controllers; tests in `coupons.test.js`).
- **C3** Auto-applied coupon that lapses at checkout is dropped (order proceeds, `couponDropped: true`, banner on OrderConfirmationScreen); typed/tapped codes still hard-error. Client sends `coupon_auto_applied`.
- **C4** `coupon_redemptions.status ENUM('active','cancelled')`; only `active` counts toward limits; cancels soft-cancel.
- **C5** Server validates percent ∈ [0,100], flat capped at ₹5000; admin form warns > ₹1000.
- **C6** Invalid typed code now falls back to auto-apply; CartScreen shows the error plus the still-applied offer.
- **C7** (decision) Code-required coupons visible in the offers list is **intended** — never "fix" this.
- **C8** (verified) Coupon `FOR UPDATE` race protection in `createOrder` is correct — never remove it.

---

# OPEN TASKS — in execution order

## TASK 1 — Stop leaking internal error details to clients  `[P0]`

**Goal:** 5xx responses must never contain raw `err.message` or stack traces; `createOrder` must stop converting unexpected errors into 400s.

**Files:** `apps/api/src/middleware/errorHandler.js`, `apps/api/src/controllers/orderController.js`, `apps/api/src/config/env.js`

**Steps:**
- [x] 1.1 In `errorHandler.js`, inside `errorHandler`: after computing `statusCode`, add — if `statusCode >= 500`, set `message = 'Something went wrong. Please try again.'` and `code = 'SERVER_ERROR'`, and call `console.error('[server-error]', req.method, req.originalUrl, err)` so the real error still reaches the logs. Do not change the 4xx paths, the `ER_DUP_ENTRY` mapping, or the `ValidationError` mapping.
- [x] 1.2 In `errorHandler.js`, change the stack-trace block `if (process.env.DEBUG === 'true')` to `if (process.env.DEBUG === 'true' && process.env.NODE_ENV !== 'production')`.
- [x] 1.3 In `orderController.js`, add at the top of the file a small error class:
  ```js
  class OrderError extends Error {}  // expected business failures → 400
  ```
  Then convert every `throw new Error('...')` **inside `createOrder` only** to `throw new OrderError('...')` (shop closed, delivery unavailable, COD-at-night, unavailable product/combo, coupon messages, address required). Leave all other functions untouched.
- [x] 1.4 In `createOrder`'s `catch (error)` block: keep the rollback/release exactly as is, then — if `error instanceof OrderError`, respond `400 { code:'VALIDATION_ERROR', message: error.message }` (current behavior); otherwise `throw error` so it reaches the global handler (the route is wrapped in `asyncHandler`, so rethrow is safe).
- [x] 1.5 In `config/env.js`, at the bottom of the existing `if (isProd) { ... }` block, add: `if (process.env.DEBUG === 'true') throw new Error('DEBUG must not be enabled in production.');`

**Do NOT:** change any success-response shape; touch `notFoundHandler`; introduce a logging library.

**Done when:** a forced DB error during order creation returns 500 with the generic message (no SQL text), while "Shop is currently closed" still returns 400 with that message; `npm test` passes.

**NOTE (done):** errorHandler 5xx now returns generic message + logs `[server-error]`; stack trace gated on non-production; `OrderError` class added, all 6 `createOrder` throws converted, catch rethrows non-OrderError; env.js rejects DEBUG in prod. Tests pass.

---

## TASK 2 — Compare-and-set on order status/payment (server 409)  `[P0]`

**Goal:** Concurrent order updates (two admin tabs, admin vs customer-cancel, vs 10s auto-accept) must not clobber each other. The admin UI **already handles 409** (`Orders.jsx` — `err?.response?.status === 409`); the server just never sends one.

**Files:** `apps/api/src/controllers/adminController.js` (`updateOrderStatus`, `updateOrderPayment`), `apps/api/src/controllers/orderController.js` (`cancelOrder`)

**Steps:**
- [x] 2.1 In `adminController.updateOrderStatus`: change both UPDATE statements to include the expected prior status in the WHERE clause. The Cancelled branch becomes `UPDATE orders SET status = ?, payment_status = ?, cancel_reason = ? WHERE id = ? AND status = ?` (last param = `currentStatus`); the other branch likewise gets `AND status = ?`. After each UPDATE, check `result.affectedRows`. If `0`: re-SELECT the order and respond `409 { code:'CONCURRENCY_CONFLICT', message:'Order was updated by someone else.', order: <fresh row> }` and **do not** emit notifications/events.
- [x] 2.2 Same pattern in `updateOrderPayment`: `UPDATE orders SET payment_status = ? WHERE id = ? AND payment_status = ?` (expected = `currentPaymentStatus`), `affectedRows === 0` → 409 with the fresh order.
- [x] 2.3 In `orderController.cancelOrder`: change the UPDATE to `... WHERE id = ? AND status = 'Pending'`. If `affectedRows === 0`, re-SELECT: if the fresh status is `Cancelled`, return the existing "already cancelled" 200; otherwise return `400 { code:'VALIDATION_ERROR', message:'Only pending orders can be cancelled' }`. Keep the coupon-redemption soft-cancel exactly as C1/C4 implemented it, but only run it when the UPDATE actually succeeded.
- [x] 2.4 In `adminController.updateOrderStatus`, non-cancel branch: stop writing `cancel_reason`. The UPDATE for non-cancel transitions must set **only** `status` (currently it also writes `cancel_reason = ?` with null, wiping stored reasons).
- [x] 2.5 Add a test in `apps/api/tests/` : updating an order whose status was changed underneath returns 409 and does not overwrite.

**Do NOT:** change the forward-only progression rules, the notification event names, or the auto-accept logic (`orderAutoAccept.js` already uses a conditional UPDATE — leave it).

**Done when:** admin UI's existing 409 branch fires in a two-writer scenario; customer cancel can no longer overwrite an Accepted order; tests pass.

**NOTE (done):** All UPDATEs now carry `AND status = ?`/`AND payment_status = ?`; affectedRows===0 → 409 CONCURRENCY_CONFLICT with fresh row (no notifications). Non-cancel branch no longer writes cancel_reason. cancelOrder WHERE status='Pending' with re-SELECT fallback. 3 new tests added. All 328 tests pass.

---

## TASK 3 — Race-safe order numbers  `[P0]`

**Goal:** Two simultaneous checkouts must never generate the same `order_number` (currently `COUNT(*)+1` → duplicate-key 400).

**Files:** `apps/api/src/db/migrate.js`, `apps/api/src/controllers/orderController.js` (`generateOrderNumber`)

**Steps:**
- [x] 3.1 In `migrate.js`, alongside the other `CREATE TABLE IF NOT EXISTS` statements, add:
  ```sql
  CREATE TABLE IF NOT EXISTS daily_order_counters (
    counter_date DATE PRIMARY KEY,
    seq INT NOT NULL DEFAULT 0
  );
  ```
- [x] 3.2 Rewrite `generateOrderNumber(connection)` to keep the same prefix format `OD-YYYYMMDD-` (same Asia/Kolkata date logic, same `TEST` shortcut for jest), but obtain the sequence with:
  `INSERT INTO daily_order_counters (counter_date, seq) VALUES (?, LAST_INSERT_ID(1)) ON DUPLICATE KEY UPDATE seq = LAST_INSERT_ID(seq + 1)` with the IST `YYYY-MM-DD` date, then read `SELECT LAST_INSERT_ID() AS seq` on the **same connection**. Pad to 4 digits as before.
- [x] 3.3 Remove the old `SELECT COUNT(*) ... FOR UPDATE` query.
- [x] 3.4 Add a test asserting two sequential calls return consecutive, distinct numbers.

**Do NOT:** change the visible `OD-YYYYMMDD-NNNN` format; renumber existing orders.

**Done when:** order numbers are unique under parallel inserts; format unchanged; tests pass.

**NOTE (done):** `daily_order_counters` table added to migrate.js; `generateOrderNumber` rewritten with INSERT…ON DUPLICATE KEY UPDATE + SELECT LAST_INSERT_ID() (old COUNT FOR UPDATE removed); format unchanged. 2 tests added in `orderNumber.test.js` (consecutive distinct numbers + SQL pattern assertion). All 330 tests pass.

---

## TASK 4 — Harden admin authentication  `[P0]`

**Goal:** No plaintext-password comparison in production; admin tokens live 12h instead of 30 days; login route crash-safe.

**Files:** `apps/api/src/controllers/adminController.js` (`login`), `apps/api/src/routes/adminRoutes.js`, `apps/api/src/utils/auth.js`, `apps/api/src/config/env.js`

**Steps:**
- [x] 4.1 In `adminRoutes.js`, wrap the login handler: `router.post('/login', loginLimiter, validate(loginSchema), asyncHandler(login));` (it is currently the only unwrapped handler).
- [x] 4.2 In `adminController.login`, invert the preference: check `ownerPasswordHash` **first** with `await bcrypt.compare(password, ownerPasswordHash)`; only if no hash is set, fall back to the plaintext comparison, and replace `password === ownerPassword` with a constant-time check:
  ```js
  const crypto = require('crypto');
  const a = Buffer.from(String(password)); const b = Buffer.from(String(ownerPassword));
  isMatch = a.length === b.length && crypto.timingSafeEqual(a, b);
  ```
- [x] 4.3 In `config/env.js` production block, add: if `!config.ADMIN_PASSWORD_HASH` then `throw new Error('ADMIN_PASSWORD_HASH is required in production (plaintext ADMIN_PASSWORD is not allowed).')` — and remove/adjust the now-redundant plaintext-strength checks in that block accordingly.
- [x] 4.4 In `utils/auth.js` `signAdminToken`, use a dedicated expiry: `expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '12h'` (customer token expiry unchanged). Add `ADMIN_JWT_EXPIRES_IN: process.env.ADMIN_JWT_EXPIRES_IN || '12h'` to `config/env.js` for documentation, but read it via `process.env` in auth.js is fine.
- [x] 4.5 Update `apps/api/.env.production.example` to show `ADMIN_PASSWORD_HASH=` and `ADMIN_JWT_EXPIRES_IN=12h` placeholders.

**Do NOT:** change the customer token lifetime or `JWT_SECRET`; add a token-revocation store (out of scope); alter the login response shape.

**Done when:** production boot fails without `ADMIN_PASSWORD_HASH`; admin JWT `exp - iat` = 12h; tests (which run with `NODE_ENV=test`) still pass.

**NOTE (done):** login route wrapped with asyncHandler; login checks bcrypt hash first, falls back to crypto.timingSafeEqual for plaintext (dev/test only); env.js production block now requires ADMIN_PASSWORD_HASH (plaintext checks removed); signAdminToken uses `process.env.ADMIN_JWT_EXPIRES_IN || '12h'`; ADMIN_JWT_EXPIRES_IN added to config + .env.production.example. 3 config tests updated for intentional behavior change. All 330 tests pass.

---

## TASK 5 — Password-reset abuse mitigations  `[P0]`

**Goal:** `POST /api/auth/password-reset-requests` is public and lets anyone submit a chosen password for any phone number; an admin approving it hands over the account. Mitigate: cap pending requests per phone, record the requester's IP, and warn the admin before Approve. (Replacing this flow with OTP-verified reset is an owner decision — see DO NOT ATTEMPT.)

**Files:** `apps/api/src/db/migrate.js`, `apps/api/src/controllers/authController.js` (`requestPasswordReset`), `apps/api/src/controllers/adminController.js` (`getPasswordResetRequests`), `apps/admin/src/pages/Customers.jsx`

**Steps:**
- [x] 5.1 In `migrate.js`, next to the other `ensureColumn` calls, add: `await ensureColumn('password_reset_requests', 'requester_ip', 'requester_ip VARCHAR(45) DEFAULT NULL');`
- [x] 5.2 In `authController.requestPasswordReset`: before inserting, count existing rows with `SELECT COUNT(*) AS cnt FROM password_reset_requests WHERE phone = ? AND status = 'pending'` (check the actual column names in the table first — if the status column/value differs, use the real ones). If `cnt >= 1`, respond `429 { code:'TOO_MANY_REQUESTS', message:'A reset request for this number is already pending. Please wait for it to be reviewed.' }` and do not insert.
- [x] 5.3 In the same function, store the requester IP in the INSERT: use `req.ip` (Express `trust proxy` is already enabled) into the new `requester_ip` column.
- [x] 5.4 In `adminController.getPasswordResetRequests`, include `requester_ip` and the request's created-at timestamp in the SELECT so the admin UI receives them (additive fields only).
- [x] 5.5 In the admin Customers page (where reset requests are approved): display the requester IP and request time next to each pending request, and change the Approve action to require a confirm step (reuse the existing confirm-dialog pattern in the admin app if one exists; otherwise `window.confirm`) with this exact text: *"Approving sets a password chosen by whoever filed this request. Verify with the customer (call/WhatsApp) before approving. Continue?"*
- [x] 5.6 Add a test: second pending reset request for the same phone returns 429.

**Do NOT:** change the approve endpoint's behavior or response shape; touch the OTP/Firebase flow; add CAPTCHA or email.

**Done when:** a second pending request for the same phone is rejected with 429; the admin list shows IP + time; Approve asks for confirmation; tests pass.

**NOTE (done):** `requester_ip` column added via ensureColumn; requestPasswordReset counts pending per user_id (table uses user_id not phone) → 429 if ≥1; INSERT stores `req.ip`; getPasswordResetRequests + getAdminCustomerById SELECTs include requester_ip; Customers.jsx dropdown & drawer show IP+time; Approve confirm uses exact spec text. 1 new test + 1 updated test. All 331 tests pass.

---

## TASK 6 — Fix account-deletion purge (anonymize, don't delete)  `[P0]`

**Goal:** `purgeExpiredDeletions` in `apps/api/src/server.js` batch-deletes users, but `orders.customer_id` is `ON DELETE RESTRICT`, so any user who ever ordered makes the **whole batch** fail forever. Also `blocked = 0` in the WHERE means blocked users are never purged. Switch to per-user anonymization.

**Files:** `apps/api/src/server.js` (`purgeExpiredDeletions`)

**Steps:**
- [x] 6.1 Remove `AND blocked = 0` from the SELECT (blocked users' data must also be purgeable).
- [x] 6.2 Replace the two batched DELETEs with a per-user loop. For each user id, inside its own `try/catch` (one failure must not stop the rest):
  1. `DELETE FROM password_reset_requests WHERE user_id = ?`
  2. Check `SELECT COUNT(*) AS cnt FROM orders WHERE customer_id = ?`.
  3. If `cnt === 0`: `DELETE FROM users WHERE id = ?` (hard delete, as today).
  4. If `cnt > 0`: **anonymize** instead:
     ```sql
     UPDATE users SET
       name = 'Deleted User',
       phone = CONCAT('deleted-', id),
       password_hash = NULL,
       firebase_uid = NULL,
       whatsapp_number = NULL,
       address = NULL,
       short_address = NULL,
       push_token = NULL,
       blocked = 1,
       deletion_requested_at = NULL
     WHERE id = ?
     ```
     (`phone` is `UNIQUE NOT NULL`, so it must stay unique — `CONCAT('deleted-', id)` guarantees that. If any of these columns doesn't exist on the `users` table, skip that column only.)
- [x] 6.3 Keep the existing log line but report both counts, e.g. `hard-deleted X, anonymized Y user(s)`.
- [x] 6.4 Add a test: a user with `deletion_requested_at` 31 days ago **and one order** gets anonymized (name = 'Deleted User', phone starts with 'deleted-'), and their order row still exists.

**Do NOT:** touch the FK constraints in `migrate.js`; delete or modify `orders` rows; change the 30-day grace period or the 24h schedule.

**Done when:** the purge completes with a mix of ordered and order-less expired users; order history survives anonymization; tests pass.

**NOTE (done):** Removed `AND blocked = 0`; replaced the batched `DELETE ... IN (?)` with a per-user loop (delete reset requests → COUNT orders → hard-delete if 0, else anonymize via `UPDATE users SET name='Deleted User', phone=CONCAT('deleted-',id), password_hash/firebase_uid/whatsapp_number/address/short_address/push_token=NULL, blocked=1, deletion_requested_at=NULL`), each user in its own try/catch; log reports `hard-deleted X, anonymized Y user(s)`. Exported `purgeExpiredDeletions` and guarded the auto-start with `require.main === module` so the function is unit-testable (production boot via `node src/server.js` unchanged; nothing imported server.js before). 2 tests added in `purgeExpiredDeletions.test.js` (mix of ordered→anonymized + order-less→hard-deleted, order rows survive, SELECT no longer filters on blocked; no-op when empty). All 333 tests pass (332 + 1 skipped).

---

## TASK 7 — Rate limits, size caps, and a cheap liveness endpoint  `[P1]`

**Goal:** `POST /api/orders` has no rate limit and no cap on `items[]`; JSON body limit is 5 MB; the app pings `/health` (which runs real DB checks) every 30s. Add limits and a DB-free `/ping`.

**Files:** `apps/api/src/routes/orderRoutes.js`, `apps/api/src/controllers/orderController.js` (`createOrder`), `apps/api/src/controllers/cartController.js` (`calculateCart`), `apps/api/src/app.js`, `apps/customer-app/src/hooks/useNetworkStatus.js`

**Steps:**
- [ ] 7.1 In `orderRoutes.js`: create an `express-rate-limit` limiter (`express-rate-limit` is already a dependency — do not install anything) with `windowMs: 60_000, max: 5`, keyed per user: `keyGenerator: (req) => String(req.user?.id || req.ip)`, message `{ code:'TOO_MANY_REQUESTS', message:'Too many orders, please wait a minute.' }`. Apply it to `router.post('/', ...)` **after** `requireCustomer` so `req.user` exists.
- [ ] 7.2 In `orderController.createOrder` and `cartController.calculateCart`: at the top of item processing, if `items.length > 100`, fail with the task-1 pattern (`throw new OrderError('Too many items in one order (max 100).')` in createOrder; in calculateCart return the existing 400 validation-error shape used there).
- [ ] 7.3 In `app.js`: change `express.json({ limit: '5mb' })` → `'200kb'` and `express.urlencoded(... limit: '5mb')` → `'200kb'`. Image uploads use multipart (multer) and are unaffected — verify the bulk-import and image routes still work by running the tests.
- [ ] 7.4 In `app.js`, directly above the existing `/health` route, add: `app.get('/ping', (req, res) => res.status(200).json({ ok: true }));` — no DB, no auth, no logging changes.
- [ ] 7.5 In `apps/customer-app/src/hooks/useNetworkStatus.js`: change the default `healthPath = '/health'` to `'/ping'`.

**Do NOT:** add limiters to authenticated admin routes (they're behind auth already); change `/health`'s response body (TASK 15 handles its status code); install any new package.

**Done when:** 6th order in a minute from the same user gets 429; a 101-item order gets a 400; a >200kb JSON body is rejected; `GET /ping` returns `{ok:true}` with no DB queries; API tests pass.

---

## TASK 8 — Reject tokens for deleted users  `[P1]`

**Goal:** A JWT for a user whose row was deleted still passes `requireCustomer` (the blocked-check only acts when a row **exists**), and `createOrder` crashes with a `TypeError` on `userRows[0]`. Return 401 instead.

**Files:** `apps/api/src/middleware/authMiddleware.js` (`requireCustomer`), `apps/api/src/controllers/orderController.js` (`createOrder`)

**Steps:**
- [ ] 8.1 In `requireCustomer`, the existing query `SELECT blocked FROM users WHERE id = ?` — add a branch: if `rows.length === 0`, return `401 { code:'UNAUTHORIZED', message:'Session is no longer valid. Please log in again.' }`. Keep the blocked→403 branch as is.
- [ ] 8.2 In `createOrder`, right after the user row is selected: if there is no row (`!userRows[0]`), rollback/release the transaction using the same pattern as the other early exits, and return the same 401 body as 8.1. (Defense in depth — 8.1 should normally catch it first.)
- [ ] 8.3 Add a test: a valid-signature token whose user id doesn't exist gets 401 from a customer endpoint, not 500.

**Do NOT:** change how blocked users are handled (403 stays); touch admin auth; add per-request caching.

**Done when:** deleted-user token → clean 401 everywhere; tests pass.

---

## TASK 9 — Push-token hygiene  `[P1]`

**Goal:** Registering a push token doesn't detach it from other accounts, so on a shared device the previous user keeps getting the new user's order notifications.

**Files:** `apps/api/src/controllers/authController.js` (the push-token registration handler, around `UPDATE users SET push_token = ? WHERE id = ?`)

**Steps:**
- [ ] 9.1 In the push-token registration handler, **before** the existing UPDATE, run: `UPDATE users SET push_token = NULL WHERE push_token = ? AND id != ?` with `[token, userId]`.
- [ ] 9.2 Find the customer logout flow: check whether the app calls any logout endpoint. If a logout endpoint exists in `authRoutes.js`, make it set `push_token = NULL` for the user. If **no logout endpoint exists**, add `POST /api/auth/logout` (behind `requireCustomer`) that only nulls `push_token` and returns `200 { data: { ok: true } }`, and call it (fire-and-forget, errors swallowed) from the app's logout action in the auth store before clearing local state.
- [ ] 9.3 Add a test: user A registers token T, then user B registers the same T → A's `push_token` is NULL, B's is T.

**Do NOT:** change the push-sending code (`utils/expoPush.js` — TASK 14 covers it); alter login/register responses.

**Done when:** one token belongs to at most one user; logout clears it; tests pass.

---

## TASK 10 — Idempotency correctness (unique key, longer window, real replay data)  `[P1]`

**Goal:** Three related defects: (a) the idempotency lookup window is 5 minutes while the app keeps retrying longer → duplicate orders; (b) the `(customer_id, idempotency_key)` index is non-unique, so the SELECT-then-INSERT race can still double-insert; (c) the replay response hardcodes `subtotal: null, total: null, status: 'Pending'` — wrong data if the order advanced.

**Files:** `apps/api/src/db/migrate.js`, `apps/api/src/controllers/orderController.js` (`createOrder`), `apps/customer-app/src/api/httpClient.js`

**Steps:**
- [ ] 10.1 In `migrate.js`, where `ensureIndex('orders', 'idx_orders_idempotency', ...)` is called: replace with logic that (1) checks `information_schema.statistics` for `idx_orders_idempotency` on `orders`; if it exists and `NON_UNIQUE = 1`, `DROP INDEX` it; then (2) ensures a **unique** index `ALTER TABLE orders ADD UNIQUE INDEX idx_orders_idempotency (customer_id, idempotency_key)`. Wrap in try/catch consistent with the file's existing idempotent-migration style. (MySQL allows multiple NULLs in a unique index, so orders without a key are unaffected.)
- [ ] 10.2 In `createOrder`'s idempotency pre-check SELECT, change `INTERVAL 5 MINUTE` to `INTERVAL 24 HOUR`.
- [ ] 10.3 In `createOrder`, wrap the order INSERT so that an `ER_DUP_ENTRY` error whose message names `idx_orders_idempotency` is handled as a **replay**: rollback the transaction, re-SELECT the existing order by `(customer_id, idempotency_key)`, and return it using the same replay-response code path as the pre-check. Any other `ER_DUP_ENTRY` must keep its current behavior.
- [ ] 10.4 Fix the replay response (both the pre-check path and the new 10.3 path): instead of hardcoded `subtotal: null, total: null, status: 'Pending'`, SELECT the real row's `subtotal`, `total`, `status`, `payment_status` (and keep every field the replay already returns). Keep the overall response shape identical — only replace placeholder values with real ones.
- [ ] 10.5 In `apps/customer-app/src/api/httpClient.js`: restrict auto-retry to safe requests. In the retry decision, only retry when `method` is `GET`/`HEAD` **or** the request headers include an `Idempotency-Key`. POSTs without an idempotency key must fail immediately to the caller.
- [ ] 10.6 Update/extend `apps/api/tests/orderIdempotency.test.js`: same key replayed after the order was Accepted returns the real status and totals; two racing submissions with the same key produce exactly one order row.

**Do NOT:** change the Idempotency-Key header name or how the app generates/stores the key; touch the `RETRYABLE_STATUSES` set; return a different top-level response shape.

**Done when:** duplicate-key race yields one order + one replay response with correct totals/status; non-idempotent POSTs never auto-retry; tests pass.

---

## TASK 11 — Paginate the customer order list  `[P1]`

**Goal:** `GET /api/orders` (`orderController.getOrders`) returns every order the customer ever placed. Add limit/offset pagination server-side and "load more" in the app.

**Files:** `apps/api/src/controllers/orderController.js` (`getOrders`), `apps/customer-app/src/screens/customer/OrdersScreen/OrdersScreen.js` (and its API wrapper if one exists in `apps/customer-app/src/api/`)

**Steps:**
- [ ] 11.1 In `getOrders`: read `limit` and `offset` from `req.query`. Defaults: `limit = 20`; clamp `limit` to `[1, 50]` and `offset` to `>= 0` (`Number.parseInt`, fall back to defaults on NaN). Append `LIMIT ? OFFSET ?` to the existing query (keep the same SELECT columns and ordering). Also run `SELECT COUNT(*) AS total FROM orders WHERE customer_id = ?`.
- [ ] 11.2 Keep the response's `data` array exactly as is; **add** a sibling field: `meta: { total, limit, offset, hasMore: offset + rows.length < total }`. Adding `meta` is an approved shape addition.
- [ ] 11.3 In the customer app's Orders screen: keep the initial fetch as page 1 (`offset=0`). Add an on-end-reached / "Load more" that fetches the next offset and **appends** to the list while `meta.hasMore` is true. Pull-to-refresh resets to `offset=0` and replaces the list. If the screen consumes orders through a store/hook, put the pagination state there rather than in the component.
- [ ] 11.4 Add an API test: 25 seeded orders → first page returns 20 with `hasMore: true`, second page returns 5 with `hasMore: false`.

**Do NOT:** paginate `getOrderById`; change the admin order list (it has its own pagination); rename `data`.

**Done when:** a customer with many orders loads 20 at a time; existing app behavior (statuses, canCancel) unchanged; tests pass.

---

## TASK 12 — Bulk-import hardening (zip-slip, zip-bomb, CSV cap)  `[P1]`

**Goal:** `bulkImportController.js` extracts a ZIP of images with `adm-zip`. Ensure entry names can't traverse paths, and cap sizes/counts so a crafted upload can't exhaust memory.

**Files:** `apps/api/src/controllers/bulkImportController.js`

**Steps:**
- [ ] 12.1 Where the ZIP entries are read into the entry map: key entries by `path.basename(entry.entryName)` only, and **skip** (do not import) any entry whose `entryName` contains `..` or starts with `/` — add such entries to the existing `skippedRows`-style reporting if a natural place exists, otherwise just skip silently.
- [ ] 12.2 Before processing entries, enforce: at most **500** entries, and a total **uncompressed** size cap of **50 MB** (sum of `entry.header.size` across entries). On violation, return the controller's existing 400 error shape with message `'ZIP file too large or contains too many files.'` — do not process anything.
- [ ] 12.3 Cap parsed CSV rows at **1000**: if more, return the existing 400 error shape with message `'CSV has too many rows (max 1000).'`
- [ ] 12.4 Note: `entry.getData()` is only called per matched image today (cached in `_cachedData`) — keep that lazy pattern; do not eagerly extract everything.
- [ ] 12.5 Add a test if the controller has one (`apps/api/tests/`); if no bulk-import test file exists, create a minimal one covering 12.2's count cap using an in-memory zip built with `adm-zip` (already a dependency).

**Do NOT:** change the CSV column format, the success/skip reporting shape, or the image validation pipeline (magic-byte sniffing already exists downstream).

**Done when:** traversal names are ignored, oversized/over-count zips and >1000-row CSVs get clean 400s; normal imports unchanged; tests pass.

---

## TASK 13 — Admin client timeout + service-worker updates  `[P2]`

**Goal:** The admin fetch wrapper has no timeout (a hung request spins forever), and the PWA service worker may pin users to an old bundle after deploys.

**Files:** `apps/admin/src/api/client.js`, `apps/admin/vite.config.js`

**Steps:**
- [ ] 13.1 In `apiClient` in `client.js`: add an `AbortController` with a 15-second timer (`setTimeout(() => controller.abort(), 15000)`), pass `signal: controller.signal` into the `fetch` config, and clear the timer in a `finally`. If the caller already passed a `signal` in options, prefer the caller's signal and skip the internal timeout. On abort, throw an error with `message: 'Request timed out'` so existing catch-blocks display something sensible.
- [ ] 13.2 In `vite.config.js`'s `VitePWA({ ... })` options: check the current config. If `registerType` is not set to `'autoUpdate'`, set `registerType: 'autoUpdate'` and inside `workbox` add `skipWaiting: true, clientsClaim: true`. If those are already present, tick this box with a note "already configured".
- [ ] 13.3 Verify (read the code, no change unless broken) that the `admin:unauthorized` event listener that redirects to `/login` is registered at a layout level that exists on every page (e.g. `AdminLayout` or `App.jsx`), not inside a single page. If it's page-local, move it to `App.jsx`. Note what you found.

**Do NOT:** add axios or any HTTP library; change API error-body parsing; touch the manifest icons/name.

**Done when:** a stalled request fails after ~15s with "Request timed out"; a new deploy takes over on next load without a manual cache clear; `npm run build` in `apps/admin` succeeds.

---

## TASK 14 — Notification reliability  `[P2]`

**Goal:** Fire-and-forget notification chains can produce unhandled rejections; dead Expo push tokens are never pruned; broadcast-to-phones silently drops unknown numbers.

**Files:** `apps/api/src/controllers/adminController.js`, `apps/api/src/controllers/orderController.js`, `apps/api/src/utils/expoPush.js`, `apps/api/src/controllers/notificationController.js` (broadcast)

**Steps:**
- [ ] 14.1 Search `adminController.js` and `orderController.js` for notification/push calls that are invoked **without** `await` and without `.catch` (fire-and-forget promises, e.g. after order status changes). Append `.catch((err) => console.error('[notify]', err.message))` to each. Do not make them awaited.
- [ ] 14.2 In `utils/expoPush.js`: `expo.sendPushNotificationsAsync` returns **tickets**. After sending (in both `sendPushToUser` and `sendPushToMany`), inspect tickets: for any ticket with `status === 'error'` and `details?.error === 'DeviceNotRegistered'`, null out that recipient's token: `UPDATE users SET push_token = NULL WHERE push_token = ?`. To map tickets back to tokens, tickets are returned in the same order as the messages array — use the index. Wrap this cleanup in try/catch so it can never fail the send.
- [ ] 14.3 In the broadcast handler (in `notificationController.js` — locate the code path where a "phones" target list is resolved to users): collect phone numbers that matched no user and include them in the success response as an additive field `unmatchedPhones: [...]`. Display them in the admin Notifications page as a small warning ("N numbers not found: ...") if the response contains a non-empty array.
- [ ] 14.4 Run the API tests.

**Do NOT:** implement the full Expo **receipts** API (ticket-level `DeviceNotRegistered` is sufficient here); change notification payload contents or event names; make notification failures fail the parent request.

**Done when:** no unhandled-rejection warnings from notification paths; a `DeviceNotRegistered` ticket clears the stale token; admin sees unmatched broadcast phones; tests pass.

---

## TASK 15 — Settings cache staleness + honest health status  `[P2]`

**Goal:** The 60s settings cache means "shop closed" takes up to a minute to reach customers while checkout already rejects; `/health` returns HTTP 200 even when a DB is down.

**Files:** `apps/api/src/controllers/settingsController.js`, `apps/api/src/app.js` (`/health`), `apps/admin/src/pages/Health.jsx` (only if needed per 15.3)

**Steps:**
- [ ] 15.1 In `settingsController.js`: find where admin settings **updates** are saved. If the cache (`settingsCache`) is already invalidated/cleared on update, tick this box with a note. If not, clear it there. Then reduce the TTL from `60_000` to `15_000`.
- [ ] 15.2 In `app.js` `/health`: change `res.status(200)` to `res.status(isHealthy ? 200 : 503)`. Keep the JSON body exactly the same.
- [ ] 15.3 Check `apps/admin/src/pages/Health.jsx` (admin health dashboard): if it treats a non-2xx response as "no data" rather than showing the degraded status, adjust it to still parse and render the 503 body. If it already handles it, tick with a note. (The customer app is unaffected — it pings `/ping` after TASK 7.)
- [ ] 15.4 Run API tests; if a test asserts `/health` returns 200 when a DB check fails, update that assertion to 503 (intentional behavior change).

**Do NOT:** change the `/health` body shape; add a realtime settings event (out of scope); touch the cache helper implementation.

**Done when:** closing the shop reflects publicly within ≤15s; `/health` returns 503 when unhealthy; admin health page still renders; tests pass.

---

## TASK 16 — Phone normalization + admin route validation sweep  `[P2]`

**Goal:** Password register/login accept `+91…`-style phones while the OTP flow normalizes to exactly 10 digits — the same person can end up with two accounts. Also several admin routes have no `validate()` schema.

**Files:** `apps/api/src/controllers/authController.js` (register/login), or the shared validator/normalizer if one exists, `apps/api/src/routes/adminRoutes.js`

**Steps:**
- [ ] 16.1 Find how the OTP/Firebase flow normalizes phones (search for the code that reduces a phone to 10 digits). Extract or reuse that exact normalization (strip non-digits, strip a leading `91` when 12 digits or `0` when 11, keep the last 10; reject if the result isn't 10 digits starting 6–9 — but **match whatever the OTP flow actually does**, do not invent a different rule).
- [ ] 16.2 Apply that normalization to the phone in password **register** and password **login** (and password-reset request) before any DB lookup/insert, so all flows address the same row.
- [ ] 16.3 Add a test: register with `+919876543210`, then the OTP-style lookup for `9876543210` finds the **same** user (or vice versa depending on seed helpers).
- [ ] 16.4 In `adminRoutes.js`, sweep the coupon/offer/dashboard-section routes (roughly the `router.post`/`router.patch` handlers registered without a `validate(...)` middleware): for each, add a minimal joi/schema (matching the existing `validate()` pattern used elsewhere in the file) that types the numeric/enum/boolean fields the controller reads. Do not add new constraints beyond type/enum/required — the goal is rejecting garbage types, not changing business rules.
- [ ] 16.5 Confirm (read-only) that the customer `cancelOrder` free-text `reason` is only ever rendered through normal React text nodes in the admin app (no `dangerouslySetInnerHTML`). Note the result under this task; change nothing unless you find `dangerouslySetInnerHTML` rendering it, in which case replace that usage with plain text rendering.

**Do NOT:** migrate/merge existing duplicate rows (data cleanup is manual); change phone column types; alter response shapes.

**Done when:** all auth flows resolve the same phone to the same account; previously-unvalidated admin routes reject wrong-typed bodies with 400; tests pass.

---

## TASK 17 — Checkout & connectivity resilience (customer app)  `[P2]`

**Goal:** Four small client-side gaps: release builds silently fall back to `localhost`; the offline banner blames the phone when only the server is down; missed socket events while backgrounded are never recovered; a server-side re-price silently charges a different total.

**Files:** `apps/customer-app/src/config.js` (or wherever `EXPO_PUBLIC_API_BASE_URL` is read), `apps/customer-app/src/hooks/useNetworkStatus.js`, the socket/realtime client in `apps/customer-app/src`, `apps/customer-app/src/screens/customer/CheckoutScreen/CheckoutScreen.js`

**Steps:**
- [ ] 17.1 In the config module where the API base URL falls back to `localhost`: when the build is **not** dev (`__DEV__ === false`) and `EXPO_PUBLIC_API_BASE_URL` is unset/empty, `throw new Error('EXPO_PUBLIC_API_BASE_URL must be set for release builds.')`. Dev keeps the localhost fallback.
- [ ] 17.2 In `useNetworkStatus.js`: distinguish device-offline (NetInfo says no connectivity) from server-unreachable (ping fails while NetInfo says online). Expose which case it is, and change the banner copy for the second case to "Can't reach the server. Retrying…" (keep the existing copy for true offline).
- [ ] 17.3 In the app's socket client: on the socket `reconnect` (or `connect` after a prior disconnect) event, trigger a refetch of the orders list and, if an order-detail screen is mounted, that order — use whatever refetch functions the store already exposes. Missed realtime events while backgrounded must not leave stale statuses.
- [ ] 17.4 In `CheckoutScreen.js`, where the server-verified bill comes back before placing the order: if `verifiedBill.total !== bill.total`, do **not** place the order silently. Show a confirm dialog: "The total has changed from ₹{old} to ₹{new} (prices or charges were updated). Place order at the new total?" — proceed only on confirm; on cancel, refresh the displayed bill to the new values and stay on Checkout. Note: coupon-drop changes are already handled by C3's `couponDropped` banner — this dialog is for price/fee changes.

**Do NOT:** change the Idempotency-Key lifecycle, the `beforeRemove` back-blocking, or the cart-clear timing; add new nav routes.

**Done when:** a release build without a base URL fails fast; server-down shows accurate copy; reconnect refreshes orders; a re-priced order requires explicit confirmation. Manually run the app (`npx expo start`) and sanity-check checkout still places an order.

---

## TASK 18 — Customer app failure UX  `[P3]`

**Goal:** Every first-load fetch should show a retryable error state, images must not skeleton forever, and version comparison must be numeric.

**Files:** `apps/customer-app/src/screens/customer/` (Home, Categories, ProductList, Orders, OrderDetail, Notifications screens), the shared `ErrorState`/`ProductImage` components, and the force-update check code

**Steps:**
- [ ] 18.1 Audit each listed screen's initial fetch: on failure with no cached data, it must render the shared error component (with a Retry button that re-runs the fetch) instead of a blank/empty view. The app already has an error-state component — find it and reuse it; create nothing new. Fix only the screens that lack it, and list which ones you changed.
- [ ] 18.2 In the `ProductImage` (or equivalent) component: on image load error, render the placeholder immediately (no persistent skeleton/spinner). If already correct, tick with a note.
- [ ] 18.3 Find the force-update version comparison. If it compares version strings lexicographically (`'1.10.0' < '1.9.0'` would be true), replace with numeric segment-wise comparison: split on `.`, compare each segment with `Number()`. If it's already numeric or uses a library, tick with a note.
- [ ] 18.4 Verify Android back behavior: back on OrderConfirmation goes to Orders (not Checkout), and back during checkout submit stays blocked. These were implemented earlier — verify only, and note the result.

**Do NOT:** redesign screens, add loading libraries, or touch navigation structure.

**Done when:** airplane-mode first load of each screen shows Retry; broken image URLs show placeholders; `1.10.0` is treated as newer than `1.9.0`.

---

## TASK 19 — Coupon admin UX polish  `[P3]`

**Goal:** Give the admin visibility into what a coupon actually does before saving, and how it surfaces to customers.

**Files:** `apps/admin/src/pages/Offers.jsx` (or wherever the coupon create/edit form and list live), `apps/api/src/controllers/couponController.js` (read-only reference — `enrichCoupon` already computes redemption counts)

**Steps:**
- [ ] 19.1 In the coupon form: as `discount_type` / `discount_value` / min-order fields change, render a live example line, e.g. "On a ₹500 order: customer pays ₹450 (₹50 off)". Percent uses the entered percent; flat subtracts the value (floor at 0); `free_delivery` says "standard delivery fee waived".
- [ ] 19.2 In the same form: when `requires_code` is false AND `auto_apply` is false, show an inline info note: "This coupon won't auto-apply and has no code — customers can only use it by tapping it in the offers list."
- [ ] 19.3 In the coupon list: display current redemptions vs limits (e.g. "12 / 100 used · per-user 1") using fields the API already returns via `enrichCoupon` — check the actual response field names in the network layer / controller before wiring, and use those. No API changes.
- [ ] 19.4 `npm run build` in `apps/admin` must succeed.

**Do NOT:** modify `couponController.js` or `coupons.js`; add form libraries; change any coupon validation rules (C5 already set them).

**Done when:** the form previews the effective price live, the odd config is flagged, and the list shows usage counts.

---

## TASK 20 — Repo & seed hygiene  `[P3]`

**Goal:** Make the demo seeder impossible to run against production and clean stray files.

**Files:** `apps/api/src/db/seed_demo.js`, repo root `.gitignore`

**Steps:**
- [ ] 20.1 At the very top of `seed_demo.js` (before any DB work), add:
  ```js
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    console.error('Refusing to run demo seed in production. Set ALLOW_DEMO_SEED=true to override.');
    process.exit(1);
  }
  ```
- [ ] 20.2 Check the repo root for a file named `.codeba` (or similar stray artifact). If present and untracked: delete it and add its name to `.gitignore`. If tracked in git, do not delete — add a note here and leave it for the owner.
- [ ] 20.3 Verify every `.env.production.example` under `apps/` contains only placeholders (no real-looking secrets/keys/URLs with credentials). Note the result; if you find a real secret, do **not** commit anything — stop and add `BLOCKED: real secret found in <file>` here.

**Do NOT:** touch the Morgan logging config (owner decision); delete anything inside `plans/`.

**Done when:** demo seed refuses to run in production; stray files handled; examples verified clean.

---

# DO NOT ATTEMPT (owner/manual) — leave these alone

1. **Firebase service-account keys** — `plans/villkro-firebase-adminsdk-fbsvc-40290aaa40.json` and `apps/api/firebase-service-account.json`. The owner will move/rotate them. Never read, move, delete, copy, or print these files.
2. **OTP-based password reset redesign** (replacing admin approval entirely) — owner decision, not scheduled.
3. **Token revocation store / admin token versioning** — explicitly out of scope (TASK 4 note).
4. **Moving the customer token to `expo-secure-store`** — deferred: adds a native dependency and a storage migration; owner will schedule it with a review.
5. **Nginx CSP headers** (`deploy/nginx-serveloco.conf`) — server config is deployed manually by the owner.
6. **Morgan logging of phone numbers in URLs** — owner decision pending.
7. **Manual device QA** (airplane-mode mid-checkout, slow-3G button states, kill-app-after-order, night-charge boundary minutes, multi-device sessions) — humans will test these; do not write device-automation for them.
8. **Data cleanup of duplicate `+91`/10-digit accounts** — manual, after TASK 16 ships.

---

# Verified OK (no action — recorded so they aren't "re-fixed")

- **Coupon redemption limits are race-safe** — `FOR UPDATE` on the coupon row serializes concurrent redemptions (C8). Keep it.
- **Coupon discounts never make a total negative** — flat/percent capped at subtotal, grand total clamped at ≥0.
- **SQL injection** — all queries parameterized; dynamic SQL only interpolates whitelisted enum values (report periods, status filters).
- **Image upload** — admin-only, memory storage, size limit, magic-byte sniffing, static serving restricted to image extensions.
- **CORS + JWT secret strength** — enforced at boot in production (`config/env.js`).
- **Auth rate limiting** — login/register/reset/firebase-verify (10/15min per IP) and admin login (5/15min).
- **Order ownership** — every customer order endpoint filters `WHERE customer_id = ?`.
- **Helmet + trust proxy** enabled; audit log redacts password fields.
- **Secrets** — `.env` files and both Firebase service-account keys are gitignored and absent from git history.
- **Auto-accept job** (`orderAutoAccept.js`) already uses a conditional UPDATE — race-safe, leave it.
