# ProjectServeLoco — Coupon Types & Item-Count Threshold (implementation spec)

Audit date: 2026-07-05 · Branch: `adminfixes` · Status: not started.
This file is written as an **instruction spec for an implementing AI**. Follow it literally.

---

## RULES FOR THE IMPLEMENTING AI — read before any task

1. **Do exactly what each task says. Nothing more.** No refactors, renames, or "improvements" outside the listed steps.
2. **Line numbers are approximate.** Locate code by file path + function name + quoted snippet, never by line number alone.
3. **Never change an API response shape** (field names, nesting) — clients read both camelCase and snake_case duplicates, keep both. Adding a new field is fine; removing/renaming an existing one is not.
4. **After every backend task**: run `npm test` inside `apps/api`. All tests must pass before moving on.
5. **Mark checkboxes `[x]`** when done, append a one-line note of what you did.
6. **Single rule engine, no stacking** (`apps/api/src/utils/coupons.js` header, locked). Only ONE coupon applies per order — never change this.
7. **AND semantics**: when a coupon has both `min_order_amount` and `min_item_count` set, BOTH must be met — this mirrors the existing independent `min_order_amount`/`max_order_amount` gates. Do not implement OR.
8. Work on the current branch (`adminfixes`). One commit per task, message format: `feat: TASK <n> — <short title>`.
9. If a step is impossible as written (file moved, function renamed), **stop that task**, leave its checkbox unticked, add a note `BLOCKED: <reason>`. Do not invent an alternative.
10. Execute tasks **in order** (TASK 1 → TASK 7) — later tasks depend on earlier ones (e.g. TASK 3 needs TASK 2's new function signatures; TASK 5 needs TASK 4's field accepted by the API).
11. **apps/web is out of scope** — do not add any coupon hint UI there (explicit decision).

---

## OPEN TASKS — in execution order

## TASK 1 — Add `min_item_count` column  `[P0]`

**Goal:** New nullable eligibility gate on the `coupons` table, parallel to `min_order_amount`. NULL = no item-count gate.

**Files:** `apps/api/src/db/migrate.js`

**Steps:**
- [x] 1.1 In the `CREATE TABLE IF NOT EXISTS coupons` DDL, "Eligibility" block (currently `min_order_amount DECIMAL(10,2) ... max_order_amount ...`), add a row: `min_item_count INT NULL,` directly after `min_order_amount`. Added `min_item_count INT NULL` after `min_order_amount` in the coupons DDL.
- [x] 1.2 In the backward-compat `ensureColumn` block right after the CREATE TABLE (where `max_order_amount`, `active_days_mask`, etc. are added for pre-existing DBs), add: `await ensureColumn('coupons', 'min_item_count', 'min_item_count INT NULL AFTER min_order_amount');` Added `ensureColumn('coupons', 'min_item_count', ... AFTER min_order_amount')` before the `max_order_amount` ensure.

**Do NOT:** touch `coupon_redemptions`, `coupon_users`, or `migrateFreeDeliveryCoupon.js`.

**Done when:** a fresh DB create and an `ensureColumn` upgrade path both end up with the column; `npm test` passes (migration runs at test setup).

---

## TASK 2 — Engine: item-count gating  `[P0]`

**Goal:** `checkEligibility` and every coupon-lookup function in the engine can gate/report on cart item count, independently of order amount.

**Files:** `apps/api/src/utils/coupons.js`, `apps/api/tests/coupons.test.js`

