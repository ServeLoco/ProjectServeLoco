# ServeLoco Bug Audit And Repair Tasks

## Goal
Fix the product, category, combo, dashboard, admin validation, and order-list bugs with a clear product-first model.

This plan is intentionally detailed so another AI or developer can implement it task by task without guessing.

## Correct Data Model

### Product Is The Main Source Of Truth
- Products are the main records that admin can add, edit, hide, delete, and reorder.
- A product can belong to one category through `category_id`.
- Category pages and category filters must show products whose `category_id` matches that category.
- Products should not become combos through a checkbox in the product form.

### Category Is Product Metadata And Dashboard Navigation
- Categories are labels/groups used to organize products.
- A category should appear in the mobile dashboard/category grid when it is active and visible.
- A category should appear in the bottom-nav Categories screen when it matches the selected store type.
- Clicking a category must open products that have that category id.
- Category order must come from category `display_order`.

### Combo Is A Product Bundle
- A combo is a group of existing normal products with a special combo price.
- Combo management should pick products from the product list.
- Combo should not ask for category.
- Combo should not require `category_id`.
- Combo should not appear as a normal product unless the UI intentionally displays combos in a combo section.
- Adding a combo to cart should add the grouped product bundle behavior expected by the app.

### Dashboard Blocks Are Derived Or Curated
- Category grid is derived from active categories.
- Popular combo blocks are derived from active combos or curated combo sections.
- Product sections such as "Milk products" are dashboard blocks that contain products chosen by admin.
- Admin can add, hide, delete, and reorder dashboard blocks.
- Admin can add or remove products from product blocks.

## Bugs Found

### Bug 1: Admin Combo Form Incorrectly Asks For Category

#### Evidence
- `adminManager-V1/src/pages/Combos.jsx` loads categories.
- `adminManager-V1/src/pages/Combos.jsx` has `category_id` in form state.
- `adminManager-V1/src/pages/Combos.jsx` renders a required category `<select>`.
- `adminManager-V1/src/pages/Combos.jsx` shows `category_name` in combo table.
- `Backend-V1/src/routes/adminRoutes.js` product validation requires `category_id`.
- `Backend-V1/src/db/migrate.js` defines `products.category_id INT NOT NULL`.
- Existing combos are stored as products with `is_combo = 1`.

#### Expected Behavior
- Combo form must not ask for category.
- Combo should be created from existing products.
- Combo should have name, price, image, active/available status, display order, and selected child products.

#### Impact
- Admin cannot create a clean combo without forcing an unrelated category.
- Combo model becomes confusing and can break category filtering.
- Mobile category pages may accidentally include combo records.

---

### Bug 2: Product Form Can Create Combos

#### Evidence
- `adminManager-V1/src/pages/Products.jsx` includes an `is_combo` checkbox.

#### Expected Behavior
- Product page manages only normal products.
- Combo page manages combos.

#### Impact
- Admin can create combo-like products in the wrong place.
- Category requirements become unclear.
- Product lists and combo lists can disagree.

---

### Bug 3: New Categories Do Not Automatically Show On Mobile Dashboard

#### Evidence
- `Backend-V1/src/controllers/dashboardController.js` uses `dashboard_section_items` for `category_grid`.
- Fallback categories are only used when section items are empty.
- If the category grid already has configured items, newly created active categories may not show.

#### Expected Behavior
- Active categories should show on the dashboard category grid by default.
- Category order should follow category `display_order`.
- Hidden/deleted categories should not show.

#### Impact
- Admin creates category but user cannot see it on mobile dashboard.

---

### Bug 4: Bottom Nav Categories Screen Can Filter Out All Categories

#### Evidence
- `Frontend-V1/src/screens/customer/CategoriesScreen/CategoriesScreen.js` uses store labels like `Packed Items` and `Fast Food`.
- API/category types are likely normalized as `packed` and `fast_food`.
- Local filtering compares `packed` to `packed items`, and `fast_food` to `fast food`.

#### Expected Behavior
- Store type labels must be normalized before API calls and local filtering.
- Packed tab should show packed categories.
- Fast food tab should show fast food categories.

#### Impact
- Categories page in bottom nav can show no categories even though categories exist.

---

### Bug 5: Clicking A Category Can Hide Matching Products

#### Evidence
- `Frontend-V1/src/screens/customer/ProductListScreen/ProductListScreen.js` sends `categoryId` to the API.
- The same screen also filters client-side by category name.
- If backend category id is correct but category name casing/format differs, valid products can be hidden.

