# ProjectServeLoco — Implementation Spec (multi-shop / shop-owner dashboard)

Spec date: 2026-07-09 · Branch: `main` · Status: all tasks OPEN.
This file is written as an **instruction spec for an implementing AI**. Follow it literally.

---

## BACKGROUND — read to understand, not to act on

VillKro currently has ONE virtual store run entirely by the admin. Reality: the admin sources food from 3–4 physical shops. The owner wants each shop to get its own lightweight dashboard **inside the existing customer app** so shop owners can:

1. Toggle their shop open/closed (closed shop ⇒ its products disappear from the customer app).
2. Toggle each of their own products available/unavailable.
3. See incoming orders (only their own line items, only after the admin/auto-accept moves the order to `Accepted`) and press one **Confirm** button per order. No accept/reject — confirm is informational for the admin, it does NOT gate the order status flow.

What exists today (verified against code on 2026-07-09 — do NOT re-investigate):

- **No `shops` table.** `settings.shop_open` is one global toggle for the whole platform — it is NOT per-shop and must not be touched or reused for this feature.
- **Two auth roles only**: `requireCustomer` and `requireAdmin` in `apps/api/src/middleware/authMiddleware.js`. Customer JWTs are minted by `signCustomerToken(user.id)` (`role: 'customer'`).
- **Customer login** = Firebase phone OTP → `POST /auth/firebase-verify` (`firebaseVerify` in `apps/api/src/controllers/authController.js`) → responds `{ message, token, user }`. Session restore = `GET /auth/me` (`me` in the same file).
- **`products`** has `available` + `deleted` flags but no shop linkage. Customer-facing reads filter `available = 1 AND deleted = 0` in several places (full list in TASK 4).
- **Orders**: single `orders` row + `order_items` snapshot rows (name/price copied at purchase; deliberately no FK to `products`). Status flow `Pending → Accepted → Preparing → Out for Delivery → Delivered` (or `Cancelled`), forward-only, compare-and-set with 409 on conflict.
- **Two paths move an order to `Accepted`**: manual admin (`updateOrderStatus` in `apps/api/src/controllers/adminController.js`) and the 120-second auto-accept timer (`schedule` in `apps/api/src/realtime/orderAutoAccept.js`). Any shop-owner fan-out must fire from BOTH.
- **Realtime/push infra to reuse**: `emitToCustomer(customerId, eventName, payload)` from `apps/api/src/realtime/socket.js`; `sendPushToMany(pool, userIds, opts)` from `apps/api/src/utils/expoPush.js` (returns `{ recipients, tokensFound, sent, failed }` — hardened in PUSH TASK 1-3).

### Decisions locked in by the owner (do not revisit)

1. **Login surface**: the existing customer Expo app. After OTP, if the phone belongs to a shop owner, the app shows shop-owner screens instead of the customer home. No new app, no new auth role — role resolved by DB lookup, JWT stays `role: 'customer'`.
2. **No order splitting**: an order stays ONE row even when its items span shops. Each `order_item` carries a `shop_id` snapshot. Shop owners see/confirm only their own items of the shared order. Checkout, coupons, delivery pricing, payment flow are untouched.
3. **Alerts**: Expo push via `sendPushToMany` + Socket.IO via `emitToCustomer`, same pattern as customer order-status notifications.

### Explicitly OUT OF SCOPE for v1

- Combos (`combos`, `combo_items`, `product_combo_items`) stay shop-less "house" items. No shop filtering, no shop confirm for combo line items (`item_type = 'combo'` rows keep `shop_id = NULL`).
- Per-shop delivery pricing / radius / payouts. `settings` stays global.
- Shop-owner self-signup, multiple owners per shop, one owner with multiple shops (schema uses a single `owner_user_id`; app assumes 0-or-1 shop per user).
- Gating order status transitions on shop confirmation. Admin advances status manually exactly as today.

---

## RULES FOR THE IMPLEMENTING AI — read before any task

