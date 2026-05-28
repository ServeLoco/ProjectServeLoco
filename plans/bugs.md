# ServeLoco Bugs Repair Checklist

## Goal
This file is a step-by-step bug repair plan for the full ServeLoco project.
It covers customer mobile flows, admin UI flows, backend APIs, security risks,
money/number mismatches, and data integrity issues.

Work from top to bottom. Each bug has evidence, expected behavior, subtasks,
and a done checklist so another AI can implement without guessing.

## Working Rules For Agents
- Fix one bug at a time.
- Keep API response shapes backward compatible unless the task explicitly says otherwise.
- Add or update tests for backend controller/route behavior when possible.
- For mobile/admin UI bugs, run the available test/build command after the change.
- Do not silently change business rules. If a label and backend behavior disagree, either align both or rename the UI label.
- After code changes, run `graphify update .` from the repo root.

## Verification Commands
- Backend tests: `cd Backend-V1 && npm test -- --runInBand`
- Backend lint: `cd Backend-V1 && npm run lint`
- Mobile tests: `cd Frontend-V1 && npm test -- --runInBand`
- Mobile lint: `cd Frontend-V1 && npm run lint`
- Admin build: `cd adminManager-V1 && npm run build`
- Admin lint: `cd adminManager-V1 && npm run lint`

---

## Priority Order
- [x] P0 customer-facing broken flows: BUG-001, BUG-002, BUG-003, BUG-004, BUG-005, BUG-035
- [ ] P0 security/data safety: BUG-006, BUG-007, BUG-008, BUG-009
- [ ] P1 admin/dashboard/data correctness: BUG-010 through BUG-019, BUG-036, BUG-037, BUG-038
- [ ] P1 mobile UI correctness: BUG-020 through BUG-026
- [ ] P2 cleanup/hardening: BUG-027 through BUG-034

---

## BUG-001: Customer Notifications API Is Broken On Mobile

### Evidence
- `Frontend-V1/src/api/notificationsApi.js` imports `{ apiClient }` but calls `apiClient(...)` directly.
- `Frontend-V1/src/api/httpClient.js` exports `apiClient` as an object with `.get`, `.patch`, `.delete`, and `.request`.
- `Backend-V1/src/routes/notificationRoutes.js` applies `requireCustomer` to every notification endpoint.
- Current mobile notification calls do not pass `{ auth: 'customer' }`.

### Impact
The notification bell unread count, notification list, mark read, mark all read, and delete notification flows fail or silently return zero.

### Expected Behavior
All customer notification calls must use the customer token and the correct HTTP helper method.

### Checklist
- [x] Update `Frontend-V1/src/api/notificationsApi.js` to use `apiClient.get`, `apiClient.patch`, and `apiClient.delete`.
- [x] Pass `{ auth: 'customer' }` to every notification request.
- [x] Preserve the current exported function names and default export.
- [x] Normalize list responses so `data` is always an array of mapped notifications.
- [x] Keep `getUnreadCount()` returning a number.
- [x] Add or update a mobile API unit test if a test harness exists.
- [x] Manually verify the home bell count and notification screen after login.

---

## BUG-002: Delivery Cost Per Km Setting Is Ignored In Cart And Orders

### Evidence
- `adminManager-V1/src/pages/Settings.jsx` exposes "Delivery Cost Per Km".
- `Backend-V1/src/utils/deliveryPricing.js` calculates `distance * delivery_cost_per_km`.
- `Backend-V1/src/controllers/cartController.js` calls `calculateDeliveryPricing`, then overwrites charge with `calculateThresholdDeliveryCharge`.
- `Backend-V1/src/controllers/orderController.js` also validates distance, then overwrites charge with threshold delivery.
- `plans/locationtask.md` says delivery charge must be exact per-km pricing.

### Impact
Admin sees one delivery pricing model, but customers are charged by another. This is a direct money mismatch.

### Expected Behavior
One backend source of truth must calculate delivery range and final delivery charge.

### Checklist
- [x] Decide the intended business rule: per-km only, threshold only, or per-km plus free-delivery threshold.
- [x] Update `cartController.calculateCart` to use the selected rule consistently.
- [x] Update `orderController.createOrder` to use the same rule.
- [x] Ensure cart preview and final order creation produce the same delivery charge for the same items/location/settings.
- [x] Update delivery messages so the text matches the actual calculation.
- [x] Add backend tests for in-range per-km charge, out-of-range block, free delivery offer, and below-threshold behavior.
- [x] Verify admin order details show snapshots that match the actual charge.

---

## BUG-003: Minimum Order Amount Is Not Enforced Or Is Misnamed

