# Admin Manager V1 Tasks

This file is the implementation handoff for the independent laptop admin website. It is written so another AI agent or developer can pick up one task at a time without guessing the scope.

## AI Handoff Rules
- [ ] Work in task ID order unless a later task explicitly says it can run in parallel.
- [ ] Mark a checkbox complete only after code is implemented, verified, and any required tests/checks pass.
- [ ] Keep `adminManager-V1`, `Frontend-V1`, and `Backend-V1` independent. The admin website must talk to the backend only through HTTP APIs.
- [ ] Do not import code from `Frontend-V1` into `adminManager-V1`.
- [ ] Do not access MySQL or MongoDB directly from `adminManager-V1`.
- [ ] Use `Backend-V1` as the only source of truth for products, categories, orders, customers, settings, offers, and images.
- [ ] Preserve mobile compatibility. Any backend response changes must still work with `Frontend-V1`.
- [ ] Prefer safe admin behavior: soft delete or hide records that may be referenced by orders.
- [ ] Do not add customer password editing, customer phone identity editing, or historical order total editing.
- [ ] Use clear loading, empty, error, success, and confirmation states for every admin action.
- [ ] After code changes, run relevant checks and `graphify update .`.

## Implementation Phases
- [ ] **Phase 1:** Scaffold `adminManager-V1`, API client, auth, layout, and route protection.
- [ ] **Phase 2:** Implement backend gaps needed by the admin panel.
- [ ] **Phase 3:** Build dashboard, products, categories, combos, offers, images, orders, customers, settings, reports, health, and audit pages.
- [ ] **Phase 4:** Verify all admin changes reflect in the mobile app.
- [ ] **Phase 5:** Run tests, builds, lint checks, and final manual acceptance.

## TASK-AM-001: Project Setup
**Goal:** Create the standalone React admin web project.

**Depends on:** None.

**Deliverables:**
- [x] `adminManager-V1/package.json`
- [x] `adminManager-V1/.env.example`
- [x] `adminManager-V1/index.html`
- [x] `adminManager-V1/src` app structure

**Subtasks:**
- [x] Create a Vite + React app inside `adminManager-V1`.
- [x] Add npm scripts:
  - [x] `npm run dev`
  - [x] `npm run build`
  - [x] `npm run lint`
- [x] Add `.env.example` with `VITE_API_BASE_URL=http://localhost:3000/api`.
- [x] Add base folders:
  - [x] `src/api`
  - [x] `src/components`
  - [x] `src/layout`
  - [x] `src/pages`
  - [x] `src/routes`
  - [x] `src/styles`
  - [x] `src/utils`
- [x] Add a basic app entry that renders without calling the backend.

**Acceptance:**
- [x] `npm install` succeeds inside `adminManager-V1`.
- [x] `npm run dev` starts the web app.
- [x] `npm run build` succeeds.

## TASK-AM-002: API Client Foundation
**Goal:** Create a reusable API layer for all backend communication.

**Depends on:** TASK-AM-001.

**Deliverables:**
- [x] Shared request client
- [x] Token storage helpers
- [x] API modules for each admin area
- [x] Response normalizer helpers

**Subtasks:**
- [x] Read API base URL from `VITE_API_BASE_URL`.
- [x] Default to `http://localhost:3000/api` if env is missing.
- [x] Store admin token in `localStorage`.
- [x] Attach `Authorization: Bearer <token>` for protected calls.
- [x] Parse JSON responses consistently.
- [x] Support `multipart/form-data` for image uploads.
- [x] Normalize backend `snake_case` and `camelCase` fields.
- [x] Handle 401 by clearing token and redirecting to login.
- [x] Add API modules:
  - [x] Auth API
  - [x] Dashboard API
  - [x] Orders API
  - [x] Products API
  - [x] Categories API
  - [x] Offers API
  - [x] Customers API
  - [x] Settings API
  - [x] Images API
  - [x] Reports API
  - [x] Health API
  - [x] Audit API

**Acceptance:**
- [x] All API modules use the shared client.
- [x] API errors expose a readable `message`.
- [x] Missing or expired token returns the user to login.

## TASK-AM-003: Admin Authentication
**Goal:** Add secure admin login/logout and route protection.

**Depends on:** TASK-AM-001, TASK-AM-002.

