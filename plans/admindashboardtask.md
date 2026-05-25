# Admin Controlled Mobile Dashboard Tasks

## Goal
Make the customer mobile dashboard fully controlled from `adminManager-V1`.

Admin should be able to manage what appears on the mobile app dashboard without changing mobile code each time:
- Add, edit, hide, delete offer banners
- Add, edit, reorder, hide, delete category cards
- Add and remove products/items inside category cards
- Add, edit, hide, delete combo products
- Add and remove products inside existing combos
- Create custom dashboard blocks such as `Milk Products`, `Snacks`, `Breakfast`, `Popular Combos`
- Add, remove, reorder, and hide products inside each dashboard block
- Mobile dashboard should show block cards 3 per row and only 2 rows by default
- Tapping `See All` should open the full list for that block

Backend must remain the single source of truth. Admin web changes must reflect in the mobile app through APIs.

---

## 1. Current System Review

### Goal
Understand the current dashboard behavior before changing data contracts.

### Current behavior
- `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js` loads:
  - categories from product category APIs
  - one active offer from offer APIs
  - combo products using product APIs
- The Home screen currently has hardcoded dashboard blocks:
  - offer banner
  - category cards
  - `Popular Combos`
- Admin already has separate pages for:
  - offers
  - categories
  - products/items
  - combos
- Combos now have real included products through `product_combo_items`.

### Files likely checked
- `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js`
- `Frontend-V1/src/screens/customer/ProductListScreen/ProductListScreen.js`
- `Frontend-V1/src/components/ProductCard/ProductCard.js`
- `Frontend-V1/src/components/CategoryCard/CategoryCard.js`
- `Frontend-V1/src/api/productsApi.js`
- `Backend-V1/src/controllers/productController.js`
- `Backend-V1/src/controllers/categoryController.js`
- `Backend-V1/src/controllers/settingsController.js`
- `Backend-V1/src/routes/adminRoutes.js`
- `adminManager-V1/src/pages/Dashboard.jsx`
- `adminManager-V1/src/pages/Offers.jsx`
- `adminManager-V1/src/pages/Categories.jsx`
- `adminManager-V1/src/pages/Products.jsx`
- `adminManager-V1/src/pages/Combos.jsx`

### Subtasks
- [ ] Confirm how Home currently fetches categories, offers, and combos
- [ ] Confirm how ProductList can receive category/block params
- [ ] Confirm existing admin CRUD APIs for offers/categories/products/combos
- [ ] Confirm combo item composition table exists and works
- [ ] Confirm current mobile UI supports 3 cards per row for combo/product blocks
- [ ] Confirm category product assignment is currently through `products.category_id`

### Things to avoid
- [ ] Do not hardcode new dashboard blocks in mobile frontend
- [ ] Do not duplicate dashboard rules in admin and mobile
- [ ] Do not bypass backend for dashboard data
- [ ] Do not break current offers/categories/products/combos pages

### Testing checklist
- [ ] Current Home still loads before changes
- [ ] Current admin pages still load before changes
- [ ] Existing product/category/combo APIs are understood

---

## 2. Dashboard Data Model

### Goal
Create a flexible backend model for admin-managed dashboard layout.

### New table: `dashboard_sections`
Suggested fields:
- `id`
- `title`
- `slug`
- `section_type`
- `store_type`
- `active`
- `display_order`
- `max_visible_items`
- `show_see_all`
- `linked_category_id`
- `linked_offer_id`
- `starts_at`
- `ends_at`
- `version`
- `deleted_at`
- `created_at`
- `updated_at`

### Section types
- `offer_banner`
- `category_grid`
- `product_block`
- `combo_block`

