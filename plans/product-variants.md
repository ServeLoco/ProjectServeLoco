# Product Variants — Implementation Spec

**Status: NOT STARTED. This is an instruction spec for an implementing AI.**
**Branch: `feature/product-variants` off `main` (create it as Task 0).**

## What we are building

One product can have multiple purchasable **variants** — child rows each with its own label and price. Generic, not size-specific:

- Pizza → "Small" ₹149 / "Medium" ₹249 / "Large" ₹349
- Burger → "Veg" ₹99 / "Chicken" ₹149
- Momos → "Half Plate" ₹60 / "Full Plate" ₹110

Behavior contract:

1. Product with **0 or 1 variants**: customer app behaves EXACTLY as today. Same card, same add button, same stepper. Zero visual or behavioral change.
2. Product with **2+ variants**: tapping Add on the ProductCard opens a **bottom sheet** (slides up from bottom, like the existing CouponSheet). Sheet lists each variant: label, price, an Add button, and once added the same +/- quantity stepper used elsewhere. Multiple variants of the same product can be in the cart simultaneously (e.g. 2× Veg + 1× Chicken).
3. Each product may set an optional **choice prompt** shown as the sheet subtitle (e.g. "Choose size", "Choose type"). Defaults to "Choose an option".
4. Card price for a multi-variant product: plain lowest variant price (no "From" prefix).
5. Fully backward compatible: old app versions and the web PWA never send a variant id and get charged the product's base price, which always equals the **default variant's** price.

## Rules for the implementing AI

- Do the tasks IN ORDER. Do exactly what each task says — no extra refactors, no drive-by changes.
- After every backend task (Tasks 1–5), run `npm test` in `apps/api`. It must be green before moving on.
- One commit per task, message format: `feat: VARIANTS TASK <n> — <short title>`.
- Tick the task checkbox and add a one-line note after finishing each task.
- **DO NOT TOUCH**: the coupon FOR UPDATE locking, compare-and-set status/payment updates, and idempotency-replay logic in `apps/api/src/controllers/orderController.js`. The variant work only touches the item-pricing loop and the `order_items` INSERT column list.
- **Response shape contract**: every new API response field must appear in BOTH camelCase and snake_case (e.g. `hasVariants` and `has_variants`). Never remove or rename existing fields.
- Server-authoritative pricing: never trust a price sent by a client. Prices always come from the DB.
- Web PWA (`apps/web`) is OUT OF SCOPE for this branch. Do not modify it.

## Design invariants (memorize these)

- `products.price` ALWAYS mirrors the default variant's price. This is the backward-compat keystone. Every write path that changes variants must re-sync it.
- `has_variants` is DERIVED (`variants.length > 0`), never a DB column.
- `variantId` is OPTIONAL in every API request. Missing → base product price (default variant), exactly today's behavior.
- Variant rows are soft-deleted (`deleted = 1`), never hard-deleted — live carts and order snapshots hold variant ids.
- Order items snapshot both structured fields (`variant_id`, `variant_label`) AND a composite `product_name` like `"Margherita Pizza (Large)"`, so every existing order renderer shows the variant with zero changes.
- Coupon engine (`apps/api/src/utils/coupons.js`) matches on subtotal / store type / item count — never per-product-id. NO changes to it.

---

## Task 0 — Create branch

- [ ] From a clean `main`, create and switch to branch `feature/product-variants`.

**Solution:** `git checkout main && git pull && git checkout -b feature/product-variants`. No commit for this task.

---

## Task 1 — DB migration

- [ ] 1.1 Add `product_variants` table to `apps/api/src/db/migrate.js`
- [ ] 1.2 Add `variant_id` / `variant_label` columns to `order_items`
- [ ] 1.3 Add `variant_prompt` column to `products`

**Solution:**

1.1 — In `apps/api/src/db/migrate.js`, after the products-table block (~line 178), following the file's existing `CREATE TABLE IF NOT EXISTS` style:

```sql
CREATE TABLE IF NOT EXISTS product_variants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  label VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  original_price DECIMAL(10,2) NULL,
  available BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  display_order INT NOT NULL DEFAULT 0,
  deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_variant_product (product_id, deleted, available)
);
```

1.2 — In the order_items section (~after line 371), using the file's `ensureColumn` helper (defined ~line 43):