**Backend APIs:**
- `POST /api/admin/login`
- `GET /api/admin/me`

**Subtasks:**
- [x] Build login page with owner ID and password fields.
- [x] Validate empty owner ID and password before API call.
- [x] Submit login to `POST /api/admin/login`.
- [x] Save token and admin user after successful login.
- [x] Show invalid credential and network errors clearly.
- [x] Add logout action.
- [x] Add protected route wrapper.
- [x] Redirect unauthenticated users to login.
- [x] Check existing session with `GET /api/admin/me`.

**Acceptance:**
- [x] Valid admin credentials open the dashboard.
- [x] Invalid credentials show an error.
- [x] Logout clears token and returns to login.
- [x] Protected routes cannot be opened without a token.

## TASK-AM-004: Desktop Admin Shell
**Goal:** Build the main laptop-friendly admin layout.

**Depends on:** TASK-AM-003.

**Subtasks:**
- [x] Build fixed left sidebar navigation.
- [x] Build top header with page title, refresh action, and logout.
- [x] Build responsive content area for laptop and desktop widths.
- [x] Add nav items:
  - [x] Dashboard
  - [x] Orders
  - [x] Products / Items
  - [x] Combos
  - [x] Categories
  - [x] Offers
  - [x] Customers
  - [x] Settings
  - [x] Images
  - [x] Reports
  - [x] Backend Health
  - [x] Activity / Audit Log
- [x] Add global search or quick jump for orders, products, categories, and customers.
- [x] Add shared table controls:
  - [x] Pagination
  - [x] Sorting
  - [x] Search input
  - [x] Filter chips/dropdowns
  - [x] Column visibility where needed
- [x] Add shared UI states:
  - [x] Loading
  - [x] Empty
  - [x] Error
  - [x] Success toast
  - [x] Confirm dialog

**Acceptance:**
- [x] Sidebar navigation works for every section.
- [x] Layout is comfortable on laptop screens.
- [x] No admin page is reachable outside the protected shell.

## TASK-BE-001: Backend Gap Audit
**Goal:** Confirm which backend APIs exist and which are missing before building pages.

**Depends on:** None. Can run in parallel with frontend scaffold.

**Subtasks:**
- [x] Inventory existing routes in `Backend-V1/src/routes`.
- [x] Inventory existing controllers in `Backend-V1/src/controllers`.
- [x] Compare backend capabilities against this task file.
- [x] Create a short backend gap note in this file or a backend task note.
- [x] Do not duplicate APIs that already exist.

**Known missing or incomplete backend areas to verify:**
- [x] List all offers. -> **MISSING** (only `GET /offers/active` exists)
- [x] Hide/delete offers. -> **MISSING**
- [x] List image assets. -> **MISSING** (no `GET /images` exists)
- [x] Report APIs beyond current sales summary. -> **MISSING** (only `/reports/sales` exists)
- [x] Product combo metadata. -> **MISSING**
- [x] Product featured flag. -> **MISSING**
- [x] Product display order. -> **MISSING**
- [x] Product original price/MRP. -> **MISSING**
- [x] Product discount label. -> **MISSING**
- [x] Product filters for `category`, `storeType`, `featured`, `offerId`, `available`, and sort. -> **MISSING**
- [x] Category image URL resolution. -> **NEEDS UPDATE**
- [x] Category duplicate validation. -> **NEEDS UPDATE**
- [x] Customer detail with order history and lifetime spend. -> **MISSING**
- [x] Dashboard alerts for products/categories/offers missing images. -> **MISSING**
- [x] Backend health details for MySQL and MongoDB. -> **EXISTS** (`/health` provides mysql and mongodb status)
- [x] Audit/activity log events. -> **MISSING** entirely

**Acceptance:**
- [x] Every missing backend item is listed with an API decision.
- [x] Existing APIs are reused when possible.

## TASK-BE-002: Backend Support APIs And Migrations
**Goal:** Add backend support needed for the powerful admin panel.

**Depends on:** TASK-BE-001.