### Field meaning
- `title`: block title shown in mobile, for example `Milk Products`
- `slug`: stable identifier for navigation and APIs
- `section_type`: controls how mobile renders the section
- `store_type`: `packed`, `fast_food`, or `all`
- `active`: hide/show block
- `display_order`: dashboard order
- `max_visible_items`: default `6` for product/combo blocks so mobile shows 2 rows of 3
- `show_see_all`: whether mobile shows `See All`
- `linked_category_id`: optional shortcut when section pulls products from one category
- `linked_offer_id`: optional shortcut when section is an offer banner
- `starts_at` / `ends_at`: optional visibility window for scheduled campaigns or seasonal blocks
- `version`: optimistic concurrency value so two admin edits do not overwrite each other silently
- `deleted_at`: soft delete marker so old references and audit history remain safe

### New table: `dashboard_section_items`
Suggested fields:
- `id`
- `section_id`
- `item_type`
- `item_id`
- `display_order`
- `active`
- `starts_at`
- `ends_at`
- `deleted_at`
- `created_at`
- `updated_at`

### Item types
- `product`
- `category`
- `combo`
- `offer`

### Subtasks
- [ ] Add migration for `dashboard_sections`
- [ ] Add migration for `dashboard_section_items`
- [ ] Add indexes for section ordering and item lookup
- [ ] Add unique constraints where useful
- [ ] Add partial uniqueness so the same item cannot appear twice in the same active section
- [ ] Add nullable schedule fields for sections and section items
- [ ] Add soft-delete fields instead of hard deletes
- [ ] Add optimistic `version` field for admin edit conflict detection
- [ ] Seed default sections matching current Home behavior
- [ ] Keep old product/category/offer tables unchanged

### Things to avoid
- [ ] Do not store duplicate product names/prices in section items
- [ ] Do not delete products when removing them from a dashboard block
- [ ] Do not make section items required for offer-only blocks
- [ ] Do not make this a frontend-only configuration file
- [ ] Do not force old rows to have schedule or deleted fields populated

### Testing checklist
- [ ] Migrations run on existing DB
- [ ] Existing products/categories/offers remain intact
- [ ] Default dashboard can be generated from seeded sections
- [ ] Duplicate active items inside one section are rejected
- [ ] Soft-deleted sections/items do not appear publicly

---

## 3. Backend Public Dashboard API

### Goal
Give the mobile app one API that returns the full dashboard layout.

### New API
`GET /api/dashboard`

### Query params
- `storeType=packed|fast_food|all`

### Response shape
```json
{
  "data": {
    "sections": [
      {
        "id": 1,
        "title": "Popular Combos",
        "slug": "popular-combos",
        "sectionType": "combo_block",
        "displayOrder": 1,
        "maxVisibleItems": 6,
        "showSeeAll": true,
        "items": []
      }
    ]
  }
}
```

### Section item payloads
- Offer banner items should include offer title, description, image, active state
- Category grid items should include category name, image, count, type, order
- Product block items should include product name, image, price, availability
- Combo block items should include combo name, image, price, availability, included combo items

### Subtasks
- [ ] Add dashboard controller
- [ ] Add public dashboard route
- [ ] Load active sections by store type
- [ ] Load active section items by display order
- [ ] Exclude sections and items outside their `starts_at` / `ends_at` visibility window
- [ ] Exclude soft-deleted sections and section items
- [ ] Join product/category/offer data by item type
- [ ] Exclude missing, hidden, deleted, unavailable, or store-type-incompatible linked records
- [ ] Resolve image URLs from MongoDB
- [ ] Include combo item composition for combo blocks
- [ ] Limit visible items according to `max_visible_items`
- [ ] Include enough metadata for `See All` navigation
- [ ] Return a valid empty `sections: []` response when no dashboard content is configured
- [ ] Return partial dashboard data when one section has bad linked data instead of failing the whole Home screen

### Things to avoid
- [ ] Do not make mobile call many APIs for each block
- [ ] Do not return deleted/hidden products
- [ ] Do not return inactive sections
- [ ] Do not expose admin-only fields
- [ ] Do not return expired scheduled banners or blocks
- [ ] Do not crash when a linked image is missing