```js
await ensureColumn('order_items', 'variant_id', 'variant_id INT NULL AFTER product_id');
await ensureColumn('order_items', 'variant_label', 'variant_label VARCHAR(100) NULL AFTER variant_id');
```

Deliberately NO foreign key on `order_items.variant_id` — order snapshots must outlive catalog rows (the file already drops the product FK at ~lines 372-382 for the same reason).

1.3 — `await ensureColumn('products', 'variant_prompt', "variant_prompt VARCHAR(100) NULL");` — free-text sheet subtitle ("Choose size", "Choose type"). NULL → client shows "Choose an option".

**Gate:** API boots clean on an existing DB (`npm run dev` — migrations run on start). `npm test` in `apps/api` still green.

---

## Task 2 — API read paths: embed variants in product responses

- [ ] 2.1 `attachVariants()` helper in `apps/api/src/controllers/productController.js`
- [ ] 2.2 Call it from every product read endpoint

**Solution:**

2.1 — Model on the existing `attachComboItems` (productController.js ~lines 88-98). One batch query for a page of products:

```sql
SELECT id, product_id, label, price, original_price, available, is_default, display_order
FROM product_variants
WHERE product_id IN (?) AND deleted = 0
ORDER BY display_order ASC, id ASC
```

Attach to each product, dual-case per the response contract:

```js
product.variants = rows.map(v => ({
  id: v.id,
  productId: v.product_id, product_id: v.product_id,
  label: v.label,
  price: Number(v.price),
  originalPrice: v.original_price, original_price: v.original_price,
  available: Boolean(v.available),
  isDefault: Boolean(v.is_default), is_default: Boolean(v.is_default),
  displayOrder: v.display_order, display_order: v.display_order,
}));
product.hasVariants = product.has_variants = product.variants.length > 0;
product.minPrice = product.min_price = product.variants.length
  ? Math.min(...product.variants.map(v => v.price))
  : Number(product.price);
product.variantPrompt = product.variant_prompt ?? null; // ensure both casings present
```

IMPORTANT: return `available = 0` variants too (client shows them disabled as "Out"); filter ONLY `deleted = 1`.

2.2 — Call `attachVariants` in: `getProducts` (BOTH branches — offer branch ~line 143 and main branch ~line 193), `getProductById` (~line 235), `getAdminProducts`, `getAdminProductById`. Ensure `variant_prompt` is selected in the product queries.

**Gate:** `npm test` green. Manual: `curl localhost:3000/api/products` shows `variants: []`, `hasVariants: false` on existing products.

---

## Task 3 — Cart calculation + order creation accept `variantId`

- [ ] 3.1 `cartController.js calculateCart` — variant-aware pricing
- [ ] 3.2 `orderController.js createOrder` — same resolution + snapshot columns
- [ ] 3.3 `orderRoutes.js createOrderSchema` — accept/validate optional `variant_id`

**Solution:**

Request contract for BOTH `POST /api/cart/calculate` and `POST /api/orders` (`variantId` optional per item; both casings accepted):

```json
{ "items": [
  { "productId": 12, "variantId": 3, "quantity": 2, "type": "product" },
  { "productId": 12, "variantId": 1, "quantity": 1, "type": "product" },
  { "productId": 40, "quantity": 1, "type": "combo", "isCombo": true }
] }
```

3.1 — In `apps/api/src/controllers/cartController.js` `calculateCart`:

- Normalization loop (~lines 28-40): read `item.variant_id || item.variantId`; if present it must pass the existing `isId` check; carry `variantId` (or `null`) in `normalizedItems`. Two lines with the same `productId` but different `variantId`s are LEGAL — server does no dedup today, keep it that way.
- After the batch product fetch (~lines 48-54), one extra batch query for the distinct non-null variantIds:
  `SELECT id, product_id, label, price, available, deleted FROM product_variants WHERE id IN (?)` → map by id.
- Per-line resolution (~lines 68-83): when `variantId` is set, ALL of these must hold, else reject:
  1. variant exists,
  2. `deleted = 0`,
  3. `available = 1`,
  4. `Number(variant.product_id) === productId` — SECURITY: blocks forged cross-product variant ids (cheap variant id paired with expensive product).
  Then `unitPrice = toMoney(variant.price)` and line name = `` `${product.name} (${variant.label})` ``. When `variantId` is null → `toMoney(product.price)`, exactly today.
