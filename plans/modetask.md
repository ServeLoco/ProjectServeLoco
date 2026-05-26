# Packed Items And Fast Food Mode Separation Tasks

## Goal
Make `Packed Items` and `Fast Food` work as two separate app modes.

The customer can switch between modes on the mobile dashboard. After choosing a mode, everything shown on the dashboard must belong to that mode only:

- Offer banners
- Categories
- Products
- Combos
- Product blocks / custom dashboard sections
- Combo blocks / custom dashboard sections
- See All pages
- Category product lists
- Search results when opened from that mode

The cart, checkout, payment, order creation, order history, and admin order handling stay shared. A customer may add items from either mode to the same cart unless a separate future rule says otherwise.

Admin must manage the two modes separately from the web admin panel. When admin creates or edits offers, categories, products, combos, and dashboard sections, admin must choose whether that content belongs to `Packed Items` or `Fast Food`.

---

## Mode Definitions

### Store type values
- `packed` means Packed Items.
- `fast_food` means Fast Food.

### Source of mode truth
- Products get their mode from their assigned category.
- Categories already have `type`.
- Combos need their own mode, or a derived mode from their child products with strict validation.
- Offers need their own mode.
- Dashboard sections already have `store_type`, but the app currently still lets common items leak into mode-specific sections.

### Mode rule
- A packed screen must not show fast-food categories/products/combos/offers/sections.
- A fast-food screen must not show packed categories/products/combos/offers/sections.
- A combo can only contain products from one mode.
- A combo must appear only in its own mode.
- A dashboard section must only contain items from the same mode.
- Existing `all` behavior should be treated as legacy and migrated carefully. New admin-created customer content should require a real mode unless we explicitly add a "show in both" feature.

---

## Current Bugs Found

### Bug 1: Combos are common across both modes
Current `combos` table has no `store_type`.

Files:
- `Backend-V1/src/db/migrate.js`
- `Backend-V1/src/controllers/comboController.js`
- `Backend-V1/src/controllers/dashboardController.js`
- `adminManager-V1/src/pages/Combos.jsx`

Impact:
- Packed combos can appear in Fast Food.
- Fast Food combos can appear in Packed Items.
- Admin cannot clearly create different combo groups for different modes.

Example current code issue:
- `getDefaultComboItems(expectedStoreType)` accepts `expectedStoreType`, but it never uses it when querying combos.
- `getLinkedItemInfo('combo')` returns `storeType: 'all'`, so mode-specific section validation does not block wrong combos.

### Bug 2: Offers are common across both modes
Current `offers` table has no `store_type`.

Files:
- `Backend-V1/src/db/migrate.js`
- `Backend-V1/src/controllers/settingsController.js`
- `Backend-V1/src/controllers/dashboardController.js`
- `adminManager-V1/src/pages/Offers.jsx`

Impact:
- A Packed Items offer banner can appear in Fast Food.
- Admin cannot create separate offer banners for each mode.
- "Shop Offer" can take the user to a list that is not mode-scoped.

### Bug 3: Dashboard sections support `store_type`, but item validation is incomplete
Sections have `store_type`, but combo and offer items return `all` during validation.

Files:
- `Backend-V1/src/controllers/dashboardController.js`
- `adminManager-V1/src/pages/MobileDashboard.jsx`

Impact:
- Admin can add common combos/offers to mode-specific sections.
- Section item picker does not filter candidates by the selected section mode.
- A Fast Food section can accidentally contain Packed Items content.

### Bug 4: Default combo fallback ignores selected mode
When no combo section is configured, the backend creates a default `Popular Combos` section and loads all combos.

Files:
- `Backend-V1/src/controllers/dashboardController.js`

Impact:
- Even if dashboard sections are mode-filtered, fallback combo blocks can leak wrong-mode combos.

### Bug 5: `See All` for combo sections ignores mode
`GET /api/dashboard/sections/:slug/items` receives `storeType`, but combo-block query does not filter combos by mode.

Files:
- `Backend-V1/src/controllers/dashboardController.js`
- `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js`
- `Frontend-V1/src/screens/customer/ProductListScreen/ProductListScreen.js`