### Testing checklist
- [ ] `/api/dashboard` returns sections
- [ ] Store type filter works
- [ ] Offer banner section returns offer data
- [ ] Category section returns category cards
- [ ] Product block returns products
- [ ] Combo block returns combos with combo items
- [ ] Deleted/hidden items are excluded
- [ ] Expired and future-scheduled sections are excluded
- [ ] Missing linked products/categories/offers are skipped safely
- [ ] Empty dashboard config returns a valid response

---

## 4. Backend Admin Dashboard APIs

### Goal
Allow `adminManager-V1` to create and manage mobile dashboard sections.

### New admin APIs
- `GET /api/admin/dashboard-sections`
- `POST /api/admin/dashboard-sections`
- `GET /api/admin/dashboard-sections/:id`
- `PATCH /api/admin/dashboard-sections/:id`
- `DELETE /api/admin/dashboard-sections/:id`
- `POST /api/admin/dashboard-sections/:id/items`
- `PATCH /api/admin/dashboard-sections/:id/items/:itemId`
- `DELETE /api/admin/dashboard-sections/:id/items/:itemId`
- `PATCH /api/admin/dashboard-sections/reorder`
- `PATCH /api/admin/dashboard-sections/:id/items/reorder`

### Subtasks
- [ ] Add admin dashboard section controller
- [ ] Add validation for section type
- [ ] Add validation for store type
- [ ] Add validation for max visible items
- [ ] Add validation for item type and item id
- [ ] Validate item type matches section type
- [ ] Validate selected item store type is compatible with the section store type
- [ ] Reject duplicate active items inside the same section
- [ ] Allow the same product to appear in different sections when admin chooses that intentionally
- [ ] Validate schedule dates and reject `ends_at` before `starts_at`
- [ ] Validate client `version` on update and return a clear conflict error for stale admin edits
- [ ] Add soft delete/hide behavior for sections
- [ ] Add hide/remove behavior for individual section items
- [ ] Add reorder endpoint for sections
- [ ] Add reorder endpoint for items inside a section
- [ ] Make reorder operations stable when some items are hidden or deleted
- [ ] Add audit logging for admin changes

### Things to avoid
- [ ] Do not physically delete products/categories/offers when removing from dashboard
- [ ] Do not allow invalid item types inside sections
- [ ] Do not allow combo block to contain normal products unless explicitly allowed
- [ ] Do not allow product block to contain hidden/deleted products
- [ ] Do not silently overwrite another admin's newer changes
- [ ] Do not allow scheduled hidden content to become visible because of timezone confusion

### Testing checklist
- [ ] Admin can list sections
- [ ] Admin can create a block
- [ ] Admin can edit title/order/status
- [ ] Admin can add products to a block
- [ ] Admin can remove products from a block
- [ ] Admin can hide/delete a block
- [ ] Admin reorder is reflected by public dashboard API
- [ ] Duplicate item add shows a clear validation error
- [ ] Stale update conflict shows a clear admin message

---

## 5. Admin Manager Navigation

### Goal
Add a dedicated web admin page for mobile dashboard management.

### Files likely changed
- `adminManager-V1/src/App.jsx`
- `adminManager-V1/src/components/Sidebar.jsx`
- `adminManager-V1/src/api/index.js`
- `adminManager-V1/src/pages/MobileDashboard.jsx`
- `adminManager-V1/src/pages/MobileDashboard.css`

### New sidebar item
- `Mobile Dashboard`

### Subtasks
- [ ] Add route `/mobile-dashboard`
- [ ] Add sidebar nav item
- [ ] Add API module `DashboardSectionsApi`
- [ ] Build page shell with section list on left
- [ ] Build section editor on right
- [ ] Show live preview-like grid for section items

### Things to avoid
- [ ] Do not place mobile dashboard management inside the analytics dashboard page
- [ ] Do not mix order metrics with content layout controls
- [ ] Do not make admin edit mobile dashboard from the mobile app