#### Expected Behavior
- When `categoryId` exists, trust backend filtering.
- Only use category-name filtering when no `categoryId` is available.

#### Impact
- User clicks category but products with that category property do not display.

---

### Bug 6: Orders Are Not Showing Reliably

#### Evidence To Check
- `Frontend-V1/src/screens/customer/OrdersScreen/OrdersScreen.js`
- `Frontend-V1/src/api/ordersApi.js`
- `Backend-V1/src/controllers/orderController.js`
- `Backend-V1/src/routes/orderRoutes.js`

#### Likely Causes
- API response shape mismatch.
- Customer auth token missing or expired.
- Empty state hides real API error.
- Status labels do not match filter labels.
- Missing filter chip for `Out for Delivery`.

#### Expected Behavior
- Logged-in customer should see their orders.
- If API fails, the screen should show a clear error.
- If no orders exist, the screen should show a true empty state.
- Status filters should match backend status values.

---

### Bug 7: Admin Display Order Allows Duplicates

#### Evidence
- Product/category/combo forms accept display order values.
- There is no clear validation that order `1` is already used.

#### Expected Behavior
- If admin sets display order to a position already used in the same scope, show a clear message.
- Example: `Display order 1 is already used by Fresh Milk in Packed Items.`

#### Required Scopes
- Category order must be unique per category type.
- Product order must be unique within a category.
- Combo order must be unique within combos.
- Dashboard block order must be unique among dashboard blocks.
- Dashboard block item order must be unique inside the same block.

---

### Bug 8: Combo Items Can Be Duplicated Or Invalid

#### Evidence
- Combo item rows can select products.
- Backend currently relies too much on database constraints or silent filtering.

#### Expected Behavior
- Same product cannot appear twice in one combo.
- Combo cannot contain another combo.
- Combo cannot contain deleted products.
- Combo must contain at least one product.
- Each combo item quantity must be positive.

---

### Bug 9: API Response Shapes Are Inconsistent

#### Evidence
- Some endpoints return `data`.
- Some endpoints return nested `data.products`.
- Some pages expect an array directly.

#### Expected Behavior
- Admin and mobile API helpers should normalize list responses.
- Pages should not manually guess every response shape.

#### Impact
- Lists can appear empty even when backend returns records.

---

### Bug 10: Dashboard Section Model Conflicts With Derived Category Model

#### Evidence
- `category_grid` is treated like configurable dashboard section items.
- User expects category grid to come from categories.

#### Expected Behavior
- Category grid should be derived from active categories.
- Product blocks and combo blocks can be admin-curated.
- The admin dashboard manager should make source type clear.

---

## Implementation Order

Follow these tasks in order. Do not jump ahead.

---

## Task 1: Lock The Product-First Rules In Code Comments And API Contracts

### Goal
Make the intended model explicit before changing behavior.

### Files Likely Changed
- `plans/bugstask.md`
- `Backend-V1/src/controllers/productController.js`
- `Backend-V1/src/controllers/dashboardController.js`
- `adminManager-V1/src/pages/Products.jsx`
- `adminManager-V1/src/pages/Combos.jsx`

### Exact Changes
- Add short comments only where helpful:
  - Normal products require category.
  - Combos are bundles and do not require category.
  - Dashboard category grid is derived from categories.
- Do not add long comments to every function.

### Things To Avoid
- Do not change behavior in this task.
- Do not rename database fields yet.

### Testing Checklist
- App still builds.
- No UI behavior changes.

---

## Task 2: Remove Combo Creation From Product Admin

### Goal
Products page should manage only normal products.

### Files Likely Changed
- `adminManager-V1/src/pages/Products.jsx`
- `Backend-V1/src/routes/adminRoutes.js`
- `Backend-V1/src/controllers/productController.js`

### Exact Changes
- Remove `Is Combo Box` checkbox from product form.
- Stop sending `is_combo` from product create/update forms.
- Backend normal product create/update should force `is_combo = 0`.
- Product list page should not show combo rows unless there is a deliberate filter for historical cleanup.
- Keep category required for normal products.

### Things To Avoid
- Do not delete existing combo data in this task.
- Do not break product add/edit/delete.

### Testing Checklist
- Add normal product with category.
- Edit normal product.
- Hide/delete normal product.
- Confirm product form no longer displays combo checkbox.

---

## Task 3: Refactor Combos Away From Product Category Requirement

### Goal
Combos should be bundles of products, not category-bound products.