### Evidence
- `Backend-V1/src/utils/thresholdDelivery.js` uses `minimum_order_amount` as a free-delivery threshold.
- `Frontend-V1/src/screens/customer/CheckoutScreen/CheckoutScreen.js` computes `isBelowMinimum` but does not use it to disable order placement.
- `Frontend-V1/src/screens/customer/CartScreen/CartScreen.js` only warns when below minimum.

### Impact
If the business expects a true minimum order, customers can still place smaller orders. If it is only a free-delivery threshold, the UI/admin label is misleading.

### Expected Behavior
The project should have either a true minimum order rule or a clearly named free-delivery threshold rule.

### Checklist
- [x] Confirm intended business behavior from existing plans or product owner.
- [x] If true minimum: block cart checkout and backend order creation below the threshold.
- [x] If threshold only: rename admin/mobile labels to "Free delivery above" or similar.
- [x] Add backend test for below-minimum order creation.
- [x] Update mobile warning copy and disabled button states.
- [x] Verify cart, checkout, and order API all agree.

---

## BUG-004: Reports Page Shows Misleading Revenue And Counts

### Evidence
- `adminManager-V1/src/pages/Reports.jsx` sends `{ period }`.
- `Backend-V1/src/controllers/adminController.js#getSalesReport` ignores the period query and always returns today/week/month totals.
- Reports UI expects `total_orders`, `status_breakdown`, `payment_breakdown`, and `payment_status`, but backend does not return them.
- Reports UI maps `all` revenue to month revenue when `total_revenue` is missing.

### Impact
Admin analytics can show wrong totals, zero orders, empty payment breakdowns, and incorrect all-time revenue.

### Expected Behavior
Reports must honor the selected period and return the fields the UI renders.

### Checklist
- [x] Update `getSalesReport` to accept `period=today|week|month|all`.
- [x] Return `total_revenue`, `total_orders`, `status_breakdown`, `payment_breakdown`, and `payment_status`.
- [x] Exclude cancelled orders consistently from revenue.
- [x] Decide whether pending-payment delivered orders count in revenue and document the rule.
- [x] Update `getTopProductsReport` to honor the same period.
- [x] Update `getCustomersReport` to honor period or change UI copy to "last 30 days/platform totals".
- [x] Add backend tests for each period.
- [x] Verify admin Reports summary cards and CSV export.

---

## BUG-005: Image Library Claims "In Use" Safety But Backend Deletes Referenced Images

### Evidence
- `adminManager-V1/src/pages/Images.jsx` renders `img.in_use` and says deletion will fail if image is in use.
- `Backend-V1/src/controllers/imageController.js#getImages` returns normalized Mongo image documents only; it does not compute `in_use`.
- `Backend-V1/src/controllers/imageController.js#deleteImage` deletes the file and Mongo document without checking products, categories, combos, offers, or settings.

### Impact
Admin can permanently delete an image still assigned to live content, causing broken product/category/offer/settings images.

### Expected Behavior
Image library should either prevent deletion of referenced images or clearly detach references safely.

### Checklist
- [x] Add backend reference checks across products, categories, combos, offers, and settings `upi_qr_image_id`.
- [x] Return `in_use` and `usage` metadata from `GET /admin/images`.
- [x] Block delete when referenced, returning a clear validation error.
- [x] Update admin Images UI to disable delete for `in_use` images.
- [x] Add backend tests for deleting used and unused images.
- [x] Verify product/category/offer/UPI QR images remain after image library actions.

---

## BUG-006: CORS Environment Key Mismatch Leaves Backend Wide Open

### Evidence
- `Backend-V1/src/app.js` reads `process.env.CORS_ALLOWED_ORIGINS`.
- `Backend-V1/src/config/env.js` defines `CORS_ORIGIN`.
- The app fallback includes `*`, accepting any browser origin.
- Root route aliases duplicate `/api` routes at `/auth`, `/admin`, etc.

### Impact
Deployments can think CORS is restricted while the app still accepts any origin. This increases exposure of token-based admin/customer APIs.

### Expected Behavior
One documented env key should control CORS. Production should not default to wildcard.

### Checklist
- [x] Standardize on `CORS_ALLOWED_ORIGINS` or `CORS_ORIGIN`.
- [x] Update `.env.example` and config validation.
- [x] In production, fail startup if allowed origins are missing or wildcard.
- [x] Keep local development origins explicit.
- [x] Decide whether root aliases are still required; if kept, document them.
- [x] Add a small CORS config test if feasible.

---

## BUG-007: Hard-Coded Local Admin Credentials Can Leak Into Non-Production Runs

### Evidence
- `Backend-V1/src/config/env.js` defines local defaults for `ADMIN_OWNER_ID` and `ADMIN_PASSWORD`.
- Production validation only checks JWT secret strength, not admin credential strength.