### Testing checklist
- [ ] Admin can open Mobile Dashboard page
- [ ] Protected route still works
- [ ] Sidebar active state works

---

## 6. Admin Offer Banner Management

### Goal
Let admin control offer banners shown on mobile dashboard.

### Expected admin actions
- Add offer banner
- Edit offer title/description/image
- Activate/deactivate offer banner
- Delete/hide offer banner
- Choose where offer appears in dashboard order

### Subtasks
- [ ] Reuse existing Offers page for offer CRUD
- [ ] Allow adding offer to dashboard as `offer_banner` section
- [ ] Allow selecting existing offer for banner section
- [ ] Allow image upload/change
- [ ] Allow active/inactive state
- [ ] Allow deleting/hiding banner without deleting offer history
- [ ] Support optional start/end dates for scheduled banners
- [ ] Preview missing image fallback before saving

### Things to avoid
- [ ] Do not show deleted offers on mobile
- [ ] Do not force only one offer forever if dashboard sections support multiple banners
- [ ] Do not break current active offer API until mobile migrates
- [ ] Do not show expired banners on mobile

### Testing checklist
- [ ] Add banner in admin
- [ ] Edit banner text/image
- [ ] Hide banner
- [ ] Future banner does not appear early
- [ ] Expired banner disappears
- [ ] Mobile dashboard reflects changes

---

## 7. Admin Category Card Management

### Goal
Let admin edit category cards and choose products inside categories.

### Expected admin actions
- Add category card
- Rename category card
- Upload/change category image
- Reorder category cards
- Hide/delete category card
- Assign products/items to category
- Remove products/items from category

### Implementation notes
- Category cards can continue using the existing `categories` table
- Product assignment can continue using `products.category_id`
- Dashboard category grid should be controlled by a `category_grid` section
- The section items should define which categories appear and in what order

### Subtasks
- [ ] Extend Mobile Dashboard page to manage `category_grid` section
- [ ] Allow selecting categories into the category grid
- [ ] Allow reorder of category cards
- [ ] Link to category edit page for rename/image/type
- [ ] Link to product edit page for items inside category
- [ ] Ensure mobile shows only selected dashboard categories
- [ ] Show safe fallback image/icon when category image is missing
- [ ] Handle categories with zero products without breaking the grid

### Things to avoid
- [ ] Do not delete product rows when removing from category card
- [ ] Do not show hidden categories on mobile
- [ ] Do not break existing Categories admin page
- [ ] Do not let long category names overflow the card

### Testing checklist
- [ ] Add category to dashboard
- [ ] Remove category from dashboard
- [ ] Reorder category cards
- [ ] Product count is correct
- [ ] Mobile category tap opens product list
- [ ] Empty category does not crash ProductList
- [ ] Long category name truncates cleanly

---

## 8. Admin Combo Block Management

### Goal
Let admin control combo products and combo dashboard blocks.

### Expected admin actions
- Create new combo
- Edit combo name, price, image, availability
- Delete/hide combo
- Add products/items inside combo
- Remove products/items from existing combo
- Reorder combo items if needed
- Create dashboard block for combos
- Add/remove combos from combo block

### Existing foundation
- Combos use `products.is_combo = true`
- Combo included products use `product_combo_items`
- Mobile add-to-cart expands combo into included products

### Subtasks
- [ ] Keep `adminManager-V1/src/pages/Combos.jsx` as the combo CRUD page
- [ ] Ensure combo drawer supports included products and quantities
- [ ] Add combo block support in Mobile Dashboard page
- [ ] Allow selecting existing combos into a block
- [ ] Allow reorder inside combo block
- [ ] Mobile renders 3 combo cards per row and 2 rows by default
- [ ] `See All` opens full combo list for that block
- [ ] Prevent combo from including itself
- [ ] Prevent combo from including another combo unless nested combos are explicitly designed later
- [ ] Warn admin when a combo includes unavailable or hidden child products
- [ ] Define mobile behavior for unavailable combo child products before release