### Files Likely Changed
- `Backend-V1/src/db/migrate.js`
- `Backend-V1/src/controllers/productController.js`
- `Backend-V1/src/routes/adminRoutes.js`
- `Backend-V1/src/validators/index.js`
- `adminManager-V1/src/pages/Combos.jsx`

### Suggested Database Model
- Add `combos` table:
  - `id`
  - `name`
  - `description`
  - `price`
  - `original_price`
  - `unit`
  - `image_id`
  - `image_url`
  - `available`
  - `featured`
  - `display_order`
  - `discount_label`
  - `deleted`
  - `created_at`
  - `updated_at`
- Add `combo_items` table:
  - `id`
  - `combo_id`
  - `product_id`
  - `quantity`
  - `display_order`
  - unique key on `combo_id, product_id`

### Migration Requirements
- Existing `products.is_combo = 1` rows should be copied into `combos`.
- Existing `product_combo_items` should be copied into `combo_items`.
- Old combo product rows should not appear in normal product lists.
- Do not require `category_id` for records in the new `combos` table.

### Exact Changes
- Create combo-specific backend queries.
- Create combo-specific admin routes.
- Stop using product create/update validation for combos.
- Keep old combo routes working temporarily if mobile depends on them, but internally read from the new combo model.

### Things To Avoid
- Do not drop old columns immediately.
- Do not break existing carts/orders that reference older combo ids until compatibility is handled.

### Testing Checklist
- Existing combos migrate.
- Combo list loads without categories.
- New combo can be created without category.
- Combo can be edited without category.
- Combo items save correctly.

---

## Task 4: Fix Admin Combo Page UI And Validation

### Goal
Combo admin page should clearly manage bundles.

### Files Likely Changed
- `adminManager-V1/src/pages/Combos.jsx`
- `adminManager-V1/src/api/combosApi.js`
- `adminManager-V1/src/api/productsApi.js`

### Exact Changes
- Remove category dropdown.
- Remove category column from combo table.
- Load only normal products for combo item picker.
- Show selected child products with quantity controls.
- Add inline duplicate-product validation before submit.
- If product already exists in combo, show:
  - `This product is already in the combo. Increase quantity instead.`
- Validate at least one product is selected.
- Validate combo price is positive.
- Validate display order uniqueness through backend response.

### Things To Avoid
- Do not allow combo inside combo.
- Do not allow deleted/unavailable products unless backend explicitly permits.
- Do not silently remove duplicate rows.

### Testing Checklist
- Create combo with two products.
- Try selecting the same product twice and confirm error.
- Edit combo item quantity.
- Remove item from combo.
- Save combo without category.
- Verify mobile combo section still renders.

---

## Task 5: Fix Combo Add-To-Cart Behavior

### Goal
Adding a combo should add the grouped products according to combo rules.

### Files Likely Changed
- `Frontend-V1/src/store/cartStore.js`
- `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js`
- `Frontend-V1/src/components/ProductCard/ProductCard.js`
- `Backend-V1/src/controllers/cartController.js`
- `Backend-V1/src/controllers/orderController.js`

### Exact Changes
- Decide and implement one clear cart shape for combos:
  - Option A: cart stores combo line with nested products.
  - Option B: cart expands combo into child product lines with combo discount metadata.
- Backend must calculate final combo price.
- Frontend must not calculate trusted combo total.
- UI should display combo as one bundle if that is the expected customer experience.

### Things To Avoid
- Do not add child products at normal price when combo special price should apply.
- Do not trust frontend combo price.
- Do not lose combo identity in order history.

### Testing Checklist
- Add combo to cart.
- Confirm correct item count.
- Confirm correct price.
- Confirm order stores combo information.
- Confirm removing combo removes combo bundle correctly.

---

## Task 6: Make Dashboard Category Grid Derived From Categories

### Goal
New active categories should automatically appear on mobile dashboard.

### Files Likely Changed
- `Backend-V1/src/controllers/dashboardController.js`
- `Backend-V1/tests/dashboard.test.js`
- `adminManager-V1/src/pages/Categories.jsx`
- `adminManager-V1/src/pages/MobileDashboard.jsx`

### Exact Changes
- Public dashboard `category_grid` should query active categories directly.
- Sort categories by `display_order`, then name.
- Include category image/icon fields.
- Hide deleted/inactive categories.
- Admin dashboard manager should not treat category grid as a manual item list unless there is an explicit override setting.
- If override exists, document it clearly and default to derived categories.

### Things To Avoid
- Do not require admin to manually add every category to dashboard.
- Do not show deleted categories.
- Do not duplicate categories.