### Impact
If a deployment forgets `NODE_ENV=production`, default admin credentials may work.

### Expected Behavior
Admin credentials should be explicit secrets outside test/demo environments.

### Checklist
- [x] Remove real-looking admin defaults from shared config.
- [x] Allow defaults only when `NODE_ENV=test` or a deliberate demo flag is set.
- [x] Validate admin owner/password presence and strength for production-like environments.
- [x] Update documentation with placeholders only.
- [x] Add startup tests for missing/weak admin credentials.

---

## BUG-008: Upload Validation Trusts Client MIME Type

### Evidence
- `Backend-V1/src/routes/imageRoutes.js` accepts any upload whose `file.mimetype` starts with `image/`.
- The stored file keeps the original extension.
- Uploaded files are served publicly through Express static middleware.

### Impact
An admin or compromised admin session can upload SVG/polyglot/unexpected content that is then publicly served.

### Expected Behavior
Only known-safe image formats should be accepted and verified by content.

### Checklist
- [x] Add `file-type` or similar dependency. (Used native `Buffer` magic bytes check to avoid deps).
- [x] Update `imageRoutes.js` or `imageController.js` to inspect buffer magic bytes before saving.
- [x] Force the saved file extension to match the detected magic bytes.
- [x] Reject files if magic bytes do not indicate a safe image format (jpg, png, webp).
- [x] Add backend tests simulating an executable with a spoofed image MIME type, oversized files, and valid images.
- [x] Ensure static upload responses do not execute active content (handled by magic byte strictness, only jpg/png/webp/gif are allowed).

---

## BUG-009: Runtime DDL Runs Inside User/Admin Request Flows

### Evidence
- `Backend-V1/src/controllers/adminController.js#ensureOrderStatusEnum` runs `ALTER TABLE orders` during status update.
- `Backend-V1/src/controllers/orderController.js#createOrder` checks `INFORMATION_SCHEMA` and may run `ALTER TABLE order_items` during checkout.

### Impact
Requests can fail or hang if the DB user lacks DDL permissions. Runtime table alterations can lock tables and break checkout/admin updates.

### Expected Behavior
Schema changes belong in migrations only.

### Checklist
- [x] Move order status enum migration into `Backend-V1/src/db/migrate.js`.
- [x] Move `order_items.item_type` migration into `Backend-V1/src/db/migrate.js`.
- [x] Remove runtime `ALTER TABLE` calls from controllers.
- [x] Add startup or migration documentation requiring migrations before deploy.
- [x] Add tests that status update and order create do not issue DDL.

---

## BUG-010: Admin Mobile Dashboard Store Filter Is Ignored

### Evidence
- `adminManager-V1/src/pages/MobileDashboard.jsx` calls `MobileDashboardApi.listSections({ store_type: storeType })`.
- `adminManager-V1/src/api/index.js` defines `listSections: () => apiClient('/admin/dashboard-sections')`, ignoring params.

### Impact
Packed and Fast Food sections can appear together. Reordering can then update display order across mixed store modes.

### Expected Behavior
The selected store-mode tab should show and reorder only sections for that mode.

#### Checklist
- [x] Update `MobileDashboardApi.listSections(params)` to pass `params` via query string (`apiClient.get('/admin/dashboard-sections', { params })`).
- [x] Ensure backend `getDashboardSections` honors the `store_type` query param if provided.
- [x] Update `MobileDashboardApi.reorderSections` to only send IDs matching the current store mode, or pass the `store_type`.
- [x] Add backend tests for store-type filtering on dashboard sections.
- [x] Verify the admin Mobile Dashboard correctly isolates Packed vs Fast Food sections.

---

## BUG-011: Dashboard Category Grid Ignores Curated Section Items

### Evidence
- `Backend-V1/src/controllers/dashboardController.js#getDashboard` returns derived categories for `category_grid` via `getDefaultCategoryItems`.
- `getSectionItems` for a `category_grid` also returns all active categories, not assigned `dashboard_section_items`.
- Admin Mobile Dashboard UI allows assigning category items, implying curated category grids are supported.

### Impact
Admin can assign/remove/reorder category-grid items, but public mobile output ignores those choices.

### Expected Behavior
Either category grid is always derived and the admin item picker should be removed, or category grid is curated and public APIs must honor assigned items.

### Checklist
- [x] Decide derived vs curated category-grid behavior. (Curated with derived fallback).
- [x] If derived: remove category item assignment UI for category-grid sections and explain ordering comes from categories. (Skipped, chose curated).
- [x] If curated: update public `getDashboard` and `getSectionItems` to join `dashboard_section_items` for categories.
- [x] Preserve fallback derived categories only when no curated category-grid section exists (or if it has 0 items).
- [x] Add tests for new category visibility and curated order.