Impact:
- Dashboard may show a small filtered list later, but "See All" can show combos from both modes.

### Bug 6: Product search/list flow does not consistently carry current mode
Home search opens ProductList without `storeType`. Category press passes category id, but search mode is global.

Files:
- `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js`
- `Frontend-V1/src/screens/customer/CategoriesScreen/CategoriesScreen.js`
- `Frontend-V1/src/screens/customer/ProductListScreen/ProductListScreen.js`
- `Backend-V1/src/controllers/productController.js`

Impact:
- Search from Packed Items can show Fast Food products.
- Search from Fast Food can show Packed Items products.
- Static filter chips on ProductList are shared and not mode-aware.

### Bug 7: Admin Products page has no mode filter
Products are mode-derived through category, but the admin page only filters by category and does not clearly separate Packed Items and Fast Food.

Files:
- `adminManager-V1/src/pages/Products.jsx`
- `Backend-V1/src/controllers/productController.js`

Impact:
- Admin can accidentally edit/add a product into the wrong mode category.
- Category dropdown mixes Packed and Fast Food categories.

### Bug 8: Admin Combo form allows products from mixed modes
Combo item picker loads all available products without a mode filter.

Files:
- `adminManager-V1/src/pages/Combos.jsx`
- `Backend-V1/src/controllers/comboController.js`

Impact:
- Admin can build a combo with Packed Items and Fast Food products together.
- The backend currently does not reject mixed-mode combo children.

### Bug 9: Section slug uniqueness may block separate same-named sections per mode
Dashboard section slug is currently unique across all modes.

Files:
- `Backend-V1/src/db/migrate.js`
- `Backend-V1/src/controllers/dashboardController.js`

Impact:
- Admin may want `popular-combos` for Packed Items and `popular-combos` for Fast Food, but global slug uniqueness can block it.
- Public See All lookup by slug alone can fetch the wrong section if duplicate slugs are later allowed.

### Bug 10: Admin reorder may mix mode ordering
Admin reorder sends one full section list and backend writes display order globally.

Files:
- `Backend-V1/src/controllers/dashboardController.js`
- `adminManager-V1/src/pages/MobileDashboard.jsx`

Impact:
- Reordering Packed sections can affect Fast Food section ordering.
- Display order conflicts are checked per store type when saving, but reorder endpoint is not mode-scoped.

---

## Acceptance Criteria

- Packed dashboard only shows packed content.
- Fast Food dashboard only shows fast-food content.
- Packed category page only shows packed categories.
- Fast Food category page only shows fast-food categories.
- Packed search only searches packed products/combos/offers.
- Fast Food search only searches fast-food products/combos/offers.
- Packed combo sections only show packed combos.
- Fast Food combo sections only show fast-food combos.
- Admin must choose mode when creating/editing offers, combos, and dashboard sections.
- Admin product category picker must make mode visible and preferably filter by mode.
- Admin combo item picker must show only products from the combo mode.
- Backend must reject cross-mode section items and mixed-mode combo items.
- Cart, checkout, order creation, payment, and order history must continue working exactly as before.

---

## Task 1: Confirm Current Mode Data Model

### Goal
Audit all database tables and APIs that should be mode-aware.

### Files likely checked
- `Backend-V1/src/db/migrate.js`
- `Backend-V1/src/controllers/categoryController.js`
- `Backend-V1/src/controllers/productController.js`
- `Backend-V1/src/controllers/comboController.js`
- `Backend-V1/src/controllers/settingsController.js`
- `Backend-V1/src/controllers/dashboardController.js`
- `adminManager-V1/src/pages/Products.jsx`
- `adminManager-V1/src/pages/Combos.jsx`
- `adminManager-V1/src/pages/Offers.jsx`
- `adminManager-V1/src/pages/MobileDashboard.jsx`
- `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js`
- `Frontend-V1/src/screens/customer/ProductListScreen/ProductListScreen.js`
- `Frontend-V1/src/screens/customer/CategoriesScreen/CategoriesScreen.js`