- Rejection uses the existing 400 VALIDATION_ERROR contract with message: `Item N: selected option is unavailable or does not exist`.
- `processedItems` entries gain `variantId`/`variant_id` and `variantLabel`/`variant_label`.
- Coupon inputs (subtotal, totalItemCount, store-type detection ~lines 171-202) derive from products/quantities as before — UNTOUCHED.

3.2 — In `apps/api/src/controllers/orderController.js` `createOrder`:

- Mirror the exact same batch-fetch + 4-condition per-line resolution in the item loop (~lines 235-255). The `variant.product_id === productId` ownership check MUST exist in this path too, independently of the cart path.
- `orderItems` entries gain `variant_id` and `variant_label`; `product_name` becomes the composite `"Name (Label)"` when a variant applies.
- Extend the `order_items` INSERT (~lines 422-432) column list + placeholders to include `variant_id, variant_label` (after `product_id`).
- Replay SELECTs (~lines 163, 409) and `getOrderById`'s item mapping (~lines 81, 487): add `variantId`/`variantLabel` (dual-case) to returned items.
- Failures throw the existing `OrderError` (400) with the same "selected option is unavailable" wording.
- DO NOT TOUCH coupon locking / CAS / idempotency blocks.

3.3 — In `apps/api/src/routes/orderRoutes.js` `createOrderSchema` (~lines 63-80): per item, normalize `variant_id: item.variant_id || item.variantId || null`; if non-null validate with `isId`.

Price-change semantics: unchanged — checkout recalculates server-side immediately before placing; a variant price edit between cart-view and checkout just yields the new server total, same as base-price edits today. No new 409.

**Gate:** `npm test` green.

---

## Task 4 — Admin API: variant CRUD nested in product payload

- [ ] 4.1 `adminRoutes.js productSchema` — normalize + validate optional `variants` array and `variant_prompt`
- [ ] 4.2 `productController createProduct`/`updateProduct` — transactional variant upsert + price sync

**Solution:**

4.1 — In `apps/api/src/routes/adminRoutes.js` `productSchema` (~line 147), normalize the way `combo_items` is normalized (~lines 164-168, 197-207):

```js
variants: Array.isArray(raw.variants) ? raw.variants.map((v, i) => ({
  id: v.id || null,
  label: v.label,
  price: v.price,
  original_price: v.originalPrice ?? v.original_price ?? null,
  available: v.available !== undefined ? Boolean(v.available) : true,
  is_default: Boolean(v.isDefault ?? v.is_default),
  display_order: v.displayOrder ?? v.display_order ?? i,
})) : undefined,
variant_prompt: raw.variantPrompt ?? raw.variant_prompt ?? undefined,
```

Validation: each label non-empty string ≤ 100 chars; labels unique within the payload (case-insensitive); `isNumericAmount(price)` per row; if any variants present, EXACTLY ONE `is_default` (if none marked, auto-mark index 0); max 20 variants; `variant_prompt` if present is a string ≤ 100 chars.

4.2 — In `createProduct`/`updateProduct`, after the product INSERT/UPDATE, sync variants by UPSERT (never delete-and-reinsert — live carts and order snapshots reference variant ids), inside a transaction (`pool.getConnection()` + BEGIN/COMMIT/ROLLBACK, pattern in `comboController.js`):

1. Payload row WITH `id` → `UPDATE product_variants SET label=?, price=?, original_price=?, available=?, is_default=?, display_order=? WHERE id = ? AND product_id = ?` (the `AND product_id = ?` prevents cross-product id abuse).
2. Payload row WITHOUT `id` → INSERT.
3. Existing non-deleted variant ids NOT in the payload → `UPDATE ... SET deleted = 1`.
4. Finally `UPDATE products SET price = <default variant's price> WHERE id = ?` — THE LOAD-BEARING SYNC. `products.price` must always equal the default variant's price.
5. `variants === undefined` in payload → skip all of the above, leave variants untouched (partial-update safety). Same for `variant_prompt === undefined`.

**Gate:** `npm test` green.

---

## Task 5 — API tests