1. **Do exactly what each task says. Nothing more.** No refactoring, renaming, reformatting, or "improving" code outside the listed steps. No new dependencies (`socket.io`, `expo-server-sdk`, `express-validator`, `express-rate-limit` are already installed — use them).
2. **Line numbers are approximate.** Locate code by file path + function name + quoted snippet, never by line number alone.
3. **Never change an API response shape** (rename/remove/re-nest existing fields). Adding new fields is allowed only where a task explicitly says so. Clients depend on camelCase/snake_case duplicates — when a task adds a field that clients read, add BOTH casings if the surrounding response already duplicates casings.
4. **After every backend task**: run `npm test` inside `apps/api`. All tests must pass before moving on. Test-file changes needed to keep the suite green are part of the same task. For admin/web/app tasks run the relevant `npm run lint` (admin/web) or `npm test` (customer-app).
5. **Mark the task's checkboxes `[x]`** in this file when done, and append a one-line `NOTE (done):` describing what you did.
6. One commit per task, on `main`, message format: `feat: SHOP TASK <n> — <short title>`.
7. If a step is impossible as written (file moved, function renamed, snippet not found), **stop that task**, leave its checkbox unticked, add `BLOCKED: <reason>` under it. Do not invent an alternative.
8. Execute tasks **in order** (TASK 1 → TASK 10). Later tasks assume earlier ones are done.
9. New SQL must follow the existing patterns in `apps/api/src/db/migrate.js`: `CREATE TABLE IF NOT EXISTS`, the `ensureColumn` helper for added columns, the `ensureIndex` helper for indexes. Migrations must be safe to re-run on an existing production DB.

**DO NOT TOUCH:**
- `apps/api/src/utils/coupons.js`, coupon `FOR UPDATE` locking, `coupon_redemptions` writes in `createOrder`/`updateOrderStatus`.
- The compare-and-set order status updates and their 409 `CONCURRENCY_CONFLICT` responses.
- The order status ENUM values and the forward-only progression rules in `updateOrderStatus`.
- `settings.shop_open` (global platform toggle) — completely separate from per-shop `shops.is_open`.
- `cleanupDeadTokens` and `sendPushToUser` in `expoPush.js`.
- The Idempotency-Key replay logic in `createOrder`.
- The auto-accept timer duration and its rehydrate/claim logic — TASK 8 only ADDS a fan-out call inside the existing success path.
- `products.available` semantics — the shop-owner product toggle REUSES this column; do not add a parallel "shop_available" column.

---

# OPEN TASKS — in execution order

## TASK 1 — Schema: `shops` table + shop columns on `products` / `order_items`  `[P1]`

**Goal:** All schema for the feature lands in one migration pass, idempotent, additive-only.

**Files:** `apps/api/src/db/migrate.js`

**Steps:**
- [x] 1.1 In `migrate.js`, AFTER the `console.log('Users table ready.');` line and BEFORE the `password_reset_requests` block, create the shops table:
  ```sql
  CREATE TABLE IF NOT EXISTS shops (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    owner_user_id INT NULL,
    is_open BOOLEAN DEFAULT TRUE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_shop_owner (owner_user_id)
  );
  ```
  Follow with `console.log('Shops table ready.');`. Semantics (add as a code comment): `is_open` = the owner's day-to-day toggle; `active` = admin-level kill switch; a shop is customer-visible only when BOTH are 1. `owner_user_id` points at a normal `users` row (shop owners log in through the same OTP flow as customers).
  NOTE (done): Added `shops` table with `idx_shop_owner` index + the documented comment, inserted between Users table ready and password_reset_requests block.
- [x] 1.2 In the products section (after the existing `variant_prompt` ensureColumn), add:
  ```js
  // Shop linkage. NULL = "house" product with no owning shop (always passes
  // the shop-open visibility filter). FK deliberately omitted so shop
  // deletion policy stays in application code; integrity enforced by admin UI.
  await ensureColumn('products', 'shop_id', 'shop_id INT NULL AFTER category_id');
  ```
  And with the other `ensureIndex` calls: `await ensureIndex('products', 'idx_products_shop', 'shop_id');`
  NOTE (done): `products.shop_id` ensureColumn + `idx_products_shop` index added.
- [x] 1.3 In the order_items section (after the existing `variant_label` ensureColumn), add:
  ```js
  // Shop snapshot at purchase time (same rationale as product_name/unit_price
  // snapshots: order history must not change when catalog rows change). No FK.
  await ensureColumn('order_items', 'shop_id', 'shop_id INT NULL AFTER variant_label');
  // Per-shop confirmation. NULL = pending; timestamp = when the shop owner
  // pressed Confirm. Informational for the admin; does NOT gate order status.
  await ensureColumn('order_items', 'shop_confirmed_at', 'shop_confirmed_at TIMESTAMP NULL DEFAULT NULL AFTER shop_id');
  ```
  And: `await ensureIndex('order_items', 'idx_order_items_shop', 'shop_id, order_id');`
  NOTE (done): `order_items.shop_id` + `order_items.shop_confirmed_at` ensureColumns + `idx_order_items_shop` index added.