### Subtasks
- [ ] Confirm category mode is stored in `categories.type`.
- [ ] Confirm products derive mode from their category.
- [ ] Confirm combos do not currently store mode.
- [ ] Confirm offers do not currently store mode.
- [ ] Confirm dashboard sections store mode in `dashboard_sections.store_type`.
- [ ] Confirm dashboard section items do not store mode directly.
- [ ] Confirm public dashboard API receives `storeType`.
- [ ] Confirm public product list API can filter by category type.
- [ ] Confirm admin pages do not consistently filter by mode.

### Things to avoid
- [ ] Do not change checkout/order/cart behavior in this review.
- [ ] Do not remove existing content during audit.
- [ ] Do not guess data migration defaults without checking real database rows.

### Testing checklist
- [ ] Existing mobile dashboard still loads before implementation.
- [ ] Existing admin pages still load before implementation.

---

## Task 2: Add Mode Fields To Combos And Offers

### Goal
Give combos and offers their own mode so they can be managed separately.

### Backend schema changes
Add to `combos`:
- `store_type ENUM('packed', 'fast_food') NOT NULL DEFAULT 'packed'`
- Index `idx_combo_store_type`

Add to `offers`:
- `store_type ENUM('packed', 'fast_food') NOT NULL DEFAULT 'packed'`
- Index `idx_offer_store_type`

### Files likely changed
- `Backend-V1/src/db/migrate.js`
- Any existing migration helper file if separate migration system is used

### Subtasks
- [ ] Add `store_type` column to `combos`.
- [ ] Add `store_type` column to `offers`.
- [ ] Add safe `ensureColumn` calls for existing installations.
- [ ] Add indexes for mode filtering.
- [ ] Backfill old combos using child product categories if possible.
- [ ] If a combo has mixed child product modes, mark it as `packed` temporarily and list it in an admin cleanup report/log.
- [ ] Backfill old offers to `packed` or create a manual admin migration task if real mode cannot be inferred.

### Things to avoid
- [ ] Do not use `all` for new combo/offer records unless product owner explicitly wants "show in both".
- [ ] Do not delete existing combos/offers.
- [ ] Do not break old rows with null values.

### Testing checklist
- [ ] Migration runs on a fresh database.
- [ ] Migration runs on an existing database.
- [ ] Existing combos still load.
- [ ] Existing offers still load.

---

## Task 3: Backend Mode Normalization Helper

### Goal
Create one reusable way to normalize mode names.

### Files likely changed
- `Backend-V1/src/utils/storeMode.js`
- `Backend-V1/src/controllers/productController.js`
- `Backend-V1/src/controllers/categoryController.js`
- `Backend-V1/src/controllers/comboController.js`
- `Backend-V1/src/controllers/settingsController.js`
- `Backend-V1/src/controllers/dashboardController.js`

### Subtasks
- [ ] Create helper `normalizeStoreType(value, options)`.
- [ ] Accept UI labels: `Packed Items`, `Fast Food`.
- [ ] Accept API values: `packed`, `fast_food`.
- [ ] Reject unknown values.
- [ ] For public APIs, default dashboard mode to `packed` if missing.
- [ ] For admin create/update APIs, require explicit mode for combos/offers/sections.
- [ ] Keep backwards compatibility only where needed for old clients.

### Things to avoid
- [ ] Do not use inconsistent strings like `fastfood`, `fast-food`, or `FastFood`.
- [ ] Do not let invalid modes silently become `packed` on admin writes.

### Testing checklist
- [ ] `Packed Items` normalizes to `packed`.
- [ ] `Fast Food` normalizes to `fast_food`.
- [ ] Invalid mode returns validation error on admin writes.

---

## Task 4: Update Combo Backend APIs For Mode

### Goal
Combos must be mode-specific and must not mix child products from different modes.

### Files likely changed
- `Backend-V1/src/controllers/comboController.js`
- `Backend-V1/src/routes/adminRoutes.js`
- `Backend-V1/src/controllers/productController.js`