---

## BUG-012: Combo Validation Allows Unavailable Child Products

### Evidence
- `Backend-V1/src/controllers/comboController.js#validateComboItems` selects `deleted` but not `available`.
- Public dashboard combo hydration filters child products by `available = 1`, so saved combos can later show fewer child items than admin configured.

### Impact
Admin can save combos containing unavailable products. Customer UI may show an incomplete combo or hide it in some flows.

### Expected Behavior
Combos should only contain existing, non-deleted, available normal products from the same store type.

### Checklist
- [x] Include `p.available` in combo item validation query.
- [x] Reject unavailable child products with a clear message.
- [x] Add backend tests for unavailable, deleted, duplicate, nested combo, and cross-mode child products.
- [x] Recheck dashboard combo fallback and product detail combo display.

---

## BUG-013: Combo Create/Update Is Not Transactional

### Evidence
- `createCombo` inserts into `combos`, then separately saves `combo_items`.
- `updateCombo` updates the combo, then separately deletes/inserts items.

### Impact
If item save fails after the combo write, an orphan or partially updated combo can remain.

### Expected Behavior
Combo parent and child item writes should commit or roll back together.

### Checklist
- [ ] Use `pool.getConnection()` and a transaction for create/update.
- [ ] Validate combo items before writing where possible.
- [ ] Keep image deletion outside the transaction or defer it until after successful commit.
- [ ] Add backend tests for item insert failure rollback.

---

## BUG-014: Product Detail Can Crash With More Than Four Related Products

### Evidence
- `Frontend-V1/src/screens/customer/ProductDetailScreen/ProductDetailScreen.js` creates four animation values.
- The screen maps all `relatedProducts` and indexes `staggerRelatedAnims[idx]`.
- If there are more than four related products, `staggerRelatedAnims[idx]` is undefined and `.interpolate` can crash.

### Impact
Opening product detail can crash for products that return more than four related items.

### Expected Behavior
Related products should render safely for any reasonable count.

### Checklist
- [ ] Limit related products to the animation array length, or create animation values based on related count.
- [ ] Add a fallback animated value or render without animation for extra items.
- [ ] Add a component test or manual mock with five related products.

---

## BUG-015: Product And Combo ID Spaces Can Collide In Product Detail

### Evidence
- Products and combos are stored in separate tables with independent integer IDs.
- `Backend-V1/src/controllers/productController.js#getProductById` falls back to loading a combo when product ID is not found and no combo type is requested.
- Mobile cart/order payloads carry only `productId` plus a type flag.

### Impact
Direct API calls, stale links, or route params can load a combo when a product was expected if IDs overlap.

### Expected Behavior
Product detail should require explicit type when querying the combo table, or use globally unique IDs.

### Checklist
- [ ] Remove implicit combo fallback from `GET /products/:id` unless a backward compatibility test requires it.
- [ ] Ensure all mobile navigations pass `type: 'product'` or `type: 'combo'`.
- [ ] Consider separate `/combos/:id` public endpoint.
- [ ] Add backend tests for product ID missing but combo ID existing.

---

## BUG-016: Customer Profile WhatsApp Field Names Do Not Match

### Evidence
- Backend returns `whatsapp_number`.
- `Frontend-V1/src/screens/customer/ProfileScreen/ProfileScreen.js` reads `profile?.whatsapp`.
- `Frontend-V1/src/screens/customer/EditProfileScreen/EditProfileScreen.js` initializes from `profile?.whatsapp`.
- `updateProfile` backend returns only a message, so the mobile app fabricates a local profile shape.

### Impact
WhatsApp can disappear after refresh/relogin even though it exists in the database.

### Expected Behavior
Mobile should consistently normalize `whatsapp_number` to the field it renders, or render both.

### Checklist
- [ ] Add a customer/profile mapper that maps `whatsapp_number` and `whatsappNumber` to `whatsapp`.
- [ ] Use it for login, signup, `/auth/me`, and profile update.
- [ ] Make `updateProfile` return the updated user without password fields.
- [ ] Update Profile and EditProfile screens to use the normalized shape.
- [ ] Add tests for profile normalization.

---

## BUG-017: Reports And Top Products Do Not Distinguish Products From Combos

### Evidence
- `order_items` stores `product_id` and `item_type`.
- Admin dashboard/top product report groups by `product_id` and `product_name`, but not `item_type`.
- UI labels everything as product sales.

### Impact
Combo sales can be mixed into product reports or mislabeled. If a combo and product share IDs/names, analytics can be misleading.

### Expected Behavior
Reports should include item type or split product and combo performance.

