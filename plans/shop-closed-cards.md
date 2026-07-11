# Shop-closed products: keep cards visible, grayscale + "Shop closed" label (customer app)

## Context

Today, products of a closed shop (`shops.is_open = 0`) are excluded **server-side** from all customer product lists via SQL `EXISTS` clauses — the customer app never sees them. Requirement: keep those cards in place in the customer app; render the product photo in black-and-white (color gone, item still recognizable), put a "Shop closed" text just above center of the card, and lock the buy button. Customer app only — web PWA/admin must stay unchanged.

Two shop-closed concepts exist; this feature targets **per-shop** `shops.is_open` (multi-vendor), NOT the global `settings.shop_open` banner. Deactivated shops (`active = 0`) stay fully hidden.

## Approach

Server keeps excluding by default; a new query param `include_closed_shops=1` (sent only by the customer app) relaxes the `is_open` exclusion and every list row now carries a projected `shop_is_open` flag (both casings, per repo response-shape contract). Checkout guards stay untouched — server still rejects ordering closed-shop items. Rollout is order-safe both directions (flag absent → app defaults to open; param absent → API behaves as today).

## Changes

### 1. API — `apps/api/src/controllers/productController.js`

- `getProducts` (line 208): parse param
  ```js
  const includeClosedShops = ['1', 'true'].includes(
    String(req.query.includeClosedShops ?? req.query.include_closed_shops ?? '').toLowerCase());
  ```
- Shared clause used by both the offer path (line 234) and `productQuery` (line 264):
  - default: existing clause unchanged (`s.is_open = 1 AND s.active = 1`)
  - with param: `(p.shop_id IS NULL OR EXISTS (SELECT 1 FROM shops s WHERE s.id = p.shop_id AND s.active = 1))` — drop only the `is_open` condition.
- Projection: add `LEFT JOIN shops sh ON sh.id = p.shop_id` to the offer query (lines 231–233) and `productQuery` FROM (line 263); add to both SELECT lists (lines 230, 262):
  ```sql
  p.shop_id, IF(p.shop_id IS NULL OR (sh.is_open = 1 AND sh.active = 1), 1, 0) AS shop_is_open
  ```
  (`shops.id` is PK — no row multiplication. `comboQuery` untouched; it is never UNIONed with `productQuery`.)
- After query (lines ~253, ~305) add camelCase mirrors: `r.shopId = r.shop_id ?? null; r.shopIsOpen = r.shop_is_open;`
- `getProductById` (lines 353–367): unchanged — already returns closed-shop products as `available = 0`.

### 2. API — `apps/api/src/controllers/dashboardController.js`

- `getDashboard` (line 384) and `getSectionItems` (line 535): parse the same param; in the two `product_block` queries (lines 451–462, 609–622) add `LEFT JOIN shops sh`, project `shop_is_open` (same `IF(...)`; `p.*` already carries `shop_id`), and drop only the `s.is_open = 1` fragment when the param is set (keep `s.active = 1`).
- `mapProductRows` (lines 337–361) and the inline `product_block` mapping in `getSectionItems` (lines 627–650): add
  ```js
  shopId / shop_id: r.shop_id ?? null,
  shopIsOpen / shop_is_open: r.shop_is_open === undefined ? 1 : r.shop_is_open,
  ```
- `cartController.js:54` and `orderController.js:222`: **DO NOT TOUCH** — checkout guards must keep excluding closed-shop items.

No DB migration needed.

### 3. Customer app — send the param

- `apps/customer-app/src/screens/customer/HomeScreen/HomeScreen.js:128` — add `include_closed_shops: 1` to `dashboardApi.getDashboard(...)` params.
- `apps/customer-app/src/screens/customer/ProductListScreen/ProductListScreen.js:103–124` — add `include_closed_shops: 1` to both `getSectionItems` and `getProducts` calls.
- HomeScreen search dropdown (`HomeScreen.js:802`) — leave without param (own non-card row UI; v1 keeps excluding behavior there).