### Subtasks
- [ ] Accept `store_type` when creating a combo.
- [ ] Accept `store_type` when editing a combo.
- [ ] Validate `store_type` is `packed` or `fast_food`.
- [ ] Return `store_type` from admin combo list/detail.
- [ ] Add `storeType` camelCase alias if frontend expects it.
- [ ] Add `store_type` query filter to admin combo list.
- [ ] Add `store_type` query filter to public combo/product endpoint when `isCombo=true`.
- [ ] In `validateComboItems`, load each child product's category type.
- [ ] Reject combo if any child product category type does not match combo `store_type`.
- [ ] Reject combo if child products contain both `packed` and `fast_food`.
- [ ] Keep duplicate product validation.
- [ ] Keep quantity validation.
- [ ] Keep combo cannot include another combo validation.

### Things to avoid
- [ ] Do not infer combo mode from the first selected product without showing/admin-saving that mode.
- [ ] Do not allow a Fast Food combo with Packed Items products.
- [ ] Do not allow a Packed combo with Fast Food products.

### Testing checklist
- [ ] Create packed combo with packed products succeeds.
- [ ] Create fast-food combo with fast-food products succeeds.
- [ ] Create packed combo with fast-food product fails.
- [ ] Create fast-food combo with packed product fails.
- [ ] Mixed-mode combo fails.
- [ ] Admin combo list filters by mode.
- [ ] Public dashboard combo block filters by mode.

---

## Task 5: Update Offer Backend APIs For Mode

### Goal
Offers must be mode-specific.

### Files likely changed
- `Backend-V1/src/controllers/settingsController.js`
- `Backend-V1/src/routes/adminRoutes.js`
- `Backend-V1/src/controllers/dashboardController.js`

### Subtasks
- [ ] Accept `store_type` when creating an offer.
- [ ] Accept `store_type` when editing an offer.
- [ ] Validate `store_type` is `packed` or `fast_food`.
- [ ] Return `store_type` from offer list/detail.
- [ ] Add `store_type` query filter to admin offer list.
- [ ] Update active offer endpoint to accept `storeType`.
- [ ] Update dashboard offer banner queries to filter offers by mode.
- [ ] Update section item validation so offer item mode must match section mode.

### Things to avoid
- [ ] Do not show Fast Food offers on Packed dashboard.
- [ ] Do not show Packed offers on Fast Food dashboard.
- [ ] Do not rely only on section `store_type`; offer itself must also have mode.

### Testing checklist
- [ ] Packed active offer only returns packed offer.
- [ ] Fast Food active offer only returns fast-food offer.
- [ ] Dashboard offer banner filters correctly.
- [ ] Admin can create/edit offers with mode.

---

## Task 6: Fix Dashboard Section Backend Mode Rules

### Goal
Dashboard sections and their items must be mode-safe.

### Files likely changed
- `Backend-V1/src/controllers/dashboardController.js`
- `Backend-V1/src/db/migrate.js`

### Subtasks
- [ ] Require `store_type` as `packed` or `fast_food` for new customer-facing sections.
- [ ] Decide what to do with existing `all` sections:
  - [ ] Keep as legacy during migration.
  - [ ] Or duplicate into one packed section and one fast-food section.
- [ ] Update `getLinkedItemInfo('combo')` to return combo `store_type`.
- [ ] Update `getLinkedItemInfo('offer')` to return offer `store_type`.
- [ ] Keep `getLinkedItemInfo('product')` deriving from category type.
- [ ] Keep `getLinkedItemInfo('category')` using category type.
- [ ] Reject adding an item whose mode does not match section `store_type`.
- [ ] Reject adding `all` item to mode-specific section after migration.
- [ ] Filter `offer_banner` items by offer mode in public dashboard API.
- [ ] Filter `combo_block` items by combo mode in public dashboard API.
- [ ] Filter `getDefaultComboItems` by `expectedStoreType`.
- [ ] Filter `getSectionItems` combo block by `expectedStoreType`.
- [ ] Filter `getSectionItems` offer banner by `expectedStoreType`.
- [ ] Verify product block already filters by category type.
- [ ] Verify category grid already filters by category type.