### Checklist
- [ ] Include `oi.item_type` in top-products queries and grouping.
- [ ] Decide UI label: "Top Items" or separate "Top Products" and "Top Combos".
- [ ] Update admin dashboard and Reports rendering.
- [ ] Add report tests with one product and one combo.

---

## BUG-018: Admin Product And Combo Pagination UI Is Fake

### Evidence
- Admin Products and Combos pages send `page` and `limit`.
- Backend `getAdminProducts` and `getAdminCombos` ignore `page`/`limit` and do not return pagination.
- UI still renders previous/next controls with default pagination state.

### Impact
Large catalogs load all rows. Pagination controls mislead admin and do not actually page.

### Expected Behavior
Backend should paginate, or the admin UI should remove pagination controls.

### Checklist
- [ ] Add page/limit validation to admin product and combo list endpoints.
- [ ] Return `pagination` consistently.
- [ ] Keep max limit capped, for example 100.
- [ ] Update UI to use returned pagination.
- [ ] Add backend tests for page 1, page 2, invalid page, and limit cap.

---

## BUG-019: Admin Order/Audit/Notification Pagination Is Weak Or Unbounded

### Evidence
- `getAdminOrders` parses `page` and `limit` directly and accepts negative/NaN/huge values.
- `getAuditLogs` and `getAdminNotifications` also parse page/limit directly.
- `validatePagination` exists but is not used consistently.

### Impact
Bad query params can cause SQL errors or expensive queries. Admin export paths can request very large limits.

### Expected Behavior
Every paginated endpoint should clamp page and limit.

### Checklist
- [ ] Use `validatePagination` for admin orders, audit logs, admin notifications, and customer notifications.
- [ ] Cap limit to a safe max.
- [ ] Return normalized page/limit in pagination response.
- [ ] Add tests for negative, zero, non-numeric, and huge limits.

---

## BUG-020: Category Chips Can Filter Out All Categories

### Evidence
- `Frontend-V1/src/screens/customer/CategoriesScreen/CategoriesScreen.js` initializes default chips: `All`, `Bestsellers`, `New Arrivals`, `Offers`.
- The screen filters categories by `category.subcategories`.
- Backend category rows do not consistently provide those subcategories.

### Impact
Selecting a default chip can hide all real categories.

### Expected Behavior
Only chips backed by data should filter categories.

### Checklist
- [ ] Remove fake default chips or make them non-filtering shortcuts.
- [ ] Build chips from actual category metadata if needed.
- [ ] Keep `All` as the only default filter unless data supports more.
- [ ] Manual QA: packed and fast_food categories remain visible.

---

## BUG-021: Public "All" Store Type Silently Means Packed

### Evidence
- `productController.getProducts`, `categoryController.getCategories`, and dashboard helper `getExpectedStoreType` map missing or `all` store type to `packed`.
- `ProductListScreen` defaults `storeType` to `all` in some routes.

### Impact
"All products" or fallback navigations can show packed items only, not all store modes.

### Expected Behavior
Either all means all, or the UI should never say all when it means packed.

### Checklist
- [ ] Decide whether public APIs support true `all`.
- [ ] If true all: update backend filters to omit store filter for `all`.
- [ ] If not: change mobile defaults and labels to explicit packed/fast_food.
- [ ] Add tests for `type=all`, missing type, packed, and fast_food.

---

## BUG-022: Home Dashboard Failures Are Hidden

### Evidence
- `HomeScreen.loadHomeData` uses `Promise.allSettled`.
- If dashboard fetch fails, it only leaves prior/empty sections and clears loading.
- Notification unread failures are swallowed.

### Impact
Customer can see an empty home screen without a clear error or retry path.

### Expected Behavior
Dashboard failure should show an error state with retry, while non-critical notification failure can stay silent.

### Checklist
- [ ] Track dashboard fetch errors separately from notification errors.
- [ ] Render a retryable error state if dashboard data fails and no cached sections exist.
- [ ] Keep pull-to-refresh available.
- [ ] Log or surface notification failure only in development if desired.

---

## BUG-023: Product Cards On Home Do Not Open Product Detail

### Evidence
- Home dashboard renders `ProductCard` for product/combo sections without passing `onPress` or wrapping the card with detail navigation.
- ProductList does navigate to ProductDetail on card press.

### Impact
Home cards are less useful; users can add items but may not inspect details from the first screen.

### Expected Behavior
Tapping the product area should open detail, while quantity controls still add/remove.

### Checklist
- [ ] Add a `handleProductPress` to HomeScreen.
- [ ] Pass `onPress` to ProductCard or wrap only the non-control area.
- [ ] Ensure quantity buttons do not also trigger navigation.
- [ ] Pass `type: 'combo'` for combo cards.

---