- [x] 1.4 Run `npm test` in `apps/api`. Fix nothing else.
  NOTE (done): `npm test` → 44 suites, 481 passed, 1 skipped (identical to baseline). No other changes needed.

---

## TASK 2 — Auth: expose shop identity on login and session restore  `[P1]`

**Goal:** After OTP login (and on every session restore), the client learns whether this user owns a shop, via a new additive `shop` field. JWT payload unchanged.

**Files:** `apps/api/src/utils/shops.js` (new), `apps/api/src/controllers/authController.js`

**Steps:**
- [x] 2.1 Create `apps/api/src/utils/shops.js`:
  ```js
  const { pool } = require('../db/mysql');

  // Returns the ACTIVE shop owned by this user, or null. One shop per user
  // by design (v1); if data ever contains more, the lowest id wins.
  const getShopForUser = async (userId) => {
    if (!userId) return null;
    const [rows] = await pool.query(
      'SELECT id, name, is_open, active FROM shops WHERE owner_user_id = ? AND active = 1 ORDER BY id ASC LIMIT 1',
      [userId]
    );
    if (rows.length === 0) return null;
    const shop = rows[0];
    return { id: shop.id, name: shop.name, is_open: Boolean(shop.is_open), isOpen: Boolean(shop.is_open) };
  };

  module.exports = { getShopForUser };
  ```
- [x] 2.2 In `authController.js` `firebaseVerify`: locate the final response (`res.status(isNewUser ? 201 : 200).json({ message, token, user: {...} })`). Before it, `const shop = await getShopForUser(user.id);`. Add ONE new top-level field to the JSON: `shop` (the object from 2.1, or `null`). Do not alter `message`, `token`, or any `user` subfield.
- [x] 2.3 In `authController.js` `me`: the response object is built as `const response = { user };`. After that line add `response.shop = await getShopForUser(userId);`. Nothing else changes (the sliding token-refresh block stays exactly as is).
- [x] 2.4 Add `const { getShopForUser } = require('../utils/shops');` at the top of `authController.js`, next to the existing requires.
- [x] 2.5 Run `npm test` in `apps/api`. If an existing auth test asserts the exact response keys of `firebaseVerify`/`me`, extend the assertion to include `shop: null` — do not weaken other assertions.
  NOTE (done): Created `utils/shops.js` (getShopForUser), added require + `shop` field to both `me` and `verifyFirebaseToken` responses. No existing auth test asserts exact response keys of these endpoints (roleProtection only checks 403 status; pushTokenHygiene hits other endpoints), so no test changes needed. `npm test` → 44 suites, 481 passed, 1 skipped (matches baseline).

---

## TASK 3 — Snapshot `shop_id` onto order items at creation  `[P1]`

**Goal:** Every non-combo `order_items` row created from now on records which shop owned the product at purchase time.

**Files:** `apps/api/src/controllers/orderController.js`

**Steps:**
- [x] 3.1 In `createOrder`, find the product batch fetch:
  ```js
  'SELECT id, name, price FROM products WHERE id IN (?) AND available = 1 AND deleted = 0',
  ```
  Add `shop_id` to the SELECT list: `'SELECT id, name, price, shop_id FROM products WHERE id IN (?) AND available = 1 AND deleted = 0'`. Do NOT touch the combos fetch (combos have no shop).
- [x] 3.2 In the same function, find where line items are accumulated (`orderItems.push({ product_id: product.id, variant_id: effectiveVariantId, ... })`). Add one property: `shop_id: isCombo ? null : (product.shop_id || null),`.
- [x] 3.3 Find the bulk insert:
  ```js
  `INSERT INTO order_items (order_id, product_id, variant_id, variant_label, item_type, product_name, quantity, unit_price, line_total) VALUES ${placeholders}`
  ```
  Add `shop_id` to the column list (after `variant_label`), add one `?` to the per-row placeholder template (`'(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'`), and push `oi.shop_id || null` into `values` at the matching position.