### Things to avoid
- [ ] Do not only filter on frontend.
- [ ] Do not let `all` bypass mode isolation unless explicitly migrated.
- [ ] Do not allow empty sections to show blank cards.

### Testing checklist
- [ ] Packed dashboard returns only packed sections/items.
- [ ] Fast Food dashboard returns only fast-food sections/items.
- [ ] Packed See All returns only packed items.
- [ ] Fast Food See All returns only fast-food items.
- [ ] Cross-mode item add fails with a clear admin error.

---

## Task 7: Fix Dashboard Section Slug And See All Routing

### Goal
Allow separate packed and fast-food sections with the same human purpose without See All collisions.

### Current problem
Section lookup uses slug only:
- `/api/dashboard/sections/:slug/items`

If both modes need `popular-combos`, slug-only lookup can fetch the wrong section or force awkward unique slugs.

### Files likely changed
- `Backend-V1/src/db/migrate.js`
- `Backend-V1/src/controllers/dashboardController.js`
- `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js`
- `Frontend-V1/src/screens/customer/ProductListScreen/ProductListScreen.js`
- `adminManager-V1/src/pages/MobileDashboard.jsx`

### Subtasks
- [ ] Change uniqueness rule to `slug + store_type + deleted_at` or enforce unique generated slugs per mode.
- [ ] Update section lookup to use both `slug` and `storeType`.
- [ ] If storeType is missing in See All, return validation error or default safely to `packed`.
- [ ] Update frontend See All navigation to always pass `storeType`.
- [ ] Update admin duplicate slug validation to check per mode.
- [ ] Update slug conflict message to mention selected mode.

### Things to avoid
- [ ] Do not use slug alone after allowing duplicate slugs by mode.
- [ ] Do not break old links without a fallback.

### Testing checklist
- [ ] Packed `popular-combos` See All opens packed combos.
- [ ] Fast Food `popular-combos` See All opens fast-food combos.
- [ ] Admin can create same slug in different modes if allowed.
- [ ] Admin cannot create duplicate slug in same mode.

---

## Task 8: Fix Public Product List And Search Mode

### Goal
Product list and search must respect the selected app mode.

### Files likely changed
- `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js`
- `Frontend-V1/src/screens/customer/CategoriesScreen/CategoriesScreen.js`
- `Frontend-V1/src/screens/customer/ProductListScreen/ProductListScreen.js`
- `Backend-V1/src/controllers/productController.js`

### Subtasks
- [ ] Home search should navigate with `storeType: currentApiStoreType`.
- [ ] Category press from Home should navigate with `storeType: currentApiStoreType`.
- [ ] Category press from Categories screen should navigate with current normalized store type.
- [ ] ProductList should read `route.params.storeType`.
- [ ] ProductList should pass `type/storeType` to `productsApi.getProducts`.
- [ ] ProductList combo mode should pass `storeType` when requesting combos.
- [ ] ProductList section mode should already pass `storeType`; verify after backend changes.
- [ ] ProductList static category chips should be replaced with mode-aware categories or removed.
- [ ] Offer flow should pass `storeType` when opening offer product list.
- [ ] Backend product API should filter products by category type when `type/storeType` is passed.
- [ ] Backend product API should filter combos by combo `store_type` when `isCombo=true`.

### Things to avoid
- [ ] Do not show global search results across modes.
- [ ] Do not rely only on client-side filtering.
- [ ] Do not hardcode category names in ProductList.

### Testing checklist
- [ ] Packed search returns only packed products.
- [ ] Fast Food search returns only fast-food products.
- [ ] Packed category click returns only packed products.
- [ ] Fast Food category click returns only fast-food products.
- [ ] Packed combo See All returns only packed combos.
- [ ] Fast Food combo See All returns only fast-food combos.

---

## Task 9: Update Admin Products UI For Mode

### Goal
Make product management clearly separated by mode.

### Files likely changed
- `adminManager-V1/src/pages/Products.jsx`
- `Backend-V1/src/controllers/productController.js`
- `Backend-V1/src/controllers/categoryController.js`