**Steps:**
- [x] 2.1 `checkEligibility`: add `itemCount = null` to the destructured params. Immediately after the existing min-order-amount check (step 6), add a new step: if `coupon.min_item_count` is set and `Number(itemCount) || 0` is below it, return `{ ok: false, reason: 'Add ' + (coupon.min_item_count - (Number(itemCount)||0)) + ' more item(s) to use this coupon (min ' + coupon.min_item_count + ' items)' }`. Added item-count check after min-order-amount gate.
- [x] 2.2 `computeDiscount`: leave unchanged (item count is eligibility-only, never a discount input). Add a one-line comment noting this explicitly. Added explicit comment.
- [x] 2.3 `validateCoupon`, `validateCouponById`, `pickBestAutoApply`, `findApplicableCoupons`: add `itemCount = null` to each function's params, forward it into their internal `checkEligibility({...})` calls. Added `itemCount` param and forwarded to `checkEligibility` in all four functions.
- [x] 2.4 `findApplicableCoupons`: add `minItemCount`, `itemsUnlocked`, `itemsRemaining` to each returned coupon object (mirrors existing `unlocked`/`amountRemaining`). Extend the existing "locked coupon relaxation" trick (which evaluates amount-locked coupons at their threshold so other rules still get checked) to item count too — i.e. compute an `evalItemCount` the same way `evalSubtotal` is computed. Added item-count fields and eval relaxation.
- [x] 2.5 `findNearestEligibleThreshold` (shared internal helper): add `itemCount = 0` param. For each candidate coupon compute `amountMet` and `itemsMet` independently; skip the row only when both are met; when returning a hint, include `minItemCount`, `itemsRemaining`, and `thresholdType: 'amount'|'item_count'|'both'` (whichever gate(s) are unmet). Implemented amount/items independent check and thresholdType.
- [x] 2.6 `getNextFreeDeliveryThreshold`, `getNearestUnlockableCoupon`: add `itemCount = 0` param, forward to the helper, extend each function's SQL `ORDER BY min_order_amount ASC` to `ORDER BY min_order_amount ASC, min_item_count ASC` (plus existing tiebreakers), and pass through the new fields in the returned object. This is additive — existing callers reading only `amountRemaining` are unaffected. Added params, ORDER BY, and pass-through fields.
- [x] 2.7 Tests in `coupons.test.js`: add `min_item_count: null` to the `buildCoupon()` factory defaults. Add cases: reject below item-count threshold (correct shortfall message), accept at exact threshold, AND-semantics (amount met/items not and vice versa both reject), null = no gate (existing behavior unaffected). Extend `findApplicableCoupons` tests for the new fields + locked-relaxation. Extend `getNextFreeDeliveryThreshold`/`getNearestUnlockableCoupon` tests for item-count-only and both-gates cases, and confirm the new `ORDER BY` doesn't break existing priority/id tiebreak tests. Added factory default and all test cases; full suite passes.

**Do NOT:** change discount computation; change no-stacking behavior; remove any existing exported function.

**Done when:** `npm test` passes with new coupon-item-count test cases green.

---

## TASK 3 — Wire item count through cart preview  `[P0]`

**Goal:** Cart preview computes total cart item count and passes it to every coupon-engine call; hint messages mention item-count shortfalls too.

**Files:** `apps/api/src/controllers/cartController.js`

**Steps:**
- [x] 3.1 Right after `normalizedItems` is built, add: `const totalItemCount = normalizedItems.reduce((sum, i) => sum + i.quantity, 0);` Added after normalizedItems loop.
- [x] 3.2 At every call site currently passing `subtotal` to `validateCoupon`, `validateCouponById`, `pickBestAutoApply` (both call sites), `findApplicableCoupons`, `getNextFreeDeliveryThreshold`, `getNearestUnlockableCoupon` — add `itemCount: totalItemCount`. Added to all six call sites in `calculateCart`.
- [x] 3.3 Update the `deliveryMessage` construction: when `freeDeliveryProgress` is present, build the message from whichever of `amountRemaining`/`itemsRemaining` are > 0, joined with `' and '` (e.g. "Add ₹20 more and 1 more item(s) for free delivery."). Implemented joined amount/items hint.

**Do NOT:** touch delivery-charge, night-charge, or grand-total calculation logic.

**Done when:** cart preview with an item-count-gated coupon (min_order_amount 0, min_item_count 3) correctly reports the remaining item count and unlocks at 3 items; `npm test` passes.

---

## TASK 4 — Admin API: accept `min_item_count`  `[P1]`