### Things to avoid
- [ ] Do not treat combo as a single cart item when it has included products
- [ ] Do not show combos with no included items unless admin intentionally allows them
- [ ] Do not break existing combo CRUD
- [ ] Do not create circular combo dependencies

### Testing checklist
- [ ] Admin creates combo
- [ ] Admin adds three products inside combo
- [ ] Mobile combo card shows included item preview
- [ ] Adding combo adds the three products separately to cart
- [ ] Removing combo reduces those products correctly
- [ ] Self-referencing combo is rejected
- [ ] Hidden child product behavior is clear and tested

---

## 9. Admin Custom Product Blocks

### Goal
Allow admin to create dashboard blocks such as `Milk Products`, `Snacks`, or `Daily Needs`.

### Expected admin actions
- Create custom block
- Set block title
- Set block type as `product_block`
- Set store type
- Add products manually
- Remove products manually
- Reorder products
- Hide/show block
- Delete block
- Configure visible count, default `6`
- Toggle `See All`

### Mobile behavior
- Block title appears on Home
- First 6 products show as 3 cards per row and 2 rows
- No horizontal scroll
- `See All` opens a product list filtered by that dashboard section

### Subtasks
- [ ] Add `product_block` section type in backend
- [ ] Add product picker in admin
- [ ] Allow multi-select products
- [ ] Persist selected products in `dashboard_section_items`
- [ ] Add public section detail endpoint if needed:
  - `GET /api/dashboard/sections/:slug/items`
- [ ] Mobile Home renders each product block dynamically
- [ ] ProductList accepts `sectionSlug` or `sectionId`
- [ ] ProductList loads all products for selected block
- [ ] Add pagination or limit/offset support for large See All lists
- [ ] Skip products that become hidden, deleted, unavailable, or store-type-incompatible after being added to a block
- [ ] Decide whether empty product blocks are hidden on mobile or shown as an empty state

### Things to avoid
- [ ] Do not use category name as the only way to build custom blocks
- [ ] Do not hardcode block titles in mobile
- [ ] Do not make product blocks horizontal scroll
- [ ] Do not let one missing product break the full block

### Testing checklist
- [ ] Admin creates `Milk Products`
- [ ] Admin adds milk products into block
- [ ] Mobile shows 6 max on dashboard
- [ ] `See All` shows full block
- [ ] Hide block removes it from mobile
- [ ] Block with 50+ products loads without freezing
- [ ] Hidden product is removed from public block output

---

## 10. Mobile Dashboard Rendering

### Goal
Replace hardcoded Home sections with dynamic backend dashboard sections.

### Files likely changed
- `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js`
- `Frontend-V1/src/api/dashboardApi.js`
- `Frontend-V1/src/api/index.js`
- `Frontend-V1/src/utils/apiMappers.js`
- `Frontend-V1/src/components/ProductCard/ProductCard.js`
- `Frontend-V1/src/components/CategoryCard/CategoryCard.js`

### Subtasks
- [ ] Add `dashboardApi.getDashboard({ storeType })`
- [ ] Add `normalizeDashboardSection`
- [ ] Add `normalizeDashboardItem`
- [ ] Replace separate Home calls with dashboard API where possible
- [ ] Render sections by `sectionType`
- [ ] Render offer banner sections
- [ ] Render category grid sections
- [ ] Render product block sections
- [ ] Render combo block sections
- [ ] Keep store type switch behavior
- [ ] Keep cart behavior
- [ ] Keep loading/error/empty states
- [ ] Hide empty sections unless backend explicitly marks them as displayable empty states
- [ ] Use safe image fallback for missing product/category/offer images
- [ ] Clamp long titles, product names, and price text so cards do not overflow
- [ ] Keep 3-card grid stable on 360, 390, and 430 px phone widths
- [ ] Show a friendly fallback if dashboard API fails and old fallback APIs are unavailable