- [x] 3.4 The Idempotency-Key replay SELECT (`'SELECT product_id, variant_id, variant_label, item_type, product_name, quantity, unit_price, line_total FROM order_items WHERE order_id = ?'`) does NOT need `shop_id` — replay responses are customer-facing. Leave it alone.
- [x] 3.5 Run `npm test` in `apps/api`. Order-creation tests that assert the INSERT arguments will need the extra column/value added to their expectations — that is part of this task.
  NOTE (done): Added `shop_id` to product SELECT, to `orderItems.push`, and to the INSERT (column after variant_label, +1 placeholder, `oi.shop_id || null` value). Replay SELECT left untouched. The one test asserting insert values (`cartOrder.test.js` ~L788) checks indices [2]/[3] (variant_id/variant_label) which are unchanged by the insert-at-index-4 layout shift — passes as-is. `npm test` → 44 suites, 481 passed, 1 skipped (matches baseline).

---

## TASK 4 — Customer-facing visibility: closed shop ⇒ products hidden  `[P1]`

**Goal:** A product whose `shop_id` points at a shop with `is_open = 0` OR `active = 0` behaves exactly like `available = 0` everywhere a CUSTOMER can see or buy it. Products with `shop_id IS NULL` are unaffected. Admin endpoints are NOT filtered (admin must always see everything).

**The filter fragment** (use verbatim, adjusting only the `p.` alias to match each query):
```sql
AND (p.shop_id IS NULL OR EXISTS (
  SELECT 1 FROM shops s WHERE s.id = p.shop_id AND s.is_open = 1 AND s.active = 1
))
```

**Files:** `apps/api/src/controllers/productController.js`, `apps/api/src/controllers/cartController.js`, `apps/api/src/controllers/orderController.js`, `apps/api/src/controllers/dashboardController.js`