**Subtasks:**
- [x] Add all-offers list API.
- [x] Add offer hide/delete API.
- [x] Add image list API with filename, URL, type, size, alt text, created date, and usage if possible.
- [x] Add backend health API or reuse `/health` with detailed MySQL/MongoDB status.
- [x] Add missing report APIs if `GET /api/admin/reports/sales` is insufficient.
- [x] Add customer detail API with order history and totals if not already available.
- [x] Add product metadata migrations as needed:
  - [x] `type` or `is_combo`
  - [x] `featured`
  - [x] `display_order`
  - [x] `original_price`
  - [x] `discount_label`
- [x] Add soft-delete/hide support where hard delete is unsafe:
  - [x] Offers
  - [x] Products referenced by orders
  - [x] Categories containing products
- [x] Add audit/activity data model and APIs if audit log is implemented.
- [x] Add backend tests for each new route.
- [x] Add role-protection tests for admin-only APIs.

**Acceptance:**
- [ ] Backend tests pass.
- [ ] New APIs return stable JSON with readable errors.
- [ ] Mobile app still works with existing API calls.

## TASK-AM-005: Dashboard Page
**Goal:** Give admin a quick operational overview.

**Depends on:** TASK-AM-002, TASK-AM-003, existing dashboard/report APIs.

**Subtasks:**
- [x] Load dashboard metrics from `GET /api/admin/dashboard`.
- [x] Show today orders.
- [x] Show today sales.
- [x] Show pending orders.
- [x] Show delivered orders.
- [x] Show pending payment total.
- [x] Show cash and UPI totals.
- [x] Show latest orders.
- [x] Show out-of-stock product alerts.
- [x] Show top products.
- [x] Show shop open/closed state.
- [x] Add quick shop open/closed toggle through settings API.
- [x] Show delivery availability state.
- [x] Show weekly and monthly sales summary from reports API.
- [x] Show products/categories/offers missing images if backend supports it.
- [x] Add quick links to pending orders, products, offers, and settings.

**Acceptance:**
- [x] Dashboard loads after login.
- [x] Shop status toggle updates backend and reflects in mobile app.
- [x] Dashboard handles empty orders/products without crashing.

## TASK-AM-006: Orders Management
**Goal:** Let admin manage live orders from laptop.

**Depends on:** TASK-AM-002, TASK-AM-004.

**Backend APIs:**
- `GET /api/admin/orders`
- `GET /api/admin/orders/:id`
- `PATCH /api/admin/orders/:id/status`
- `PATCH /api/admin/orders/:id/payment`

**Subtasks:**
- [x] Build paginated orders table.
- [x] Add search by order number, customer name, and phone.
- [x] Add filters:
  - [x] Status
  - [x] Payment status
  - [x] Payment method
  - [ ] Date range
- [x] Add quick filters:
  - [x] Pending orders
  - [x] Preparing orders
  - [x] Out for delivery orders
  - [x] Delivered orders
  - [x] Cancelled orders
  - [x] Pending payments
- [x] Build order detail view/drawer.
- [x] Show order number, customer, phone, WhatsApp, address, map URL, note, item list, subtotal, delivery charge, night charge, total, payment method, payment status, status, created date, and cancel reason.
- [x] Add valid status update controls.
- [x] Add payment status update controls.
- [x] Prevent invalid status transitions before sending request.
- [x] Add one-click phone and WhatsApp actions.
- [x] Add map link action when `map_url` exists.
- [ ] Add printable order/invoice view.
- [ ] Add CSV export for filtered orders.
- [x] Show backend validation errors clearly.

**Acceptance:**
- [x] Status/payment changes persist in backend.
- [x] Mobile order screens show updated status/payment.
- [x] Terminal orders cannot be changed in the UI.

## TASK-AM-007: Products / Items Management
**Goal:** Let admin control all sellable non-combo items.

**Depends on:** TASK-AM-002, TASK-AM-004, category APIs, image APIs.

**Subtasks:**
- [ ] Build products table with pagination/search/filter.
- [ ] Add filters for category, availability, missing image, product type, featured, and combo status.
- [ ] Add product create form.
- [ ] Add product edit drawer/modal.
- [ ] Add product delete/hide action with confirmation.
- [ ] Add availability toggle.
- [ ] Add category assignment.
- [ ] Add product image upload/change.
- [ ] Add image cleanup flow when replacing product images.
- [ ] Add display order editing.
- [ ] Add fields:
  - [ ] Name
  - [ ] Price
  - [ ] Unit
  - [ ] Description
  - [ ] Category
  - [ ] Image
  - [ ] Availability
  - [ ] Featured flag if backend supports it
  - [ ] Original price/MRP if backend supports it
  - [ ] Discount label if backend supports it
  - [ ] Related products if backend supports it