### Things to avoid
- [ ] Do not break add-to-cart
- [ ] Do not remove checkout/cart flow
- [ ] Do not calculate prices locally beyond display
- [ ] Do not show more than 6 items before See All unless admin config says so
- [ ] Do not create horizontal scroll on Home
- [ ] Do not change the existing cart quantity behavior

### Testing checklist
- [ ] Home loads from dashboard API
- [ ] Offers render from admin data
- [ ] Category grid renders from admin data
- [ ] Product blocks render 3 per row
- [ ] Combo blocks render 3 per row
- [ ] Two rows max before See All
- [ ] Empty section does not crash Home
- [ ] Missing images render fallback UI
- [ ] Long names do not overlap card controls
- [ ] API partial failure does not blank the full dashboard

---

## 11. Mobile See All Flow

### Goal
Open the full product list for a dashboard block.

### Files likely changed
- `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js`
- `Frontend-V1/src/screens/customer/ProductListScreen/ProductListScreen.js`
- `Frontend-V1/src/api/dashboardApi.js`

### Subtasks
- [ ] Add `See All` button beside section titles
- [ ] Navigate with `sectionId`, `sectionSlug`, and `sectionTitle`
- [ ] ProductList detects dashboard section params
- [ ] ProductList loads full section item list from backend
- [ ] ProductList keeps search/sort where useful
- [ ] ProductList title uses admin block title
- [ ] ProductList handles deleted/hidden section slug with a friendly empty/error state
- [ ] ProductList paginates or lazy-loads large section lists if needed

### Things to avoid
- [ ] Do not create a new screen if ProductList can handle the flow
- [ ] Do not show dashboard-only hidden items in See All
- [ ] Do not break existing category ProductList navigation
- [ ] Do not navigate to a broken screen when a section is deleted after Home loaded

### Testing checklist
- [ ] See All opens correct products
- [ ] See All works for combo blocks
- [ ] See All works for custom product blocks
- [ ] Back navigation returns to Home
- [ ] Deleted section link recovers gracefully
- [ ] Large See All list remains smooth

---

## 12. Backward Compatibility

### Goal
Avoid breaking current mobile dashboard while dashboard sections are being implemented.

### Subtasks
- [ ] Keep existing category/product/offer APIs until migration is complete
- [ ] Seed default dashboard sections from current data
- [ ] If `/api/dashboard` returns empty, mobile can fall back to current calls temporarily
- [ ] Keep existing Offers/Categories/Products/Combos admin pages working
- [ ] Avoid changing current product/cart/order payloads

### Things to avoid
- [ ] Do not remove existing active offer endpoint immediately
- [ ] Do not remove `products.is_combo`
- [ ] Do not remove category/product CRUD

### Testing checklist
- [ ] Old app flow still works during rollout
- [ ] Empty dashboard config has safe fallback
- [ ] Existing admin pages still build

---

## 13. Edge Cases And Data Integrity

### Goal
Make admin-managed dashboard content reliable even when records change after being added to the Home screen.

### Cases to handle
- Linked product/category/offer/combo is deleted after being added to a section
- Linked item is hidden or unavailable after being added to a section
- Linked image is deleted from image storage
- Admin adds duplicate item to the same section
- Admin changes store type after items were already selected
- Section has no valid visible items
- Section title, category name, or product name is very long
- Multiple admins edit the same section at the same time
- Scheduled section crosses midnight or timezone boundaries
- Mobile opens `See All` after the section was deleted

### Subtasks
- [ ] Add server-side filtering for missing or invalid linked records
- [ ] Add duplicate item validation per section
- [ ] Add store-type compatibility validation and warnings
- [ ] Add empty-section behavior rule:
  - [ ] Hide empty offer/category/product/combo sections by default
  - [ ] Allow explicit admin-configured empty states only if needed later