### Testing Checklist
- Create new category in admin.
- Refresh mobile dashboard.
- Confirm category appears.
- Hide category.
- Confirm category disappears.
- Change category order.
- Confirm dashboard order changes.

---

## Task 7: Fix Bottom-Nav Categories Screen

### Goal
Categories tab should show categories for Packed and Fast Food views.

### Files Likely Changed
- `Frontend-V1/src/screens/customer/CategoriesScreen/CategoriesScreen.js`
- `Frontend-V1/src/api/productsApi.js`

### Exact Changes
- Add helper:
  - `Packed Items` -> `packed`
  - `Fast Food` -> `fast_food`
- Use normalized type when calling category API.
- Use normalized type when local filtering.
- If backend returns no categories, show a true empty state with retry.
- Keep current layout and theme.

### Things To Avoid
- Do not redesign the Categories screen.
- Do not hardcode fake categories.

### Testing Checklist
- Packed tab shows packed categories.
- Fast Food tab shows fast food categories.
- Refresh works.
- Category click opens product list.

---

## Task 8: Fix Category Click Product Filtering

### Goal
Products with the selected category property should display after category click.

### Files Likely Changed
- `Frontend-V1/src/screens/customer/ProductListScreen/ProductListScreen.js`
- `Frontend-V1/src/api/productsApi.js`
- `Backend-V1/src/controllers/productController.js`

### Exact Changes
- Ensure category navigation passes `categoryId`.
- Product list API should filter by `category_id`.
- If `categoryId` exists, skip client-side category-name filter.
- If only `categoryName` exists, use name filter as fallback.
- Normalize category names only for fallback.

### Things To Avoid
- Do not hide products because of casing or spacing mismatch.
- Do not break search/filter/sort.

### Testing Checklist
- Product assigned to new category appears after clicking that category.
- Product not assigned to category does not appear.
- Search still works inside category.

---

## Task 9: Fix Orders Not Showing

### Goal
Customer orders must load reliably in the mobile app.

### Files Likely Changed
- `Frontend-V1/src/screens/customer/OrdersScreen/OrdersScreen.js`
- `Frontend-V1/src/api/ordersApi.js`
- `Backend-V1/src/controllers/orderController.js`
- `Backend-V1/src/routes/orderRoutes.js`

### Exact Changes
- Logically verify `/api/orders` returns current customer orders.
- Normalize response from:
  - array
  - `{ data: [...] }`
  - `{ orders: [...] }`
  - `{ data: { orders: [...] } }`
- Show backend error message when request fails.
- Show empty state only when request succeeds with zero orders.
- Add status chip for `Out for Delivery` if backend supports it.
- Normalize status labels for filtering.

### Things To Avoid
- Do not show another customer's orders.
- Do not bypass authentication.
- Do not hide API errors as empty states.

### Testing Checklist
- Login as customer.
- Place an order.
- Open Orders tab.
- Confirm order appears.
- Filter by each status.
- Logout/login and confirm correct customer orders.

---

## Task 10: Add Admin Display Order Validation

### Goal
Admin should get clear validation when duplicate display order is used.

### Files Likely Changed
- `Backend-V1/src/controllers/productController.js`
- `Backend-V1/src/controllers/categoryController.js`
- `Backend-V1/src/controllers/dashboardController.js`
- `Backend-V1/src/validators/index.js`
- `adminManager-V1/src/pages/Products.jsx`
- `adminManager-V1/src/pages/Categories.jsx`
- `adminManager-V1/src/pages/Combos.jsx`
- `adminManager-V1/src/pages/MobileDashboard.jsx`

### Exact Changes
- Backend must check order conflicts before insert/update.
- Return clear 400 error with conflicting record name.
- Admin forms must display that error near display order field.
- Scopes:
  - categories: same `type`
  - products: same `category_id`
  - combos: all active combos
  - dashboard blocks: same screen/section list
  - dashboard block items: same block

### Things To Avoid
- Do not silently reorder existing records.
- Do not allow duplicate order numbers in the same scope.
- Do not block editing a record when order value is unchanged.

### Testing Checklist
- Create category with order 1.
- Create second category of same type with order 1.
- Confirm validation error.
- Edit same category without changing order.
- Confirm save works.
- Repeat for products, combos, dashboard blocks.

---

## Task 11: Normalize API List Responses

### Goal
Prevent empty UI lists caused by inconsistent response shapes.