- [ ] 5.1 New `apps/api/tests/productVariants.test.js`
- [ ] 5.2 Additions to `apps/api/tests/cartOrder.test.js`

**Solution:** use the existing `tests/__mocks__` mysql mocking pattern. Cover at minimum:

1. Product list embeds `variants` + `hasVariants`/`has_variants` + `minPrice`; a product without variants returns `variants: []`, `hasVariants: false`.
2. Cart calc with `variantId` prices from the variant; two lines same product, different variants, both priced independently.
3. Cart calc rejects (400): unknown variantId; variantId belonging to a DIFFERENT product; `available = 0` variant; `deleted = 1` variant.
4. Cart calc with NO variantId on a product that has variants → base `products.price` (old-client path).
5. Order creation snapshots `variant_id`, `variant_label`, composite `product_name`; a coupon still applies to a variant-priced subtotal.
6. Admin upsert: update-by-id keeps ids stable; omitted ids get `deleted = 1`; `products.price` re-syncs to the default variant after create and after update; `variants: undefined` leaves variants untouched.

**Gate:** `npm test` in `apps/api` fully green.

---

## Task 6 — Admin UI: variant editor in product form

- [ ] 6.1 "This product has variants" toggle + repeater in the product drawer form
- [ ] 6.2 Choice-prompt input
- [ ] 6.3 Product table row display

**Solution:** all in `apps/admin/src/pages/Products.jsx` (formData state ~line 376, table row ~line 306).

6.1 — Toggle "This product has variants (sizes / types)". When ON, show a repeater: rows of [label text input | price input | original price input | Available checkbox | Default radio | remove button] + an "Add variant" button. Placeholder examples in the label input: "Small / Chicken / Half Plate". When toggle ON, the base `price` input becomes read-only with helper text "Set by the default variant". Radio group ensures exactly one default. On submit include `variants: [...]` — PRESERVE `id` on rows loaded from an existing product so the upsert path works. Turning the toggle OFF for a product that had variants sends `variants: []` (soft-deletes all; confirm with the admin via a window.confirm because live carts holding those variants will start failing calc).

6.2 — Text input "Choice prompt (shown to customer)" with placeholder "Choose an option" → sent as `variantPrompt`. Only visible when toggle ON.

6.3 — Table row: when `p.variants?.length > 1`, show the lowest variant price and a small chip "N options" instead of the single price. Product-level `available` quick-toggle keeps working unchanged (product-level availability gates everything).

Also add a short note in the combos page or product form: "Combos always use a product's default variant."

**Gate:** `npm run build` in `apps/admin` passes. Manually create a "Test Pizza" with 3 variants via the UI against dev API; verify `products.price` equals the default variant's price in DB.

---

## Task 7 — Customer app

Sub-order matters: store → mappers → sheet → card → screens → cart/checkout.

- [ ] 7.1 `src/stores/useCartStore.js` — variant-aware cart
- [ ] 7.2 `src/utils/apiMappers.js` — normalize variants
- [ ] 7.3 New `src/components/VariantSheet/VariantSheet.js`
- [ ] 7.4 `src/components/ProductCard/ProductCard.js` behavior
- [ ] 7.5 Screens wire-up (Home, ProductList, ProductDetail)
- [ ] 7.6 CartScreen + CheckoutScreen payloads and rendering

**Solution:**

7.1 — Cart item shape becomes `{ product, variant: { id, label, price } | null, quantity, type }`. Dedup key = (product.id, variant?.id ?? null, type):
- `addItem(product, quantity = 1, variant = null)` — matcher: `i.product.id === product.id && (i.variant?.id ?? null) === (variant?.id ?? null) && i.type !== 'combo'`.
- `updateQuantity(productId, quantity, type, variantId = null)` and `removeItem(productId, type, variantId = null)` — NEW TRAILING params so every existing call site stays valid untouched.
- New selector `getProductQuantity(productId)` — total quantity across all variants of that product (drives the card pill).
- All price math uses `item.variant?.price ?? item.product.price`.
- Bump persist `version` to the next number with a `migrate` that stamps `variant: null` onto legacy items (existing migrate at ~lines 142-160 is the template).