- [ ] Add missing image fallback in API mapper or frontend components
- [ ] Add max length validation for section titles and item labels
- [ ] Add frontend truncation for long names
- [ ] Add optimistic concurrency/version checks for admin edits
- [ ] Add timezone-safe schedule comparison using backend server time
- [ ] Add friendly mobile recovery for deleted/hidden section links

### Things to avoid
- [ ] Do not allow invalid dashboard data to crash Home
- [ ] Do not silently show stale hidden/deleted products
- [ ] Do not silently drop admin changes without explaining why
- [ ] Do not rely only on frontend validation

### Testing checklist
- [ ] Missing linked record is skipped safely
- [ ] Hidden linked record is skipped safely
- [ ] Duplicate section item is rejected
- [ ] Empty block is hidden or handled intentionally
- [ ] Long text stays inside cards
- [ ] Concurrent edit conflict is detected
- [ ] Deleted section See All route shows a friendly state

---

## 14. Performance And Caching

### Goal
Keep the mobile Home screen fast as admin adds more dashboard blocks and products.

### Subtasks
- [ ] Prefer one public dashboard API call for Home
- [ ] Avoid N+1 queries when loading section items
- [ ] Batch load products, categories, offers, images, and combo items
- [ ] Add indexes for `section_type`, `store_type`, `active`, `display_order`, and `section_id`
- [ ] Add response `updatedAt` or `version` metadata for cache freshness
- [ ] Add pagination/limit for full section item lists
- [ ] Keep dashboard payload small by returning only mobile-needed fields
- [ ] Consider short-lived server caching after correctness is proven

### Things to avoid
- [ ] Do not make Home call one endpoint per dashboard block
- [ ] Do not return full product/admin records to mobile
- [ ] Do not cache stale admin changes for too long

### Testing checklist
- [ ] Home loads with 10+ sections
- [ ] See All loads section with 50+ items
- [ ] Query count is reasonable for dashboard API
- [ ] Admin changes reflect after refresh without stale data confusion

---

## 15. Permissions And Audit

### Goal
Keep dashboard management limited to authorized admins and trace content changes.

### Subtasks
- [ ] Protect all admin dashboard APIs with admin auth middleware
- [ ] Verify non-admin/customer tokens cannot call dashboard admin APIs
- [ ] Log create/update/delete/reorder actions with admin id
- [ ] Log before/after values for important content changes
- [ ] Include enough audit data to debug accidental Home changes
- [ ] Avoid exposing audit records in public mobile dashboard API

### Things to avoid
- [ ] Do not allow mobile app users to edit dashboard sections
- [ ] Do not expose admin names, ids, or audit history in public responses
- [ ] Do not make audit logging block normal saves unless storage fails critically

### Testing checklist
- [ ] Unauthorized admin API calls are rejected
- [ ] Customer token cannot edit dashboard
- [ ] Admin edits create audit records
- [ ] Public dashboard response contains no audit fields

---

## 16. Rollout Plan

### Goal
Ship the admin-controlled dashboard without breaking the current customer Home screen.

### Subtasks
- [ ] Implement backend data model and public API first
- [ ] Seed default dashboard sections from current categories/offers/combos
- [ ] Keep mobile fallback to old APIs during initial rollout
- [ ] Build admin Mobile Dashboard page after backend APIs are stable
- [ ] Switch Home screen to dashboard API with fallback
- [ ] Verify current cart, checkout, order, and profile flows after switch
- [ ] Remove fallback only after production-like testing is complete

### Things to avoid
- [ ] Do not switch mobile Home to a new API before default sections exist
- [ ] Do not remove old endpoints before all app versions are migrated
- [ ] Do not combine dashboard rollout with unrelated UI redesign work

### Testing checklist
- [ ] Old Home data appears through seeded dashboard sections
- [ ] Mobile still works if dashboard API temporarily fails
- [ ] Admin can change a section and mobile reflects it
- [ ] Rollback path is clear if dashboard API has issues

---

## 17. Backend Tests

### Goal
Verify dashboard section APIs and data rules.