### Files Likely Changed
- `Frontend-V1/src/api/*`
- `adminManager-V1/src/api/*`
- `Frontend-V1/src/utils/apiResponse.js`
- `adminManager-V1/src/utils/apiResponse.js`

### Exact Changes
- Create `readList(response, keys)` helper.
- Use it in products, categories, combos, orders, offers, dashboard pages.
- Accept common shapes:
  - direct array
  - `response.data`
  - `response.products`
  - `response.categories`
  - `response.orders`
  - nested `response.data.products`
  - nested `response.data.categories`
  - nested `response.data.orders`

### Things To Avoid
- Do not change backend response format in this task unless necessary.
- Do not duplicate parsing logic in each screen.

### Testing Checklist
- Product list loads.
- Category list loads.
- Combo list loads.
- Orders list loads.
- Admin pages still load.

---

## Task 12: Add Missing Backend Tests

### Goal
Catch these bugs before UI testing.

### Files Likely Changed
- `Backend-V1/tests/*.test.js`

### Required Tests
- Normal product requires category.
- Combo does not require category.
- Combo rejects duplicate child products.
- Combo rejects nested combo products.
- New active category appears in dashboard category grid.
- Hidden category does not appear.
- Category product filter returns matching products.
- Duplicate display order returns clear error.
- Customer orders endpoint returns only logged-in customer orders.

### Things To Avoid
- Do not write tests that depend on existing local database data.
- Do not skip tests because fixtures are inconvenient.

### Testing Checklist
- Backend test suite passes.

---

## Task 13: Add Mobile Frontend Tests Or Manual Checklists

### Goal
Verify customer-visible flows.

### Files Likely Changed
- `Frontend-V1/src/**/*.test.js`
- Or manual QA checklist if test setup is limited.

### Required Checks
- Dashboard shows categories from backend.
- Bottom Categories tab shows categories.
- Clicking category opens matching products.
- Combo card displays correctly.
- Adding combo updates cart correctly.
- Orders tab shows order after placing order.
- Empty state appears only when there are no orders.
- Error state appears when API fails.

### Things To Avoid
- Do not change mobile layout during tests.
- Do not add fake hardcoded data to make tests pass.

### Testing Checklist
- Frontend lint passes.
- Frontend tests pass if available.

---

## Task 14: Add Admin Manager Tests Or Manual Checklists

### Goal
Verify admin editing flows.

### Files Likely Changed
- `adminManager-V1/src/**/*.test.jsx`
- Or manual QA checklist if test setup is limited.

### Required Checks
- Product create/edit/delete works.
- Product category assignment works.
- Category create/edit/hide/order works.
- Combo create/edit/delete works without category.
- Combo duplicate product validation appears.
- Display order conflict validation appears.
- Dashboard block create/edit/hide/delete works.
- Orders list loads.

### Things To Avoid
- Do not add admin-only logic into mobile app.
- Do not bypass backend validations.

### Testing Checklist
- Admin build passes.
- Admin lint passes if configured.

---

## Task 15: Final End-To-End Verification

### Goal
Confirm admin changes reflect in the customer app.

### Steps
- [ ] Start `Backend-V1`.
- [ ] Start `adminManager-V1`.
- [ ] Start `Frontend-V1`.
- [ ] Login as admin.
- [ ] Create a new category.
- [ ] Create or edit a product and assign that category.
- [ ] Open mobile dashboard and confirm the category appears.
- [ ] Click category and confirm assigned product appears.
- [ ] Create combo from existing products without selecting category.
- [ ] Confirm combo appears in mobile combo section.
- [ ] Add combo to cart and confirm correct cart behavior.
- [ ] Place customer order.
- [ ] Open Orders tab and confirm order appears.
- [ ] Open admin orders and confirm order appears.
- [ ] Try duplicate display order and confirm useful validation message.
- [ ] Run backend tests.
- [ ] Run frontend checks.
- [ ] Run admin build.
- [ ] Run `graphify update .`.

## Acceptance Criteria
- [ ] Combo admin no longer asks for category.
- [ ] Combo is a bundle of existing products with special price.
- [ ] Product admin no longer creates combos.
- [ ] New active categories show on dashboard automatically.
- [ ] Bottom-nav Categories screen shows categories.
- [ ] Clicking category shows products assigned to that category.
- [ ] Duplicate display order shows clear admin validation.
- [ ] Duplicate combo item shows clear admin validation.
- [ ] Orders tab shows current customer's orders.
- [ ] No fake frontend data is used to hide backend bugs.
- [ ] Existing cart, checkout, auth, routing, and backend API flows remain working.