### Subtasks
- [ ] Add mode filter tabs/segmented control: Packed Items, Fast Food.
- [ ] Filter category dropdown by selected mode.
- [ ] Show category mode badge in product table.
- [ ] When creating product, admin must choose category from current mode only.
- [ ] When editing product, show current mode from category.
- [ ] If admin changes category to another mode, confirm this moves the product to that mode.
- [ ] Add backend admin product filter by category type/mode.
- [ ] Keep products deriving mode from category, not a duplicate product field.

### Things to avoid
- [ ] Do not add separate product `store_type` unless there is a strong reason.
- [ ] Do not allow selecting hidden/deleted categories.
- [ ] Do not show combo records in product page.

### Testing checklist
- [ ] Packed Products page shows only packed products.
- [ ] Fast Food Products page shows only fast-food products.
- [ ] Create packed product saves under packed category.
- [ ] Create fast-food product saves under fast-food category.

---

## Task 10: Update Admin Combos UI For Mode

### Goal
Admin should create and manage separate combo lists for Packed Items and Fast Food.

### Files likely changed
- `adminManager-V1/src/pages/Combos.jsx`
- `Backend-V1/src/controllers/comboController.js`

### Subtasks
- [ ] Add mode filter tabs/segmented control.
- [ ] Add required `store_type` field in combo form.
- [ ] Default combo mode from selected admin mode tab.
- [ ] Filter combo list by selected mode.
- [ ] Filter combo member product picker by selected combo mode.
- [ ] Show mode badge in combo table.
- [ ] If editing combo mode, warn admin that selected products may become invalid.
- [ ] Remove/disable products in picker that do not match combo mode.
- [ ] Show clear validation error if backend rejects mixed-mode combo.

### Things to avoid
- [ ] Do not allow product picker to mix Packed and Fast Food.
- [ ] Do not ask for category on combos.
- [ ] Do not create one common combo list.

### Testing checklist
- [ ] Packed combo picker shows only packed products.
- [ ] Fast Food combo picker shows only fast-food products.
- [ ] Packed combo list shows only packed combos.
- [ ] Fast Food combo list shows only fast-food combos.
- [ ] Mixed-mode combo cannot be saved.

---

## Task 11: Update Admin Offers UI For Mode

### Goal
Admin should create and manage separate offers for each mode.

### Files likely changed
- `adminManager-V1/src/pages/Offers.jsx`
- `Backend-V1/src/controllers/settingsController.js`

### Subtasks
- [ ] Add mode filter tabs/segmented control.
- [ ] Add required `store_type` field in offer form.
- [ ] Default offer mode from selected admin mode tab.
- [ ] Filter offer list by selected mode.
- [ ] Show mode badge in offer table/cards.
- [ ] Ensure active offer selection is mode-specific.
- [ ] Clarify in UI that a packed offer appears only in Packed Items mode.
- [ ] Clarify in UI that a Fast Food offer appears only in Fast Food mode.

### Things to avoid
- [ ] Do not reuse one active offer for both modes unless "show in both" is explicitly added.
- [ ] Do not let an offer banner section include an offer from another mode.

### Testing checklist
- [ ] Packed offer appears only on Packed dashboard.
- [ ] Fast Food offer appears only on Fast Food dashboard.
- [ ] Admin can edit mode safely.

---

## Task 12: Update Admin Dashboard Section UI For Mode

### Goal
Make section management mode-first and prevent wrong-mode section items.

### Files likely changed
- `adminManager-V1/src/pages/MobileDashboard.jsx`
- `Backend-V1/src/controllers/dashboardController.js`

### Subtasks
- [ ] Add admin mode filter tabs: Packed Items, Fast Food.
- [ ] List sections for selected mode only.
- [ ] Create section modal should require mode.
- [ ] Default new section mode to selected tab.
- [ ] Candidate picker should fetch candidates for selected section mode.
- [ ] Product candidate picker should fetch only products from selected mode.
- [ ] Category candidate picker should fetch only categories from selected mode.
- [ ] Combo candidate picker should fetch only combos from selected mode.
- [ ] Offer candidate picker should fetch only offers from selected mode.
- [ ] Show item mode badges in candidate rows.
- [ ] Show item mode badges in assigned item rows.
- [ ] If selected section is `packed`, block fast-food candidates client-side before API call.
- [ ] If selected section is `fast_food`, block packed candidates client-side before API call.
- [ ] Backend still must enforce this even if frontend misses it.
- [ ] Reorder sections only inside selected mode.
- [ ] Reorder section items only inside the selected section.