### Subtasks
- [ ] Test dashboard section create/update/delete
- [ ] Test dashboard section reorder
- [ ] Test section item add/remove/reorder
- [ ] Test public dashboard returns only active sections
- [ ] Test hidden/deleted products are excluded
- [ ] Test combo block returns combo item composition
- [ ] Test product block returns selected products
- [ ] Test category grid returns selected categories
- [ ] Test offer banner returns selected offer
- [ ] Test expired/future scheduled sections are excluded
- [ ] Test duplicate item add is rejected
- [ ] Test stale admin version update is rejected
- [ ] Test missing linked records do not break public dashboard

### Testing checklist
- [ ] Backend lint passes
- [ ] Backend tests pass
- [ ] No existing cart/order/product tests regress

---

## 18. Admin Manager Tests

### Goal
Verify web admin can control the mobile dashboard.

### Subtasks
- [ ] Test Mobile Dashboard page loads
- [ ] Test create product block
- [ ] Test create combo block
- [ ] Test add/remove products in block
- [ ] Test add/remove combos in block
- [ ] Test reorder sections
- [ ] Test hide/show section
- [ ] Test delete section
- [ ] Test validation errors
- [ ] Test schedule fields
- [ ] Test duplicate item error UI
- [ ] Test concurrent edit conflict UI

### Testing checklist
- [ ] `adminManager-V1 npm run lint` passes
- [ ] `adminManager-V1 npm run build` passes
- [ ] Admin changes are persisted through backend APIs

---

## 19. Frontend Tests

### Goal
Verify the mobile dashboard reflects admin changes.

### Subtasks
- [ ] Test dashboard API mapper
- [ ] Test Home renders offer section
- [ ] Test Home renders category section
- [ ] Test Home renders product block section
- [ ] Test Home renders combo block section
- [ ] Test 3 cards per row sizing on common phone widths
- [ ] Test 2 rows max before See All
- [ ] Test See All navigation params
- [ ] Test combo add-to-cart still expands included products
- [ ] Test missing images use fallback
- [ ] Test long labels stay inside cards
- [ ] Test deleted section See All recovery

### Testing checklist
- [ ] `Frontend-V1 npm run lint` passes
- [ ] `Frontend-V1 npm test -- --runInBand` passes
- [ ] No horizontal scroll on Home
- [ ] Product/card text stays inside cards

---

## 20. Final End-To-End Verification

### Goal
Confirm admin-to-mobile dashboard control works in real flow.

### Steps
- [ ] Start `Backend-V1`
- [ ] Start `adminManager-V1`
- [ ] Start `Frontend-V1`
- [ ] Login to admin web
- [ ] Create offer banner
- [ ] Confirm offer appears on mobile Home
- [ ] Create category grid section
- [ ] Add category cards
- [ ] Confirm categories appear on mobile Home
- [ ] Create combo with three included products
- [ ] Create `Popular Combos` block
- [ ] Add combo to block
- [ ] Confirm mobile shows combo card
- [ ] Add combo from mobile
- [ ] Confirm cart contains included products separately
- [ ] Create `Milk Products` product block
- [ ] Add more than 6 products
- [ ] Confirm mobile shows 6 in 2 rows
- [ ] Tap See All
- [ ] Confirm all block products appear
- [ ] Hide block in admin
- [ ] Confirm block disappears from mobile
- [ ] Run `graphify update .`

### Acceptance criteria
- [ ] Admin controls mobile offer banners
- [ ] Admin controls dashboard category cards
- [ ] Admin controls combo creation and combo contents
- [ ] Admin controls dashboard combo blocks
- [ ] Admin can create custom product blocks such as `Milk Products`
- [ ] Mobile dashboard renders product/combo block cards 3 per row
- [ ] Mobile dashboard shows only 2 rows before See All
- [ ] See All opens the full selected block
- [ ] Admin changes reflect in mobile through backend APIs
- [ ] Existing cart, checkout, product, category, order, and profile flows still work
