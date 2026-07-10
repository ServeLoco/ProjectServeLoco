# ProjectServeLoco — Implementation Spec (shop-owner dashboard v2: 2-screen redesign)

Spec date: 2026-07-10 · Branch: `main` · Status: OPEN.
Instruction spec for an implementing AI. Follow literally.

---

## BACKGROUND

The v1 shop-owner feature (`plans/shop-owner-dashboard.md`) shipped a 3-tab dashboard (Home/Orders/Products). Owner tested it live and wants a full redesign: **2 screens only**.

**Decisions locked in with the owner (do not revisit):**
1. **Reject button** — notifies admin only (push + admin inbox notification), does NOT change `orders.status`. Order stays exactly where the admin put it. The rejecting shop's items get a `shop_rejected_at` marker so the popup stops re-showing them; admin decides what to do next (call customer, cancel, etc.) — matches the existing rule that shop actions are informational, never a status gate.
2. **Alert sound** — no new native dependency. Reuse `expo-notifications` (already compiled into the current build) to fire a repeating **local** notification with sound every ~8s while the popup is open, cancelled the instant the owner acts. Stays OTA-eligible.
3. **Product groups** — one group per product (nullable `group_id` on `products`, not many-to-many). Toggling a group flips `available` on every member product in one call.
4. **Popup** — Accept / Reject only, **not** dismissible by tapping outside or the back button. Owner must choose one.