## BUG-024: Notification Payload Parsing Can Crash The List Endpoint

### Evidence
- `notificationController.getNotifications` calls `JSON.parse(r.action_payload)` without try/catch.

### Impact
One malformed notification row can make the entire inbox endpoint fail.

### Expected Behavior
Invalid action payload should not break notification listing.

### Checklist
- [ ] Add safe JSON parsing helper.
- [ ] Return `null` actionPayload when malformed.
- [ ] Optionally log malformed payload IDs for cleanup.
- [ ] Add backend test with invalid `action_payload`.

---

## BUG-025: Image Uploads Can Become Orphaned When Form Save Fails

### Evidence
- Product, category, combo, and offer drawers upload the image immediately.
- The image is only attached when the later form save succeeds.
- If save fails or the drawer is closed, uploaded images remain unused.

### Impact
Image library fills with orphan files. Admin may delete the wrong image later.

### Expected Behavior
Uploads should either be temporary until save, or the UI should show/manage unused images explicitly.

### Checklist
- [ ] Decide between temporary uploads or accepted orphan cleanup.
- [ ] If temporary: mark uploads pending and confirm on save.
- [ ] If accepted: expose unused image cleanup with safe delete checks.
- [ ] Warn admin if closing drawer after upload before save.
- [ ] Add tests for image usage metadata if implemented.

---

## BUG-026: Category Delete Can Orphan Products And Dashboard Items

### Evidence
- `categoryController.deleteCategory` soft-deletes a category without checking assigned products or dashboard items.
- Admin UI says delete will fail if products are assigned, but backend always returns success.

### Impact
Products in deleted categories can disappear from public mode-filtered lists while still existing in admin/product data.

### Expected Behavior
Backend and UI should agree: either block deletion while referenced or cascade a clear cleanup.

### Checklist
- [ ] Check products where `category_id = id AND deleted = 0`.
- [ ] Check dashboard section items referencing the category.
- [ ] Block delete with a clear count/message, or implement safe cascade.
- [ ] Update admin copy to match actual behavior.
- [ ] Add tests for deleting referenced and unreferenced categories.

---

## BUG-027: Several Update/Delete Endpoints Return Success For Missing Rows

### Evidence
- Category update/delete does not check affected rows.
- Product update can return success if no product row was updated.
- Product/combo availability updates can return `product: undefined` or `combo: undefined`.
- Customer trust/block updates do not verify the customer exists.
- Offer update/delete does not verify the offer exists.

### Impact
Admin UI can show success when nothing changed.

### Expected Behavior
Mutations should return 404 when the target row does not exist.

### Checklist
- [ ] Audit all admin mutation controllers for missing-row checks.
- [ ] Check existence before update/delete or inspect `affectedRows`.
- [ ] Return `{ code: 'NOT_FOUND' }` consistently.
- [ ] Add tests for each not-found mutation.

---

## BUG-028: Active Offer UI Says One Offer Replaces Another, Backend Does Not Enforce It

### Evidence
- Offers UI says the app may only display one active offer per mode and activating replaces the current one.
- Backend `createOffer` and `updateOffer` can leave multiple active offers for the same store type.
- `getActiveOffer` chooses the newest active offer by `ORDER BY id DESC LIMIT 1`.

### Impact
Admin sees multiple active offers even though only one may appear in some mobile flows.

### Expected Behavior
Either support multiple offers everywhere or enforce one active offer per store type.

### Checklist
- [ ] Decide single-active vs multi-active offer behavior.
- [ ] If single-active: deactivate other offers in the same store type inside a transaction.
- [ ] If multi-active: update UI copy and public APIs.
- [ ] Add tests for activating a second offer.

---

## BUG-029: Password Minimum Length UI Does Not Match Backend

### Evidence
- Mobile signup placeholder says "Minimum 6 characters".
- Backend register validation only checks password is a non-empty string.

### Impact
Users can create weak passwords despite UI guidance.

### Expected Behavior
Frontend and backend should enforce the same password rule.

### Checklist
- [ ] Add backend password length validation.
- [ ] Add frontend signup validation before submit.
- [ ] Add tests for short password rejection.
- [ ] Consider rate limits and password strength copy.

---

## BUG-030: Price Precision And Zero-Price Rules Are Inconsistent

### Evidence
- Admin product and combo price inputs use `step="1"`.
- Backend amount validation allows decimals and zero.
- Combo UI rejects price `<= 0`, but backend combo schema accepts zero.

### Impact
API clients can create zero-price combos/products, and admin UI prevents decimal prices even though DB supports DECIMAL(10,2).

### Expected Behavior
Money precision and minimum price rules should be consistent across UI and backend.