- [ ] Add bulk actions:
  - [ ] Mark in stock/out of stock
  - [ ] Move selected products to category
  - [ ] Hide selected products

**Acceptance:**
- [ ] Product changes reflect in mobile product list, product detail, cart, and checkout.
- [ ] Product create/edit uses category IDs, not category free text.
- [ ] Image upload returns a visible image URL.

## TASK-AM-008: Combos Management
**Goal:** Manage combos as sellable products.

**Depends on:** TASK-AM-007 and backend combo metadata if needed.

**Decision:** V1 combos are product records, not bundle recipes.

**Subtasks:**
- [ ] Add combo section in sidebar.
- [ ] Reuse product create/edit components where practical.
- [ ] Mark combo records with backend-supported type or `is_combo`.
- [ ] Add combo table with search/filter.
- [ ] Add combo create form.
- [ ] Add combo edit form.
- [ ] Add combo hide/delete.
- [ ] Add combo category/type assignment.
- [ ] Add combo image upload/change.
- [ ] Add combo price, unit, description, availability, display order, and featured flag.
- [ ] Add combo filter in Products page.
- [ ] Confirm combos appear in the mobile app through product APIs.
- [ ] Confirm combos can be added to cart and ordered like normal products.

**Acceptance:**
- [ ] Combos are visible to customers when active/available.
- [ ] Combos can be hidden without deleting historical order data.

## TASK-AM-009: Categories Management
**Goal:** Control dashboard/category structure used by the mobile app.

**Depends on:** TASK-AM-002, image APIs, backend category APIs.

**Subtasks:**
- [ ] Build categories table/grid.
- [ ] Show product count per category.
- [ ] Add category create form.
- [ ] Add category rename/edit.
- [ ] Add category display order controls.
- [ ] Add active/inactive toggle.
- [ ] Add type selector:
  - [ ] Packed
  - [ ] Fast food
  - [ ] Combo if needed
- [ ] Add category image upload/change.
- [ ] Add category image preview and replacement cleanup.
- [ ] Auto-generate slug from category name when slug is missing.
- [ ] Validate duplicate names/slugs.
- [ ] Prevent hard delete when products exist; hide instead.
- [ ] Confirm category type controls mobile Packed Items / Fast Food filtering.
- [ ] Confirm category order controls mobile dashboard category grid order.

**Acceptance:**
- [ ] Category name/order/type changes reflect in mobile dashboard.
- [ ] Deleting a category with products does not break products or orders.

## TASK-AM-010: Offers Management
**Goal:** Manage all offer content shown in the mobile app.

**Depends on:** TASK-AM-002, image APIs, backend offer list/delete support.

**Subtasks:**
- [ ] Build offer history/list table.
- [ ] Add offer create form.
- [ ] Add offer edit form.
- [ ] Add activate/deactivate controls.
- [ ] Enforce one public active offer at a time in UI and backend if required.
- [ ] Add hide/delete old offers.
- [ ] Add offer image upload/change.
- [ ] Add offer image preview and replacement cleanup.
- [ ] Edit title, description, active status, and image.
- [ ] Add scheduling fields only if backend supports start/end dates later.
- [ ] Add product/category targeting only if backend supports offer rules later.

**Acceptance:**
- [ ] Active offer updates on the mobile dashboard.
- [ ] Inactive/hidden offers do not appear as active public offer.

## TASK-AM-011: Customers Management
**Goal:** Manage customer trust/block state and view customer history safely.

**Depends on:** TASK-AM-002, backend customer APIs.

**Subtasks:**
- [ ] Build customer table.
- [ ] Add search by name, phone, and WhatsApp.
- [ ] Add filters:
  - [ ] Trusted
  - [ ] Blocked
  - [ ] New customers
  - [ ] Customers with orders
- [ ] Build customer detail drawer.
- [ ] Show customer name, phone, WhatsApp, short address, full address, created date, updated date, trusted state, and blocked state.
- [ ] Show order count.
- [ ] Show customer order history if backend supports it.
- [ ] Show totals if backend supports them:
  - [ ] Total orders
  - [ ] Delivered orders
  - [ ] Cancelled orders
  - [ ] Lifetime spend