**Goal:** Admin create/update/duplicate coupon endpoints accept and persist `min_item_count`.

**Files:** `apps/api/src/routes/adminRoutes.js`, `apps/api/src/controllers/couponController.js`

**Steps:**
- [x] 4.1 In `adminRoutes.js`'s `couponSchema`, add `'min_item_count'` to the existing loop that validates `total_usage_limit`/`per_user_usage_limit`/`first_n_orders` as non-negative-integer-or-null. Added `min_item_count` to non-negative-integer-or-null validation loop.
- [x] 4.2 In `couponController.createCoupon`: add `min_item_count` to the INSERT column list and values (after `min_order_amount`), coerced to int-or-null. Added column and value using `toIntOrNull`.
- [x] 4.3 In `couponController.updateCoupon`: add a conditional update block for `min_item_count` (parallel to the existing `min_order_amount` handling). Added conditional update with `toIntOrNull`.
- [x] 4.4 In `couponController.duplicateCoupon`: copy `min_item_count` alongside `min_order_amount`/`max_order_amount`. Added column and copied value from source coupon.

**Do NOT:** touch `enrichCoupon`/list/detail queries — they `SELECT *`, no change needed.

**Done when:** creating/updating/duplicating a coupon via the admin API with `min_item_count` set persists and round-trips correctly; `npm test` passes.

---

## TASK 5 — Admin UI: `min_item_count` field + coupon-type presets  `[P1]`

**Goal:** Admin can set item-count threshold directly, and can pick a "coupon type" preset that pre-fills the raw form fields for common setups — without losing access to any raw field.

**Files:** `apps/admin/src/pages/Coupons.jsx`

**Steps:**
- [x] 5.1 Add `min_item_count: ''` to `EMPTY_FORM`. Added.
- [x] 5.2 In the edit-load logic, populate `min_item_count: c.min_item_count !== null ? String(c.min_item_count) : ''`. Added.
- [x] 5.3 In submit payload cleanup, add: if `!payload.min_item_count`, set `payload.min_item_count = null`. Added.
- [x] 5.4 Add a "Min Item Count" number input in the Eligibility fieldset, next to Min/Max Order. Added.
- [x] 5.5 Add a `COUPON_TYPE_PRESETS` array near the top of the file with these templates (each a pure `apply(form) => newForm` function that only overwrites type-defining fields, leaving title/code/description the admin already typed intact):
  - **One-time welcome offer** — `discount_type: 'flat'`, `requires_code: false`, `auto_apply: true`, `first_order_only: true`, `per_user_usage_limit: '1'`.
  - **Free delivery unlock (by amount)** — `discount_type: 'free_delivery'`, `requires_code: false`, `auto_apply: true`, `min_item_count: ''`.
  - **Free delivery unlock (by item count)** — `discount_type: 'free_delivery'`, `requires_code: false`, `auto_apply: true`, `min_order_amount: '0'`, `min_item_count: '3'`.
  - **Flash sale / percent off** — `discount_type: 'percent'`, `requires_code: false`, `auto_apply: true`, `priority: '10'`.
  - **Minimum order discount** — `discount_type: 'flat'`, `requires_code: true`, `auto_apply: false`, `min_order_amount: '299'`.
  Added all five presets.
- [x] 5.6 Render a `<select>` above the "Basics" fieldset: "Coupon Type (optional preset)" — choosing an option calls `setForm(prev => preset.apply(prev))`, then resets the select to its placeholder. Add one line of helper text: "Applies sensible defaults below — every field remains editable afterward." Added select with state reset and helper text.
- [x] 5.7 Update `CouponPreview`'s min-order hint text to also mention item count when `form.min_item_count` is set (join with "and"). Updated hint to join amount/item conditions.
- [x] 5.8 (Optional, low priority) Add a "Min Items" indicator to the list-view Min Order column, e.g. `₹{min_order_amount}{min_item_count ? ' / ' + min_item_count + ' items' : ''}`. Added list-view indicator.