### Things to avoid
- [ ] Do not present "All Shop Items" as default for customer-visible sections.
- [ ] Do not allow silent cross-mode item assignment.
- [ ] Do not reorder all modes together.

### Testing checklist
- [ ] Packed section list shows packed sections.
- [ ] Fast Food section list shows fast-food sections.
- [ ] Packed section item picker shows packed candidates.
- [ ] Fast Food section item picker shows fast-food candidates.
- [ ] Cross-mode add is blocked before request.
- [ ] Cross-mode add is also rejected by backend if forced.

---

## Task 13: Mobile Dashboard Mode Flow

### Goal
Customer mode switch should fully refresh all mode-scoped data.

### Files likely changed
- `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js`
- `Frontend-V1/src/screens/customer/CategoriesScreen/CategoriesScreen.js`
- `Frontend-V1/src/screens/customer/ProductListScreen/ProductListScreen.js`

### Subtasks
- [ ] Keep current segmented control labels: Packed Items, Fast Food.
- [ ] Ensure dashboard fetch sends `storeType`.
- [ ] Clear dashboard sections while switching mode to avoid stale flash.
- [ ] Ensure category clicks pass current mode.
- [ ] Ensure offer buttons pass current mode.
- [ ] Ensure See All passes current mode.
- [ ] Ensure search passes current mode.
- [ ] Ensure Categories tab fetches categories for selected mode.
- [ ] Ensure ProductList displays mode-aware title or subtitle if useful.
- [ ] Ensure cart popup is unaffected by mode switch.

### Things to avoid
- [ ] Do not clear the cart when switching modes.
- [ ] Do not change checkout flow.
- [ ] Do not mix old mode data during loading.

### Testing checklist
- [ ] Switch to Packed Items, dashboard shows packed content.
- [ ] Switch to Fast Food, dashboard shows fast-food content.
- [ ] Switch rapidly between modes, no stale sections remain.
- [ ] Cart popup still works after mode switch.

---

## Task 14: Cart And Order Safety With Mode-Specific Combos

### Goal
Keep shared cart/order flow working while combos become mode-specific.

### Files likely changed
- `Backend-V1/src/controllers/cartController.js`
- `Backend-V1/src/controllers/orderController.js`
- `Frontend-V1/src/stores/useCartStore.js`

### Subtasks
- [ ] Confirm cart item type still distinguishes `product` and `combo`.
- [ ] Confirm combo IDs are looked up in `combos`.
- [ ] Confirm product IDs are looked up in `products`.
- [ ] Confirm mode is not required for order calculation.
- [ ] Confirm backend final price still comes from DB.
- [ ] Store combo child details if needed for invoice/order display.
- [ ] Ensure deleted/unavailable combo cannot be ordered.
- [ ] Ensure mode change does not mutate existing cart quantities.

### Things to avoid
- [ ] Do not split cart by mode unless requested later.
- [ ] Do not trust frontend mode for pricing.
- [ ] Do not duplicate combo as three separate order products unless the current business rule requires that change explicitly.

### Testing checklist
- [ ] Add packed product to cart.
- [ ] Add fast-food product to cart.
- [ ] Add packed combo to cart.
- [ ] Add fast-food combo to cart.
- [ ] Checkout still calculates correct total.
- [ ] Order creation still accepts combo items.

---

## Task 15: Data Migration And Admin Cleanup

### Goal
Safely migrate old common data into explicit modes.