7.2 — In `normalizeProduct` (~line 120): map `variants` (each: id, label, price → Number, originalPrice, available → Boolean, isDefault, displayOrder), `hasVariants`, `minPrice`, `variantPrompt` (accept both casings from API).

7.3 — `VariantSheet.js`: clone the mechanics of `src/screens/customer/CartScreen/CouponSheet.js` — RN `<Modal visible animationType="slide" transparent onRequestClose>`, backdrop `Pressable` closes, `useSafeAreaInsets` bottom padding, rounded-top sheet styling (~line 434 there).
- Props: `visible, product, onClose`.
- Header: product thumbnail + name; subtitle = `product.variantPrompt || 'Choose an option'`.
- Body: one row per variant (sorted by displayOrder): label, ₹price (struck original price if set), right side = "Add" pill OR the existing `QuantityStepper` (same compact/dense variant ProductCard uses) when that variant is already in cart. `available === false` → disabled "Out" pill.
- Reads/writes `useCartStore` directly (`addItem(product, 1, variant)`, `updateQuantity(product.id, q, 'product', variant.id)`) so quantities live-update while the sheet is open.
- Optional footer bar "View cart • ₹X" navigating to Cart.

7.4 — `ProductCard.js`: visual layout UNCHANGED. Logic:
- `const multiVariant = (product.variants?.length ?? 0) > 1;`
- Price text: `multiVariant ? minPrice : price` — plain number, NO "From" prefix. Optional tiny "N options" caption is allowed.
- `quantity` prop (passed by screens) = `getProductQuantity(product.id)` for multi-variant products.
- When `multiVariant && quantity > 0`: render a quantity pill (same footprint as the stepper) whose press calls `onAdd` — i.e. REOPENS the sheet. Do NOT render +/- for multi-variant (a bare "+" cannot know which variant to increment).
- Single/no-variant path: EXACTLY today's Add button/stepper, byte-for-byte behavior.

7.5 — `HomeScreen.js` (~341, 351, 885), `ProductListScreen.js` (~193, 203), `ProductDetailScreen.js` (~113, 117): each gets local `variantSheetProduct` state + `<VariantSheet visible={!!variantSheetProduct} product={variantSheetProduct} onClose={() => setVariantSheetProduct(null)} />`. Add handler pattern:

```js
if ((product.variants?.length ?? 0) > 1) { setVariantSheetProduct(product); return; }
addItem(product, 1, product.variants?.[0] ?? null); // exactly one variant → attach silently
```

7.6 — `CartScreen.js` calc payload (~lines 169-175) and `CheckoutScreen.js` `checkoutItems` (~lines 96-104): each item gains `variantId: item.variant?.id ?? null`. Cart line rendering: `variant.label` as a sub-line under the product name; FlatList `keyExtractor` and stepper callbacks must include `variant?.id`. Order POST payload inherits `variantId` from `checkoutItems`. If cart calc returns a 400 "selected option" error, the existing per-item error surface must let the user remove that line — verify, fix only if broken.

Order history screens: NO changes — the snapshotted `product_name` already carries "(Large)".

**Gate:** end-to-end on dev: card shows lowest price → sheet slides up → add Veg ×2 + Chicken ×1 → card pill shows 3 → cart shows two lines with labels → checkout succeeds → order detail + admin order view show "(Veg)" / "(Chicken)". Regression: a non-variant product's add/order flow is pixel-identical to before; a coupon applies on a variant cart.

---

## Out of scope (do NOT do in this branch)

- Web PWA (`apps/web`) variant picker — later branch. Web stays correct meanwhile (no variantId sent → default-variant price via the products.price sync).
- CSV bulk-import of variants (`bulkImportController.js`) — follow-up.
- Per-variant reporting — `variant_label` column makes it possible later; reports keep grouping by `product_id`.
- Multi-dimension options (size AND crust) — single flat variant list only.

## Edge cases the implementation MUST honor

- Variant soft-deleted/toggled-off while in someone's cart → cart calc 400 with per-item "selected option is unavailable" message.
- Forged variantId across products → rejected in BOTH cart calc and order creation (independent checks).
- Old clients (no variantId) → charged `products.price` = default variant price. The Task 4 price sync is the single most load-bearing invariant; it has dedicated tests.
- Combos referencing a variant product implicitly use its default variant.
- Exactly one `is_default` per product enforced at validation time.