### 4. Customer app — mapper `apps/customer-app/src/utils/apiMappers.js`

In `normalizeProduct` (after `available`, line 154), reuse existing `pickFirst`/`asBoolean` helpers:
```js
shopId: pickFirst(item.shopId, item.shop_id, null),
shopIsOpen: asBoolean(pickFirst(item.shopIsOpen, item.shop_is_open), true),
```
Default `true` keeps combos, cached payloads, detail responses behaving as today.

### 5. Customer app — `apps/customer-app/src/components/ProductCard/ProductCard.js`

Card treatment per user spec: **photo stays visible but grayscale, name/price stay, "Shop closed" text just above center, buy button locked.**

- Derived state near line 69: `const isShopClosed = !(product.shopIsOpen ?? product.shop_is_open ?? true);`
- Image grayscale: wrap the `ProductImage` (lines 217–223) in a View that, when closed, applies `filter: [{ grayscale: 1 }]` (RN 0.81; true B&W on Android) **plus** a light wash overlay `rgba(255,255,255,0.45)` absolute-fill (mutes color on iOS where color-matrix filters are unsupported, and reinforces the disabled look on Android).
- "Shop closed" label: absolute overlay, centered horizontally, positioned just above vertical center (`top: '38%'` approx) — small pill: dark text on translucent white pill so it reads over any photo. Styles next to `oosWash` (line 341).
- Buy control locked: in `renderControl()` (line 117), `isShopClosed` branch takes precedence — render disabled pill (reuse `outPill` styling) with label "Closed" + no handlers. Keep bottom name plate + price visible (user must see what the item is).
- Hide discount ribbon when closed (extend condition at line 254 with `&& !isShopClosed`).
- Outer `TouchableOpacity` (line 206): `disabled={isShopClosed}`, skip press animations, `accessibilityState={{ disabled: true }}`.
- Callers need **zero changes** — HomeScreen/ProductListScreen spread the full normalized product, flag arrives automatically.

### 6. Customer app — availability filter

`ProductListScreen.js:146–148`: "available only" filter must also drop closed-shop items:
```js
filtered = filtered.filter(p => p.available && p.shopIsOpen !== false);
```

## Tests

**API** (`cd apps/api && npm test`; follow `productCategory.test.js` mocked-pool pattern) — new `tests/productShopClosed.test.js`:
- `GET /api/products` without param → SQL still contains `s.is_open = 1` AND contains `shop_is_open` projection.
- With `include_closed_shops=1` → WHERE lacks `s.is_open = 1`, still has `s.active = 1`; mocked row `shop_is_open: 0` echoes as both `shop_is_open` and `shopIsOpen` in response.
- Offer path with param → same assertions.
- `GET /api/dashboard?include_closed_shops=1` + section items → mapped products carry both casings; without param SQL still excludes.
- Regression pin: cart query SQL still contains `s.is_open = 1`.

**Customer app** (`cd apps/customer-app && npm test`):
- `apiMappers` test: `shop_is_open: 0` → `shopIsOpen === false`; `1` → `true`; absent → `true`.
- ProductCard test (follow `HomeScreenCategoryGrid.test.js` pattern): closed product renders "Shop closed" text, buy control disabled/"Closed", touchable disabled; open product renders normal Buy.

## Verification

1. `apps/api && npm test` (rule from CLAUDE.md: run after each backend task).
2. Manual API: set a shop `is_open=0`; `curl /api/products` → products hidden; `curl '/api/products?include_closed_shops=1'` → present with `shop_is_open: 0`; house products (`shop_id NULL`) always `1`; `active=0` shop hidden in both modes. Same for dashboard endpoints.
3. Expo app: Home rails + ProductListScreen show grayscale cards with "Shop closed" label, buy locked; "available only" filter hides them; reopen shop → normal card after refresh.
4. Web PWA sanity: closed-shop products still absent (no param sent).

## Commits

Two commits: `feat(api): shop_is_open flag + include_closed_shops param on product lists`, then `feat(customer-app): grayscale shop-closed product cards`.