**Steps — apply the fragment to each of these customer-facing reads (this list is the audit; do not filter anything not listed):**
- [ ] 4.1 `productController.js` `getProducts` — the main `productQuery` (`WHERE p.available = 1 AND p.deleted = 0 AND p.is_combo = 0`). The parallel `comboQuery` is NOT filtered (combos are shop-less).
- [ ] 4.2 `productController.js` `getProducts` — the offer-scoped query (`WHERE op.offer_id = ? AND op.active = 1 AND p.available = 1 AND p.deleted = 0 AND p.is_combo = 0`).
- [ ] 4.3 `productController.js` `getProductById` — the single-product lookup (`FROM products p LEFT JOIN categories c ... WHERE p.id = ? AND p.deleted = 0`). Here do NOT hard-404: mirror the existing time-window pattern (`product.in_time_window = ...`) by computing the shop-open state and, when closed, responding as if `available` were 0 — set `product.available = 0` in the response object after the row is fetched, when the owning shop is closed/inactive. (Detail pages deep-linked from history should render, but show the item as unavailable.)
- [ ] 4.4 `cartController.js` — the cart-preview product validation (`'SELECT id, name, price FROM products WHERE id IN (?) AND available = 1 AND deleted = 0'`). Add the fragment (alias-free: `AND (shop_id IS NULL OR EXISTS (SELECT 1 FROM shops s WHERE s.id = products.shop_id AND s.is_open = 1 AND s.active = 1))` — match the query's actual table reference). The combos SELECT next to it stays untouched.
- [ ] 4.5 `orderController.js` `createOrder` — the product batch fetch modified in TASK 3.1. Same fragment. Effect: a shop closing between cart and checkout makes the product "not found," which trips the existing unavailable-product `OrderError` — exactly the desired behavior, no new error path.
- [ ] 4.6 `dashboardController.js` — the two product-section queries containing `AND p.available = 1 AND p.deleted = 0 AND p.is_combo = 0` (there are two occurrences; both are customer-facing dashboard section item reads). The combo-child queries (`WHERE ci.combo_id ...`) stay untouched.
- [ ] 4.7 Search the API for any OTHER customer-facing `available = 1` product read this list missed (`grep -rn "available = 1" apps/api/src`). If one exists and is customer-facing, apply the fragment and note it; if it is admin-facing, leave it and note why in the task NOTE.
- [ ] 4.8 Run `npm test` in `apps/api`.

---

## TASK 5 — Admin API: shop CRUD  `[P1]`

**Goal:** Admin can list/create/update shops and assign an owner by phone number.

**Files:** `apps/api/src/controllers/shopAdminController.js` (new), `apps/api/src/routes/adminRoutes.js`

**Steps:**
- [ ] 5.1 Create `shopAdminController.js` with three handlers (follow the style of `adminController.js`: `pool.query`, `asyncHandler`-wrapped at the route, `{ code, message }` error bodies):
  - `listShops` — `GET`: every shop (including `active = 0`), each row joined with owner name/phone (`LEFT JOIN users u ON u.id = s.owner_user_id`) plus `(SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id AND p.deleted = 0) AS product_count`. Respond `{ shops: [...] }` where each shop has `id, name, is_open, isOpen, active, owner_user_id, ownerUserId, owner_name, ownerName, owner_phone, ownerPhone, product_count, productCount, created_at`.
  - `createShop` — `POST` body `{ name, owner_phone }` (`owner_phone` optional). Validate `name` non-empty (400 `VALIDATION_ERROR` otherwise). If `owner_phone` given: look up `users` by exact phone; 404 `OWNER_NOT_FOUND` with message `'No user with that phone. Ask the shop owner to log in to the app once (OTP signup creates the account), then assign them.'` if absent. Reject (409 `OWNER_TAKEN`) if that user already owns an active shop. Insert, respond 201 with the created shop in the `listShops` row shape.
  - `updateShop` — `PATCH /:id` body may contain `name`, `owner_phone` (same lookup/validation as create; `null` clears the owner), `active` (boolean), `is_open` (boolean — admin override of the owner toggle). Only provided fields update. 404 if shop id unknown. Respond `{ message: 'Shop updated', shop: <row shape> }`.
- [ ] 5.2 In `adminRoutes.js`, mount under the existing `requireAdmin` pattern used by neighboring routes:
  ```js
  router.get('/shops', asyncHandler(listShops));
  router.post('/shops', asyncHandler(createShop));
  router.patch('/shops/:id', asyncHandler(updateShop));
  ```
  (Match however that file actually applies `requireAdmin` — router-level `use` or per-route — and follow it.)
- [ ] 5.3 Add a test file `apps/api/tests/shopsAdmin.test.js` covering: create with unknown phone → 404 `OWNER_NOT_FOUND`; create valid → 201; second shop for same owner → 409; `PATCH active=false` → shop hidden from `getShopForUser`. Follow the mocking conventions of the existing tests in `apps/api/tests/`.
- [ ] 5.4 Run `npm test` in `apps/api`.

---

## TASK 6 — Admin: product ↔ shop assignment (API + UI)  `[P2]`

**Goal:** Admin can set `shop_id` when creating/editing a product, and see the shop name in the admin product list.

**Files:** `apps/api/src/controllers/productController.js`, admin panel `apps/admin/src/pages/Products.jsx` (plus its API helper module and any product-form component it delegates to — locate by following imports from `Products.jsx`).

**Steps:**
- [ ] 6.1 API `createProduct`: `shop_id` joins the destructured `req.validatedData` fields; validate when present (must match `SELECT id FROM shops WHERE id = ?`, else 400 `VALIDATION_ERROR` `'Unknown shop_id'`); add the column + value to the INSERT (nullable). Update the product validator schema (wherever `createProduct`'s `validatedData` is defined — follow the `validate(...)` chain from `productRoutes.js`) to pass `shop_id`/`shopId` through as an optional positive integer or null.
- [ ] 6.2 API `updateProduct`: same treatment — optional `shop_id` in validated data, validated against `shops`, included in the UPDATE when provided (explicit `null` clears it).
- [ ] 6.3 API `getAdminProducts` and `getAdminProductById`: include `p.shop_id` and a joined `s.name AS shop_name` (`LEFT JOIN shops s ON s.id = p.shop_id`) in their SELECTs. Additive fields only.
- [ ] 6.4 Admin UI: in the product create/edit form, add a "Shop" `<select>` — options from `GET /api/admin/shops` (label = shop name, value = id) plus a first option "No shop (house item)" with value empty ⇒ send `shop_id: null`. In the product list table, add a "Shop" column rendering `shop_name || '—'`.
- [ ] 6.5 Run `npm test` in `apps/api` and `npm run lint` in `apps/admin`.

---

## TASK 7 — Shop-owner API (`/api/shop/*`)  `[P1]`

**Goal:** Authenticated shop owners manage their shop through six endpoints. Everything derives the shop from the JWT user — a client can never pass a shopId.

**Files:** `apps/api/src/middleware/shopOwnerMiddleware.js` (new), `apps/api/src/controllers/shopOwnerController.js` (new), `apps/api/src/routes/shopRoutes.js` (new), API app wiring (`app.use('/api/shop', ...)` where the other routes are mounted).

**Steps:**
- [ ] 7.1 `shopOwnerMiddleware.js` — export `requireShopOwner`: runs AFTER `requireCustomer` (so `req.user.id` exists); queries `SELECT id, name, is_open, active FROM shops WHERE owner_user_id = ? AND active = 1 LIMIT 1`; 403 `{ code: 'FORBIDDEN', message: 'Not a shop owner' }` when absent; otherwise sets `req.shop = row` and calls `next()`. Fresh DB check per request — no caching (admin may revoke a shop at any time).
- [ ] 7.2 `shopOwnerController.js` handlers (all read `req.shop`, never a param/body shop id):
  - `getMyShop` — `GET /me` → `{ shop: { id, name, is_open, isOpen, active } }`.
  - `toggleMyShop` — `PATCH /me/toggle` body `{ is_open }` (accept `isOpen` too, boolean required else 400) → `UPDATE shops SET is_open = ? WHERE id = ?` → `{ message: 'Shop updated', shop: {...} }`.
  - `getMyProducts` — `GET /products` → non-deleted products of this shop: `SELECT id, name, price, unit, image_id, available FROM products WHERE shop_id = ? AND deleted = 0 ORDER BY name ASC` → `{ products: [...] }` with `available` as boolean.
  - `toggleMyProduct` — `PATCH /products/:id/toggle` body `{ available }` (or `isAvailable`; boolean required) → `UPDATE products SET available = ? WHERE id = ? AND shop_id = ? AND deleted = 0`; 404 when `affectedRows === 0` (wrong shop or unknown id — do not distinguish) → `{ message: 'Product updated' }`.
  - `getMyOrders` — `GET /orders` → orders having ≥1 line item of this shop and `status IN ('Accepted','Preparing')`:
    ```sql
    SELECT DISTINCT o.id, o.order_number, o.status, o.note, o.created_at
    FROM orders o JOIN order_items oi ON oi.order_id = o.id
    WHERE oi.shop_id = ? AND o.status IN ('Accepted','Preparing')
    ORDER BY o.created_at ASC
    ```
    then one batched query for those orders' items `WHERE shop_id = ?` (only this shop's items — a shop owner NEVER sees another shop's items, the customer's address, phone, or totals). Respond `{ orders: [ { id, orderNumber, order_number, status, note, createdAt, created_at, confirmed (bool: all my items have shop_confirmed_at), items: [ { id, productName, product_name, quantity, variantLabel, variant_label } ] } ] }`. Note the deliberate omission of prices/customer PII.
  - `confirmMyOrder` — `PATCH /orders/:orderId/confirm` → `UPDATE order_items SET shop_confirmed_at = NOW() WHERE order_id = ? AND shop_id = ? AND shop_confirmed_at IS NULL`; 404 if the order has none of this shop's items at all (check with a COUNT first); idempotent otherwise (0 newly-confirmed rows is still 200) → `{ message: 'Order confirmed' }`. After a successful confirm, emit to admins: `emitToAdmins('admin.order.shop_confirmed', { orderId: Number(orderId), shopId: req.shop.id, shopName: req.shop.name })` (import `emitToAdmins` from `../realtime/socket`).
- [ ] 7.3 `shopRoutes.js` — express router: `router.use(requireCustomer); router.use(requireShopOwner);` then the five routes above, each `asyncHandler`-wrapped. Mount in the app entry where the other `app.use('/api/...', ...)` lines live: `app.use('/api/shop', shopRoutes);`.
- [ ] 7.4 Test file `apps/api/tests/shopOwner.test.js`: non-owner customer → 403; owner toggling another shop's product → 404; `getMyOrders` excludes `Pending` and `Delivered` orders and excludes other shops' items; `confirmMyOrder` idempotency (second call 200, timestamps unchanged). Follow existing test conventions.
- [ ] 7.5 Run `npm test` in `apps/api`.

---

## TASK 8 — Fan-out to shop owners when an order becomes `Accepted`  `[P1]`

**Goal:** The moment an order reaches `Accepted` — by admin hand OR by the auto-accept timer — every shop with items in that order gets a socket event and a device push.

**Files:** `apps/api/src/utils/shops.js` (extend), `apps/api/src/controllers/adminController.js`, `apps/api/src/realtime/orderAutoAccept.js`

**Steps:**
- [ ] 8.1 In `utils/shops.js`, add and export:
  ```js
  // Fire-and-forget fan-out to the owners of every shop with items in this
  // order. Never throws (callers are inside order-status paths that must not
  // fail because a push failed).
  const notifyShopsForOrder = async (order) => {
    try {
      const [rows] = await pool.query(
        `SELECT DISTINCT s.id AS shop_id, s.name AS shop_name, s.owner_user_id
         FROM order_items oi JOIN shops s ON s.id = oi.shop_id
         WHERE oi.order_id = ? AND s.active = 1 AND s.owner_user_id IS NOT NULL`,
        [order.id]
      );
      if (rows.length === 0) return;
      const { emitToCustomer } = require('../realtime/socket');
      const expoPush = require('./expoPush');
      for (const row of rows) {
        emitToCustomer(row.owner_user_id, 'shop.order.assigned', {
          orderId: order.id, orderNumber: order.order_number, shopId: row.shop_id,
        });
      }
      expoPush.sendPushToMany(pool, rows.map(r => r.owner_user_id), {
        title: 'New order to prepare',
        body: `Order ${order.order_number} has items for your shop. Open the app to confirm.`,
        data: { type: 'shop_order', orderId: order.id },
      }).catch(() => {});
    } catch (e) {
      console.error('[shops] notifyShopsForOrder failed for order', order?.id, e.message);
    }
  };
  ```
  (Requires inline inside the function to avoid a circular import chain through `realtime/socket` at module load — keep them inline.)
- [ ] 8.2 In `adminController.js` `updateOrderStatus`: inside the existing `if (currentStatus !== status) { ... }` block, next to the `if (eventName) { notificationService.createOrderNotification(...) }` call, add:
  ```js
  if (status === 'Accepted') {
    notifyShopsForOrder(updatedOrder); // fire-and-forget; owners get socket + push
  }
  ```
  Import `notifyShopsForOrder` from `../utils/shops` at the top.
- [ ] 8.3 In `orderAutoAccept.js` `schedule` timer callback: inside the `if (order) { ... }` success block, after the existing `realtimeEvents.emitOrderAutoAccepted(order);` line, add `notifyShopsForOrder(order);` with the matching require at the top.
- [ ] 8.4 The customer app already registers push tokens on login (`users.push_token`) — shop owners are `users` rows, so no token work is needed. Note this; change nothing.
- [ ] 8.5 Run `npm test` in `apps/api`. If tests mock `../utils/shops`, add the new export to the mock.

---

## TASK 9 — Admin order view: per-shop confirmation state  `[P2]`

**Goal:** Admin opens an order and sees, per shop, whether the shop confirmed — "both shops confirmed or not" at a glance.

**Files:** `apps/api/src/controllers/adminController.js` (the admin order-detail handler that runs `SELECT * FROM order_items WHERE order_id = ?`), admin panel order-detail page (locate by following the admin route/component that renders a single order's items).

**Steps:**
- [ ] 9.1 API: the admin order-detail items query is `SELECT * FROM order_items WHERE order_id = ?` — `shop_id` and `shop_confirmed_at` now come along for free. Extend it to also join the shop name: `SELECT oi.*, s.name AS shop_name FROM order_items oi LEFT JOIN shops s ON s.id = oi.shop_id WHERE oi.order_id = ?`. Additionally compute and add ONE new top-level field to the detail response: `shopConfirmations` — array of `{ shopId, shop_id, shopName, shop_name, confirmed (bool: every item of that shop has shop_confirmed_at), confirmedAt, confirmed_at (max timestamp or null) }`, one entry per distinct non-null `shop_id` among the items. Orders with only house/combo items get `[]`. Existing fields untouched.
- [ ] 9.2 Admin UI: on the order detail view, when `shopConfirmations.length > 0`, render a badge row: per shop, name + "✓ Confirmed" (green) or "⏳ Waiting" (amber). Subscribe to the socket event `admin.order.shop_confirmed` (added in TASK 7.2) wherever the admin app already listens for `admin.order.updated`, and refetch/patch the open order's confirmations on receipt.
- [ ] 9.3 Run `npm test` in `apps/api` and `npm run lint` in `apps/admin`.

---

## TASK 10 — Customer app: shop-owner mode  `[P1]`

**Goal:** A shop owner logging in with the normal OTP flow lands on a three-screen shop dashboard instead of the customer home. Everyone else sees the app exactly as today.

**Files (customer app `apps/customer-app/src/`):** `stores/useAuthStore.js`, `utils/apiMappers.js` (`normalizeSession`), `api/` (new `shopApi.js`), `navigation/RootNavigator.js` + `navigation/` (new `ShopOwnerNavigator.js`), `screens/` (new `shop/` folder).

**Steps:**
- [ ] 10.1 `utils/apiMappers.js` — `normalizeSession` must pass the new `shop` field through (both `firebaseVerify` and `getMe` responses now carry it, per TASK 2). Missing/undefined ⇒ `null`.
- [ ] 10.2 `useAuthStore.js` — persist `shop` alongside `user`: set it in `setSession` (accept a third argument or read it off the normalized session — follow how `user` flows today), refresh it in the session-restore path (where `fresh.user` is applied, also apply `fresh.shop ?? null`), clear it on logout. Expose `shop` in the store state.
- [ ] 10.3 `api/shopApi.js` — thin client over the TASK 7 endpoints using the existing `apiClient` with `auth: 'customer'` (same pattern as `authApi.js`): `getMyShop`, `toggleShop(isOpen)`, `getMyProducts`, `toggleProduct(id, available)`, `getMyOrders`, `confirmOrder(orderId)`.
- [ ] 10.4 `navigation/ShopOwnerNavigator.js` — bottom tabs, three screens, styled with the app's existing theme components:
  - **ShopHomeScreen** — shop name + a single large open/closed switch (calls `toggleShop`; optimistic UI with rollback on error, same pattern the app uses elsewhere if one exists, otherwise disable-while-pending). Include the app's standard logout affordance so an owner can sign out.
  - **ShopOrdersScreen** — list from `getMyOrders`, each card: order number, this shop's items (name × qty, variant label when present), a **Confirm** button when `confirmed === false`, a "Confirmed ✓" state otherwise. Poll on focus AND subscribe to the socket event `shop.order.assigned` via the app's existing socket client (locate how the customer screens subscribe to `order.updated` and follow that pattern) to refetch + play the app's existing notification sound/haptic if one exists. Orders leave the list automatically when status moves past `Preparing` (server-side filter, TASK 7).
  - **ShopProductsScreen** — list from `getMyProducts`, each row: product name + availability switch calling `toggleProduct`.
- [ ] 10.5 `RootNavigator.js` — where `CustomerNavigator` is rendered, branch: `const shop = useAuthStore(s => s.shop);` → authenticated AND `shop` present ⇒ render `ShopOwnerNavigator`, else `CustomerNavigator` (unauthenticated flow unchanged — the login screens still run first). Keep the analytics `SCREEN_NAME_MAP` untouched; shop screens are not analytics-whitelisted (they'll be ignored, which is fine for v1).
- [ ] 10.6 Push tap-through: `useLocalNotifications` (or wherever notification taps navigate via `navigationRef`) — when the notification payload has `data.type === 'shop_order'`, navigate to the ShopOrders tab. Follow the existing tap-navigation pattern in that hook.
- [ ] 10.7 Run `npm test` in `apps/customer-app`.

---

## Post-implementation verification (manual, owner)

1. Admin: create shop "Burger Point", assign a phone that has logged into the app at least once. Create/edit two products, set their shop.
2. That phone logs in via OTP → shop dashboard appears (not customer home). Toggle shop OFF → within one refresh, both products vanish from a customer device's listing; a customer with one in the cart cannot check out with it. Toggle ON → products return.
3. Customer orders one Burger Point item + one house item. Admin accepts (or waits 120s for auto-accept) → shop owner's phone gets a push + the order appears on ShopOrders with ONLY the burger line.
4. Owner taps Confirm → admin order detail shows "Burger Point ✓ Confirmed" in realtime.
5. Admin moves the order to Out for Delivery → it disappears from the shop owner's list.