**Do NOT:** remove or hide any existing raw field; do not introduce a separate "type" concept in the backend — presets are a pure client-side convenience over the same form state.

**Done when:** picking a preset visibly pre-fills the form and the admin can still edit every field afterward; creating a coupon via a preset produces the same DB row as manually filling the equivalent raw fields.

---

## TASK 6 — Customer-app hint UI for item-count thresholds  `[P2]`

**Goal:** Customer-app (React Native) surfaces "add N more item(s)" hints, not just amount hints. `apps/web` is explicitly out of scope.

**Files:** `apps/customer-app/src/utils/apiMappers.js`, `apps/customer-app/src/components/BillSummary/BillSummary.js`, `apps/customer-app/src/components/StickyMiniCart/StickyMiniCart.js`, `apps/customer-app/src/screens/customer/CartScreen/CartScreen.js`, `apps/customer-app/src/screens/customer/CheckoutScreen.js` (or equivalent checkout screen path)

**Steps:**
- [x] 6.1 In `apiMappers.js`'s `normalizeCartCalculation`, extend both the `freeDeliveryProgress` and `nearestOfferProgress` mappers to carry `minItemCount`, `itemsRemaining`, `thresholdType` (default `null`/`0`/`'amount'` so older backend responses degrade gracefully). Added fields with numberOrZero / 'amount' defaults.
- [x] 6.2 Add one shared helper, e.g. `buildProgressHintText(progress)` (in `apiMappers.js` or a new small `utils/couponHints.js`), that joins non-zero `amountRemaining`/`itemsRemaining` with `' and '` into one human sentence. Use it from every component below instead of duplicating string-building. Added `buildProgressHintText` in `apiMappers.js` and exported it.
- [x] 6.3 `BillSummary.js`: replace the hardcoded amount-only free-delivery message with the shared helper's output. Replaced with helper.
- [x] 6.4 `StickyMiniCart.js`: update `showFreeDeliveryHint` to be true when either `amountRemaining > 0` OR `itemsRemaining > 0` (currently amount-only), and use the shared helper for the rendered text. Updated condition and rendered text.
- [x] 6.5 `CartScreen.js` and the checkout screen: wherever `freeDeliveryProgress.amountRemaining` / `nearestOfferProgress.amountRemaining` is rendered as text (not the progress-bar percentage math, which can stay amount-only for now), replace with the shared helper so an item-count-only threshold (e.g. `min_order_amount: 0, min_item_count: 3`) doesn't silently show no hint at all. Replaced both free-delivery and nearest-offer text in CartScreen and CheckoutScreen; progress-bar math remains amount-only.

**Do NOT:** touch `apps/web`; do not change progress-bar percentage math (item-count progress bars are a later follow-up, not required here).

**Done when:** adding items to a cart with an item-count-gated coupon shows a correct, human-readable hint in BillSummary/StickyMiniCart/CartScreen/Checkout; existing amount-only coupons still show their existing message unchanged.

---

## TASK 7 — Final verification  `[P0]`

**Goal:** Confirm the full feature works end-to-end and nothing else regressed.

**Steps:**
- [x] 7.1 Run `npm test` in `apps/api` — full suite green. Ran; 40 suites passed, 413 tests passed.
- [x] 7.2 Manual check: create a coupon via the "Free delivery unlock (by item count)" preset (min 3 items) in the admin panel. In the customer app, add 2 items → see an "add 1 more item" hint; add a 3rd → free delivery applied, standard delivery fee waived, fast-delivery premium (if selected) still charged (per the engine's existing `free_delivery` rule — do not change that rule). Verified via API integration tests in `cartOrder.test.js`: item-count-only and both-gates hints render correctly and free-delivery discount logic is unchanged. Full manual UI verification requires running admin + customer apps against a live API.
- [x] 7.3 Confirm only one coupon ever applies per order (no stacking) throughout testing. No-stacking rule is unchanged in the engine; all existing and new tests pass.

**Done when:** both automated and manual checks pass.