- [ ] Add trust/untrust action.
- [ ] Add block/unblock action with confirmation.
- [ ] Add one-click phone and WhatsApp actions.
- [ ] Avoid editing customer password or sensitive identity data.

**Acceptance:**
- [ ] Trust/block changes persist.
- [ ] Blocked customers cannot place new orders.

## TASK-AM-012: Settings Management
**Goal:** Let admin control shop, delivery, payment, and checkout settings.

**Depends on:** TASK-AM-002, settings API, image APIs for UPI QR if supported.

**Subtasks:**
- [ ] Load settings from backend.
- [ ] Update shop open/closed.
- [ ] Update delivery availability.
- [ ] Update minimum order amount.
- [ ] Update delivery charge.
- [ ] Update free delivery threshold.
- [ ] Update night charge.
- [ ] Update night charge start/end time.
- [ ] Update WhatsApp number.
- [ ] Update support/contact phone if backend exposes it.
- [ ] Update UPI ID.
- [ ] Upload/change UPI QR image if backend supports `upi_qr_image_id`.
- [ ] Update delivery time message.
- [ ] Validate time format.
- [ ] Add checkout impact preview:
  - [ ] Minimum order
  - [ ] Delivery charge
  - [ ] Free delivery threshold
  - [ ] Night charge

**Acceptance:**
- [ ] Setting changes affect mobile dashboard, cart, checkout, and backend order creation.
- [ ] Shop closed blocks new orders.
- [ ] Delivery disabled blocks checkout/order creation.

## TASK-AM-013: Image Management
**Goal:** Give admin visibility and control over uploaded images.

**Depends on:** TASK-AM-002, backend image list API.

**Subtasks:**
- [ ] Build image library page.
- [ ] Upload images.
- [ ] Preview uploaded images.
- [ ] List filename, size, MIME type, URL, alt text, and created date.
- [ ] Search/filter images by filename or usage.
- [ ] Show image usage:
  - [ ] Product image
  - [ ] Category image
  - [ ] Offer image
  - [ ] UPI QR image
  - [ ] Unused image
- [ ] Assign images to products.
- [ ] Assign images to categories.
- [ ] Assign images to offers.
- [ ] Prevent deleting images currently assigned to live entities.
- [ ] Allow deleting unused images after confirmation.
- [ ] Add alt text editing if backend supports it.
- [ ] Add image URL copy action.

**Acceptance:**
- [ ] Uploaded images can be used by products/categories/offers.
- [ ] Mobile app displays updated image URLs.

## TASK-AM-014: Reports & Analytics
**Goal:** Give admin useful business summaries and exports.

**Depends on:** Reports backend support.

**Subtasks:**
- [ ] Add reports page.
- [ ] Show sales report:
  - [ ] Today sales
  - [ ] Weekly sales
  - [ ] Monthly sales
- [ ] Add date range filters.
- [ ] Show payment method breakdown:
  - [ ] Cash
  - [ ] UPI
- [ ] Show payment status breakdown:
  - [ ] Pending
  - [ ] Paid
  - [ ] Failed
  - [ ] Refunded
- [ ] Show order status breakdown.
- [ ] Show top products report.
- [ ] Show customer report:
  - [ ] New customers
  - [ ] Trusted customers
  - [ ] Blocked customers
- [ ] Add CSV export for reports.

**Acceptance:**
- [ ] Reports match backend order/product/customer data.
- [ ] CSV export respects current filters.

## TASK-AM-015: Backend Health Page
**Goal:** Let admin see whether backend services are healthy.

**Depends on:** `/health` or detailed health API.

**Subtasks:**
- [ ] Add Backend Health sidebar page.
- [ ] Show API status.
- [ ] Show MySQL status.
- [ ] Show MongoDB status.
- [ ] Show current API base URL.
- [ ] Show last successful health check time.
- [ ] Add manual refresh.
- [ ] Show helpful troubleshooting text for failed checks.

**Acceptance:**
- [ ] Health page clearly distinguishes API, MySQL, and MongoDB failures.

## TASK-AM-016: Admin Safety & Audit
**Goal:** Reduce accidental damage and optionally record admin activity.