### Checklist
- [ ] Decide whether zero-price products/combos are allowed.
- [ ] If not allowed, add backend positive amount validation for product/combo price.
- [ ] Change admin price inputs to `step="0.01"` if decimals are supported.
- [ ] Add backend tests for zero, negative, and decimal prices.
- [ ] Verify totals still round with `money.js`.

---

## BUG-031: Combo Admin Text Contradicts Cart Behavior

### Evidence
- `adminManager-V1/src/pages/Combos.jsx` says combo products will be added separately to the customer cart.
- `Frontend-V1/src/stores/useCartStore.js` stores a combo as a single cart line with `type: 'combo'`.
- Backend order items store `item_type = 'combo'`.

### Impact
Admin may misunderstand what customers will see and what orders will contain.

### Expected Behavior
Admin text should match the actual cart/order model.

### Checklist
- [ ] Update combo help text to explain the combo is sold as one bundle line.
- [ ] Ensure order detail and invoice display combo child items if needed.
- [ ] Verify customer cart and admin order drawer show clear combo information.

---

## BUG-032: Soft-Delete Unique Keys With Nullable `deleted_at` Do Not Enforce Active Uniqueness

### Evidence
- `dashboard_sections` unique key includes `(store_type, slug, deleted_at)`.
- `dashboard_section_items` unique key includes `(section_id, item_type, item_id, deleted_at)`.
- In MySQL, unique indexes allow multiple rows when an indexed column is NULL.

### Impact
The DB may allow duplicate active slugs/items if application checks race or fail.

### Expected Behavior
Active uniqueness should be enforced reliably.

### Checklist
- [ ] Replace nullable `deleted_at` uniqueness with generated active key or `is_deleted` flag.
- [ ] Keep application duplicate checks.
- [ ] Add migration that cleans existing duplicates first.
- [ ] Add tests or migration notes for duplicate active section/item inserts.

---

## BUG-033: Customer Tokens Persist In AsyncStorage And Admin Tokens In LocalStorage

### Evidence
- Mobile auth persists token via AsyncStorage.
- Admin auth stores token in localStorage.

### Impact
Tokens are vulnerable to device compromise on mobile and XSS on admin web.

### Expected Behavior
Use storage appropriate to the threat model.

### Checklist
- [ ] For admin web, consider httpOnly secure cookies or hardened XSS protections plus short token lifetime.
- [ ] For mobile, consider Expo SecureStore or platform secure storage.
- [ ] Add logout-on-401 behavior for mobile similar to admin.
- [ ] Review JWT expiry duration and refresh strategy.

---

## BUG-034: Dependency Audit Advisories Remain

### Evidence
- Backend audit found 0 vulnerabilities.
- Mobile audit reported moderate advisories through Expo/React Native tooling.
- Admin audit reported moderate advisories through Vite/esbuild tooling.

### Impact
Development tooling may carry known vulnerabilities. Some fixes may require breaking upgrades.

### Expected Behavior
Dependencies should be upgraded deliberately and tested.

### Checklist
- [ ] Run `npm audit` in each package.
- [ ] For mobile, plan Expo/React Native upgrade path instead of forcing blind major upgrades.
- [ ] For admin, upgrade Vite/esbuild when compatible.
- [ ] Run tests/build after dependency updates.
- [ ] Document any advisory accepted as dev-only risk.

---

## BUG-035: Admin Support Phone Setting Does Not Persist

### Evidence
- `adminManager-V1/src/pages/Settings.jsx` renders a `support_phone` input.
- `Backend-V1/src/controllers/settingsController.js` update whitelist does not include `support_phone`.
- `Frontend-V1/src/utils/apiMappers.js` maps mobile `supportPhone` from `support_phone`, then falls back to `whatsapp_number`.

### Impact
Admins can enter a support phone number and save settings, but the backend drops the value. Mobile users may then see the WhatsApp number as the support phone, which is wrong if the shop uses different numbers for calls and WhatsApp.

### Expected Behavior
Support Phone should either persist as its own setting or be removed/renamed so the UI does not promise a separate number.

### Checklist
- [ ] Confirm whether `support_phone` should be separate from `whatsapp_number`.
- [ ] If separate, add `support_phone` to settings initialization/schema.
- [ ] Add `support_phone` to the backend update whitelist.
- [ ] Ensure settings GET returns `support_phone`.
- [ ] Keep mobile mapper behavior explicit: use `support_phone` first and only fall back intentionally.
- [ ] Add backend tests for saving and reading `support_phone`.
- [ ] Verify admin settings reload shows the saved support phone.
- [ ] Verify mobile app displays the saved support phone.