### Subtasks
- [ ] Write a migration report for combos with child product modes.
- [ ] Auto-assign combo `store_type` if all child products share one mode.
- [ ] Flag mixed-mode combos for manual cleanup.
- [ ] Default offers to `packed` only if no better source exists.
- [ ] Create admin checklist to review migrated offers.
- [ ] Duplicate legacy `all` dashboard sections into packed/fast_food where needed.
- [ ] Or ask admin to create separate sections manually after migration.
- [ ] Prevent new `all` sections in UI after migration.
- [ ] Keep backend temporarily able to read old `all` sections until cleanup is complete.

### Things to avoid
- [ ] Do not silently delete mixed-mode combos.
- [ ] Do not make all old offers appear in both modes forever.
- [ ] Do not break dashboard if migration leaves no mode-specific sections.

### Testing checklist
- [ ] Existing database migrates without crashing.
- [ ] Mixed-mode combos are discoverable.
- [ ] Admin can fix migrated content from web panel.

---

## Task 16: Backend Tests

### Goal
Prove mode separation cannot be bypassed.

### Test files likely added/changed
- `Backend-V1/tests/modeSeparation.test.js`
- Existing dashboard/product/combo/offer tests

### Subtasks
- [ ] Test category filtering by mode.
- [ ] Test product filtering by mode.
- [ ] Test combo filtering by mode.
- [ ] Test offer filtering by mode.
- [ ] Test dashboard sections by mode.
- [ ] Test dashboard See All by mode.
- [ ] Test cross-mode section item rejection.
- [ ] Test mixed-mode combo rejection.
- [ ] Test duplicate section slug is allowed across modes only if designed.
- [ ] Test duplicate section slug is rejected inside same mode.
- [ ] Test admin list filters.

### Testing checklist
- [ ] Backend focused tests pass.
- [ ] Existing cart/order tests still pass.
- [ ] Existing category/product tests still pass.

---

## Task 17: Frontend And Admin Testing

### Goal
Verify end-to-end mode behavior.

### Subtasks
- [ ] Test Packed dashboard on mobile.
- [ ] Test Fast Food dashboard on mobile.
- [ ] Test Packed category click.
- [ ] Test Fast Food category click.
- [ ] Test Packed search.
- [ ] Test Fast Food search.
- [ ] Test Packed offer button.
- [ ] Test Fast Food offer button.
- [ ] Test Packed combo See All.
- [ ] Test Fast Food combo See All.
- [ ] Test admin create packed category/product/combo/offer/section.
- [ ] Test admin create fast-food category/product/combo/offer/section.
- [ ] Test admin cannot add wrong-mode item into section.
- [ ] Test admin cannot create mixed-mode combo.
- [ ] Test cart and checkout still work.

### Testing checklist
- [ ] `Backend-V1` tests pass.
- [ ] `Frontend-V1` lint/build passes.
- [ ] `adminManager-V1` lint/build passes.
- [ ] Manual phone check confirms no cross-mode leakage.

---

## Task 18: Final Verification

### Goal
Confirm the app behaves as two separate modes with shared checkout.

### Subtasks
- [ ] Start `Backend-V1`.
- [ ] Start `adminManager-V1`.
- [ ] Start `Frontend-V1`.
- [ ] In admin, create Packed category.
- [ ] In admin, create Fast Food category.
- [ ] In admin, create Packed product.
- [ ] In admin, create Fast Food product.
- [ ] In admin, create Packed combo using packed product.
- [ ] In admin, create Fast Food combo using fast-food product.
- [ ] In admin, create Packed offer.
- [ ] In admin, create Fast Food offer.
- [ ] In admin, create Packed dashboard sections.
- [ ] In admin, create Fast Food dashboard sections.
- [ ] On mobile Packed mode, verify only packed data.
- [ ] On mobile Fast Food mode, verify only fast-food data.
- [ ] Add products/combos to cart.
- [ ] Place valid order.
- [ ] Confirm admin order still receives all item types.
- [ ] Run `graphify update .`.

### Final acceptance
- [ ] No Packed content appears in Fast Food mode.
- [ ] No Fast Food content appears in Packed mode.
- [ ] Admin can manage both modes separately.
- [ ] Backend enforces mode separation.
- [ ] Cart/checkout/order flow is unchanged.