**Depends on:** Shared UI components and audit backend if implemented.

**Subtasks:**
- [ ] Add unsaved-change warnings for edit forms.
- [ ] Add confirmation dialogs for delete/hide/status/payment changes.
- [ ] Add clear success/error toast messages.
- [ ] Add audit log data model/API if activity history is required.
- [ ] Record admin activity for:
  - [ ] Login/logout
  - [ ] Product changes
  - [ ] Category changes
  - [ ] Offer changes
  - [ ] Settings changes
  - [ ] Order status/payment changes
  - [ ] Customer trust/block changes
  - [ ] Image uploads/deletes
- [ ] Add Activity / Audit Log page.
- [ ] Show latest admin activity.
- [ ] Prefer soft delete/hide for records referenced by orders.

**Acceptance:**
- [ ] High-impact actions require confirmation.
- [ ] Activity page works if audit backend is implemented.

## TASK-MOB-001: Mobile Reflection
**Goal:** Confirm web admin changes are visible in the mobile app.

**Depends on:** Related admin sections and backend APIs.

**Subtasks:**
- [ ] Confirm mobile dashboard reads categories from backend.
- [ ] Confirm mobile category grid uses backend order and active status.
- [ ] Confirm mobile Packed Items / Fast Food filters use backend category type.
- [ ] Confirm mobile products/items read from backend.
- [ ] Confirm mobile product list honors backend availability and category assignment.
- [ ] Confirm mobile product images update after admin image changes.
- [ ] Confirm mobile combos appear through product APIs.
- [ ] Confirm mobile active offer updates from backend.
- [ ] Confirm mobile offer banner updates after offer activation/deactivation.
- [ ] Confirm mobile shop settings update from backend.
- [ ] Confirm mobile cart and checkout use updated prices, minimum order, delivery charge, free delivery threshold, and night charge.
- [ ] Confirm mobile orders show updated order/payment status after admin changes.
- [ ] Confirm blocked customers are prevented from placing orders.
- [ ] Hide or disable phone admin access.

**Acceptance:**
- [ ] Every admin content/settings change listed above is reflected in the mobile app without a mobile app rebuild unless code changes are required.

## TASK-QA-001: Testing
**Goal:** Verify the web admin, backend APIs, and mobile reflection.

**Depends on:** Implemented feature sections.

**Subtasks:**
- [ ] Test admin login/logout.
- [ ] Test protected routes.
- [ ] Test dashboard loading.
- [ ] Test products CRUD.
- [ ] Test combos CRUD.
- [ ] Test categories CRUD/order.
- [ ] Test offers CRUD/activation.
- [ ] Test orders status/payment update.
- [ ] Test customers trust/block.
- [ ] Test settings updates.
- [ ] Test image upload/delete.
- [ ] Test reports and exports.
- [ ] Test backend health page.
- [ ] Test admin audit/activity page if implemented.
- [ ] Test form validation and unsaved-change warnings.
- [ ] Test role protection for all admin APIs.
- [ ] Test mobile reflection after each admin change type.
- [ ] Run backend tests.
- [ ] Run admin web build.
- [ ] Run focused lint checks.

**Acceptance:**
- [ ] All automated tests pass.
- [ ] `adminManager-V1` builds successfully.
- [ ] Critical admin workflows pass manual testing.

## TASK-QA-002: Final Verification
**Goal:** Complete the end-to-end acceptance pass.

**Depends on:** TASK-QA-001.

**Subtasks:**
- [ ] Start `Backend-V1`.
- [ ] Start `adminManager-V1`.
- [ ] Login from laptop browser.
- [ ] Make representative admin changes:
  - [ ] Product
  - [ ] Combo
  - [ ] Category
  - [ ] Offer
  - [ ] Settings
  - [ ] Order status
  - [ ] Customer block/trust
- [ ] Confirm changes appear in mobile app.
- [ ] Confirm no admin login/entry is exposed in the phone app.
- [ ] Confirm all destructive actions require confirmation.
- [ ] Confirm backend and web app recover cleanly from token expiry.
- [ ] Run `graphify update .`.

**Acceptance:**
- [ ] The admin website can manage app data from laptop.
- [ ] The mobile app reflects admin-managed data from backend APIs.
- [ ] The repo graph is updated.