### Suggested Implementation Steps For Another AI
1. Inspect `Backend-V1/src/config/schema.js` and `Backend-V1/src/controllers/settingsController.js`.
2. Add `support_phone` everywhere settings keys are created, updated, validated, and returned.
3. Save a unique Support Phone from the admin settings page.
4. Reload admin settings and confirm the value remains.
5. Load mobile settings/contact data and confirm the same value is used.

---

## BUG-036: Admin Broadcast Notifications Can Leave Partial Data After Failure

### Evidence
- `Backend-V1/src/utils/notificationService.js` creates a notification batch first.
- It then inserts recipient notification rows in chunks.
- Those steps are not wrapped in one transaction.
- `Backend-V1/src/controllers/adminController.js` can return a failure even after some notification data has already been committed.

### Impact
Admin may see a failed broadcast while some users still receive the notification. A batch can exist with only some intended recipients, and retries can create duplicate or confusing notification history.

### Expected Behavior
Broadcast notification creation should be atomic: either the batch and every recipient row are created, or nothing visible is committed.

### Checklist
- [ ] Wrap notification batch creation and recipient row creation in one database transaction.
- [ ] Roll back the batch if any recipient insert chunk fails.
- [ ] Return structured errors for validation failure versus database failure.
- [ ] Decide whether retry needs an idempotency key or duplicate prevention.
- [ ] Log failed broadcast attempts without creating visible partial records.
- [ ] Add tests for successful broadcast, failed recipient insert rollback, and retry behavior.

### Suggested Implementation Steps For Another AI
1. Update `notificationService.createBroadcastNotification` to use a transaction client.
2. Begin the transaction before inserting the notification batch.
3. Insert all recipient rows with the same transaction client.
4. Commit only after every chunk succeeds.
5. Roll back on any exception and return/rethrow a typed error.
6. Extend notification tests to simulate a chunk failure after the batch insert.

---

## BUG-037: Display Order Allows Negative Values And Bypasses Duplicate Checks

### Evidence
- Admin route validation checks display order is an integer in several places.
- Some controllers only run duplicate display-order checks when `displayOrder > 0`.
- Negative display order values can pass integer validation and bypass duplicate checks.
- This affects category, product, combo, and dashboard ordering paths.

### Impact
Negative values can sort before valid items and unexpectedly change storefront/admin ordering. Duplicate negative values may be accepted, leaving ordering behavior hard to reason about.

### Expected Behavior
Display order should have one consistent range rule across all admin-managed sortable entities.

### Checklist
- [ ] Decide the allowed range, usually `0` for unset and positive integers for explicit order.
- [ ] Reject negative `display_order` values at route validation level.
- [ ] Normalize blank/null display order consistently.
- [ ] Ensure duplicate checks run for every explicit value that should be unique.
- [ ] Apply the same validation rules to categories, products, combos, dashboard sections, and dashboard items.
- [ ] Ensure admin number inputs do not allow negative values.
- [ ] Add tests for negative, zero, duplicate positive, and valid positive display orders.

### Suggested Implementation Steps For Another AI
1. Search backend references to `display_order`, `displayOrder`, and `displayOrderNum`.
2. Replace loose integer validation with explicit min-range validation.
3. Make controllers treat `0` or null consistently as "no explicit order".
4. Make duplicate queries match the same explicit-order definition used by validation.
5. Patch admin UI numeric inputs with the same minimum value.
6. Add regression tests for each affected entity type.

---

## BUG-038: Image Library Date Field Mismatch Can Show Invalid Date

### Evidence
- `Backend-V1/src/controllers/imageController.js` stores and returns image metadata with `createdAt`.
- `adminManager-V1/src/pages/Images.jsx` renders the image date using `img.created_at`.
- If no mapper converts `createdAt` to `created_at`, the UI can render `Invalid Date` or blank date text.

### Impact
The admin image library can show incorrect upload dates. This makes uploaded assets harder to audit and can break future date-based sorting or filtering.

### Expected Behavior
Image metadata field names should be normalized at the API boundary, and the UI should never render `Invalid Date`.

### Checklist
- [ ] Confirm the actual `/api/admin/images` response shape in browser network tools or an API test.
- [ ] Choose one image DTO naming convention for admin responses.
- [ ] Either return `created_at` from the backend or map `createdAt` to `created_at` in the admin API client.
- [ ] Add safe fallback rendering for missing dates.
- [ ] Add image metadata normalization test coverage.
- [ ] Verify image list, image detail, and delete flows all use the same date field.

### Suggested Implementation Steps For Another AI
1. Open the Image Library in admin and inspect the image list API response.
2. Patch the backend response or frontend mapper according to the existing DTO pattern.
3. Render `Unknown date` or equivalent when the date is absent.
4. Add a regression test using a sample response with `createdAt`.
5. Confirm no image card renders `Invalid Date`.