**What "expected time" means** (verified in code, don't re-derive): `orders.delivery_type` is `'standard'` or `'fast'`. Admin sets the actual minutes in `settings.standard_delivery_minutes` (default 60) and `settings.fast_delivery_minutes` (default 30) — see `apps/api/src/controllers/settingsController.js`. The popup must show whichever one applies to that order, not a hardcoded "20 minutes."

**Existing v1 assets this spec builds on top of, not touching internals of:**
- `order_items.shop_id`, `order_items.shop_confirmed_at` (schema, TASK 1)
- `GET /api/shop/orders`, `PATCH /api/shop/orders/:orderId/confirm` (`apps/api/src/controllers/shopOwnerController.js`)
- `notifyShopsForOrder` / `notifyShopsOrderCancelled` fan-out (`apps/api/src/utils/shops.js`)
- `requireShopOwner` middleware, `shop.order.assigned` / `shop.order.cancelled` socket events
- Design tokens: `apps/customer-app/src/theme/{colors,spacing,typography,shadows,borders,motion}.js` — use these, don't invent new ones.

**Reference pattern already in production for a near-identical popup (admin web, new-order alert):** `apps/admin/src/components/GlobalOrderAlert.jsx` — queue of modals, one visible at a time, repeating sound, Accept/Cancel, countdown. Mirror its *structure* (queue, one-at-a-time, non-dismissible) in React Native; do not port its Web Audio API sound code (that's the part being replaced with local notifications per decision #2).

**Do NOT touch:** `updateOrderStatus`, order status ENUM/progression, coupon logic, `requireShopOwner`, the v1 `/api/shop/products/:id/toggle` and `/api/shop/me/toggle` endpoints (both stay, just get re-skinned into the new 2-screen layout).

---

## RULES

1. Do exactly what each task says. No refactors beyond what's listed.
2. Additive API responses only — extend existing shapes (both casings where the surrounding response already duplicates them), never rename/remove fields.
3. After every backend task: `npm test` in `apps/api`. Backend test-file updates needed to stay green are part of the task.
4. After the customer-app tasks: `npx jest` in `apps/customer-app`.
5. Commit format: `feat: SHOP V2 TASK <n> — <short title>`.
6. If blocked, stop that task, note `BLOCKED: <reason>`, don't improvise.

---

# TASKS

## TASK 1 — Schema: product groups + per-shop reject state

**Files:** `apps/api/src/db/migrate.js`

- [ ] 1.1 New table, placed near the `shops` table definition:
  ```sql
  CREATE TABLE IF NOT EXISTS product_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shop_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
    INDEX idx_product_group_shop (shop_id)
  );
  ```
  `active` here is the group-level on/off the owner toggles — when false, every member product should read as unavailable to customers (enforced in TASK 2, not by writing to `products.available` directly — see below).
- [ ] 1.2 `await ensureColumn('products', 'group_id', 'group_id INT NULL AFTER shop_id');` + `await ensureIndex('products', 'idx_products_group', 'group_id');`. No FK (consistent with the existing `products.shop_id` no-FK rationale already in this file — integrity enforced in application code).
- [ ] 1.3 `await ensureColumn('order_items', 'shop_rejected_at', 'shop_rejected_at TIMESTAMP NULL DEFAULT NULL AFTER shop_confirmed_at');` — mirrors `shop_confirmed_at`. A row can have one, the other, or neither, never both at once (enforced in the controller, not the schema).
- [ ] 1.4 `npm test` in `apps/api`.

## TASK 2 — Visibility: group-off hides products too

**Goal:** A product whose group is inactive must disappear from customer views exactly like a closed shop does (TASK 4 of v1).

**Files:** every file touched in v1 TASK 4 (`productController.js`, `cartController.js`, `orderController.js`, `dashboardController.js`).

- [ ] 2.1 Extend the exact visibility fragment added in v1 TASK 4 (currently `AND (p.shop_id IS NULL OR EXISTS (SELECT 1 FROM shops s WHERE s.id = p.shop_id AND s.is_open = 1 AND s.active = 1))`) to also require the group be active when set:
  ```sql
  AND (p.group_id IS NULL OR EXISTS (SELECT 1 FROM product_groups g WHERE g.id = p.group_id AND g.active = 1))
  ```
  Append with `AND` right after the existing shop clause, same locations, same alias adjustments per file as v1 TASK 4 already did. Do not touch the shop clause itself.
- [ ] 2.2 `npm test` in `apps/api`.

## TASK 3 — API: shop-owner order response gains expected-time + reject

**Files:** `apps/api/src/controllers/shopOwnerController.js`

- [ ] 3.1 `getMyOrders` currently selects `o.id, o.order_number, o.status, o.note, o.created_at`. Add `o.delivery_type`. Also fetch delivery-time settings once per call (not per row): `const [settingsRows] = await pool.query('SELECT standard_delivery_minutes, fast_delivery_minutes FROM settings LIMIT 1');`. For each order in the response, compute `expectedMinutes = o.delivery_type === 'fast' ? settings.fast_delivery_minutes : settings.standard_delivery_minutes` and add both `expectedMinutes`/`expected_minutes` to the returned object.
- [ ] 3.2 The items sub-select currently reads `id, order_id, product_name, quantity, variant_label, shop_confirmed_at`. Add `shop_rejected_at`.
- [ ] 3.3 Result mapping: add `rejected` (bool: every item of this shop for that order has `shop_rejected_at !== null`) alongside the existing `confirmed` bool. An order that's `rejected` should still be returned (so the owner's dashboard can show it in a "rejected, waiting on admin" state) — do NOT filter it out of the list.
- [ ] 3.4 New endpoint `PATCH /orders/:orderId/reject` in `shopOwnerController.js`, mirroring `confirmMyOrder`'s structure exactly (same COUNT-then-UPDATE-then-emit shape, same status guard added in the v1 audit fix — `o.status IN ('Accepted', 'Preparing')`), but:
  - Sets `shop_rejected_at = NOW()` instead of `shop_confirmed_at`, and only where `shop_rejected_at IS NULL` (idempotent, same pattern).
  - After the UPDATE, call a new `notifyAdminShopRejected` (see TASK 4) instead of just `emitToAdmins('admin.order.shop_confirmed', ...)` — rejection needs an actual admin notification (inbox row + push-worthy), not just a live socket nudge, since the admin needs to act.
  - Export `rejectMyOrder` alongside the existing exports.
- [ ] 3.5 In `apps/api/src/routes/shopRoutes.js`, add `router.patch('/orders/:orderId/reject', asyncHandler(rejectMyOrder));` next to the confirm route, and import `rejectMyOrder`.
- [ ] 3.6 `npm test` in `apps/api`; extend `apps/api/tests/shopOwner.test.js` with reject-path tests mirroring the existing confirm tests (idempotent, 404 for wrong shop, status guard).

## TASK 4 — API: notify admin on shop reject

**Files:** `apps/api/src/utils/adminNotifications.js`, `apps/api/src/controllers/shopOwnerController.js`

- [ ] 4.1 In `adminNotifications.js`, add `SHOP_REJECTED: 'shop_rejected'` to the `TYPES` object (purely documentary — `type` is a free-text column, not an enum, per the schema).
- [ ] 4.2 In `shopOwnerController.js`, the reject handler (TASK 3.4) calls:
  ```js
  const adminInbox = require('../utils/adminNotifications');
  await adminInbox.createAdminNotification({
    type: adminInbox.TYPES.SHOP_REJECTED,
    title: `${req.shop.name} can't fulfill order #${orderId}`,
    body: `${req.shop.name} rejected their items on order #${orderId}. Review and take action (cancel, reassign, contact customer).`,
    relatedUrl: `/orders?id=${orderId}`,
    relatedId: String(orderId),
  });
  ```
  Confirm `createAdminNotification` is exported from `adminNotifications.js` (it is, per `module.exports`) — this already handles the socket emit (`admin.notification.created`) and unread-count broadcast, so no separate `emitToAdmins` call is needed for this path (unlike the confirm handler, which only has a lightweight live-socket nudge with no persistent inbox row — reject is a bigger deal and needs to survive a page refresh).
- [ ] 4.3 `npm test` in `apps/api`.

## TASK 5 — API: product groups CRUD (`/api/shop/groups`)

**Files:** `apps/api/src/controllers/shopOwnerController.js`, `apps/api/src/routes/shopRoutes.js`

- [ ] 5.1 Add to `shopOwnerController.js`:
  - `getMyGroups` — `GET /groups` → `SELECT id, name, active FROM product_groups WHERE shop_id = ? ORDER BY name ASC`, plus a per-group product count (`(SELECT COUNT(*) FROM products WHERE group_id = pg.id AND deleted = 0)`). Response `{ groups: [{ id, name, active, isActive, productCount, product_count }] }`.
  - `createMyGroup` — `POST /groups` body `{ name }`, 400 if blank, `INSERT INTO product_groups (shop_id, name) VALUES (?, ?)` scoped to `req.shop.id`, 201 with the created row.
  - `updateMyGroup` — `PATCH /groups/:id` body may contain `name` and/or `active`. Scoped `WHERE id = ? AND shop_id = ?` — 404 if it doesn't belong to this shop (never trust the id alone). 200 with updated row.
  - `deleteMyGroup` — `DELETE /groups/:id` scoped the same way. Before deleting, `UPDATE products SET group_id = NULL WHERE group_id = ?` so member products become ungrouped (not deleted) — then delete the group row. 200 `{ message: 'Group deleted' }`.
  - `assignMyProductGroup` — `PATCH /products/:id/group` body `{ group_id }` (null clears it). Validate the group belongs to this shop when non-null (same `WHERE id = ? AND shop_id = ?` check). `UPDATE products SET group_id = ? WHERE id = ? AND shop_id = ? AND deleted = 0` — 404 on no match.
- [ ] 5.2 `getMyProducts` (existing endpoint): add `group_id`, `group_name` to the SELECT (`LEFT JOIN product_groups pg ON pg.id = p.group_id`) so the Products screen can show group membership without a second round trip.
- [ ] 5.3 Route wiring in `shopRoutes.js`:
  ```js
  router.get('/groups', asyncHandler(getMyGroups));
  router.post('/groups', asyncHandler(createMyGroup));
  router.patch('/groups/:id', asyncHandler(updateMyGroup));
  router.delete('/groups/:id', asyncHandler(deleteMyGroup));
  router.patch('/products/:id/group', asyncHandler(assignMyProductGroup));
  ```
- [ ] 5.4 `npm test` in `apps/api`; add `apps/api/tests/shopGroups.test.js` covering create/update/delete/assign, cross-shop 404s (a group id from shop A rejected when called by shop B's owner).

## TASK 6 — Customer app: `shopApi.js` extended

**Files:** `apps/customer-app/src/api/shopApi.js`

- [ ] 6.1 Add: `rejectOrder(orderId)` (PATCH `/shop/orders/:id/reject`), `getMyGroups()`, `createGroup(name)`, `updateGroup(id, data)`, `deleteGroup(id)`, `assignProductGroup(productId, groupId)` — same `auth: 'customer'` pattern as every other method in this file.

## TASK 7 — Customer app: collapse 3 tabs into 2 (Dashboard, Products)

**Files:** `apps/customer-app/src/navigation/ShopOwnerNavigator.js`, `apps/customer-app/src/screens/shop/index.js`

- [ ] 7.1 `ShopOwnerNavigator.js`: two `Tab.Screen`s only — `ShopDashboard` (new component, TASK 8) and `ShopProducts` (rewritten, TASK 9). Delete the `ShopHome` and `ShopOrders` tab entries — their functionality merges into `ShopDashboard`.
- [ ] 7.2 Delete `apps/customer-app/src/screens/shop/ShopHomeScreen.js` and `ShopOrdersScreen.js` (superseded). Update `screens/shop/index.js` exports accordingly.

## TASK 8 — Customer app: new `ShopDashboardScreen` (toggle + live order queue + popup)

**Files:** `apps/customer-app/src/screens/shop/ShopDashboardScreen.js` (new), `apps/customer-app/src/screens/shop/NewOrderPopup.js` (new), `apps/customer-app/src/hooks/useNewOrderAlert.js` (new)

- [ ] 8.1 **Top of screen — shop toggle**, carried over from the old `ShopHomeScreen`: shop name, big Open/Closed switch (optimistic + rollback, refetch-on-focus — keep the v1 audit fix behavior), sign-out. Reuse the same visual weight/card style as before, just as the top section of this screen instead of its own tab.
- [ ] 8.2 **Below it — active order queue**: list orders from `getMyOrders()` where `confirmed === true` (i.e. accepted, no longer "new") — these are the ones actively being prepared, shown as simple cards (order number, items, no action needed). Orders that are neither confirmed nor rejected are NOT shown in this list — they only exist as the popup (8.3), so the owner can't quietly ignore a new order by scrolling past it.
- [ ] 8.3 **The popup — `NewOrderPopup.js`**: a full-screen non-dismissible modal (React Native `Modal` with `onRequestClose` a no-op so Android back button can't escape it — matches decision #4). Queue logic mirrors `GlobalOrderAlert.jsx`'s structure: an array of pending orders (fetched where `confirmed === false && rejected === false`), show one at a time, most-recently-arrived at the back of the queue (FIFO, oldest first — an owner shouldn't have order #1 buried under #2, #3 while they pile up).
  - Shows **only**: product names + quantities (no prices, no customer info — matches the existing privacy contract from v1), and the expected-time badge from `expectedMinutes` (TASK 3.1) labeled "Fast delivery — Xmin" or "Standard — Xmin" depending on `delivery_type`.
  - Two buttons: **Accept** (calls `confirmOrder`, dequeues, moves this order into the 8.2 list) and **Reject** (calls `rejectOrder`, dequeues — does NOT appear in 8.2, per decision #1).
  - Both buttons disable + show a spinner while their request is in flight; on error, re-enable and show an inline message (don't silently dequeue on failure — the owner needs another shot).
- [ ] 8.4 **Alert loop — `useNewOrderAlert.js`**: while the popup queue is non-empty, every ~8s call `Notifications.scheduleNotificationAsync({ content: { title: 'New order', body: '...', sound: true }, trigger: null })` (fires immediately, `expo-notifications`, already installed — see decision #2). Fire once immediately when the queue grows (mirrors `GlobalOrderAlert.jsx`'s "grew" detection so accept/reject-triggered shrinkage doesn't re-trigger the sound). Stop the loop the instant the queue empties.
- [ ] 8.5 Fetch trigger: `useFocusEffect` refetch (existing pattern) **plus** subscribe to `shop.order.assigned` (existing socket event from v1) to refetch immediately when a new order lands while the app is open, so the popup appears in real time, not just on next focus.
- [ ] 8.6 Design pass: use `theme/colors.js` (primary amber-orange, success teal-green already defined), `spacing.js`, `typography.js`, `shadows.js` for card elevation, `motion.js` for the popup's enter/exit animation if it exports reusable easing/duration constants (check the file; if it only has generic constants, a simple `Modal animationType="slide"` is fine — don't hand-roll a new animation system for this).

## TASK 9 — Customer app: `ShopProductsScreen` gains groups

**Files:** `apps/customer-app/src/screens/shop/ShopProductsScreen.js` (rewrite)

- [ ] 9.1 Fetch groups (`getMyGroups`) alongside products (`getMyProducts`, now returning `group_id`/`group_name` per TASK 5.2).
- [ ] 9.2 Render grouped: a section per group (name + a group-level Active/Inactive toggle calling `updateGroup(id, { active: !g.active })`) each listing its member products with their individual availability switches (unchanged from v1 — still calls `toggleProduct`). An "Ungrouped" section at the bottom for `group_id === null` products.
- [ ] 9.3 "New Group" affordance (simple prompt/modal for a name, calls `createGroup`) and a way to assign a product to a group from the product row (e.g. a small "Move to group…" action opening a picker of existing groups + "Ungrouped" — calls `assignProductGroup`). Keep this minimal — a full drag-and-drop or multi-select UI is out of scope for v1, a picker per product is enough.
- [ ] 9.4 Deleting a group (`deleteGroup`) — expose from a group's header (e.g. long-press or a small "…" menu), confirm via `Alert.alert` before calling (destructive, matches the app's existing `handleLogout` confirm-dialog pattern in the old `ShopHomeScreen`).

## TASK 10 — Tests + manual verification

- [ ] 10.1 `npm test` in `apps/api` (full suite), `npx jest` in `apps/customer-app` (full suite).
- [ ] 10.2 Manual, owner: new order arrives while dashboard open → popup pops instantly, phone buzzes/chimes every ~8s, back button doesn't dismiss it. Accept → order appears in the active list below the toggle, sound stops. Second order arrives mid-accept → queues, popup reappears for it right after. Reject a third → admin inbox gets a notification, order does NOT appear in owner's active list, order status in the admin panel is untouched. Toggle a product group off → its products vanish from customer-facing listings same as a closed shop.

---

## Explicitly out of scope for this v2 pass

- Editing expected-time settings from the shop-owner side (still admin-only, in `settings`).
- Group reordering / drag-and-drop.
- Push notification (background) for new orders while app fully closed — that channel already exists from v1 (`notifyShopsForOrder`'s `sendPushToMany` call) and is untouched; this spec only adds the *foreground, in-app* repeating alert on top of it.
