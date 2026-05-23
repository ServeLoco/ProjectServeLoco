# ServeLoco Backend Tasks

Use this checklist as the backend implementation handoff for ServeLoco V1. Each task is written so it can be assigned to an AI or developer one block at a time and completed without guessing.

Source references:
- `../mainPLAN.md`
- `../Frontend-V1/Tasks.md`
- Current frontend API modules under `../Frontend-V1/src/api`
- Current frontend response normalizers under `../Frontend-V1/src/utils/apiMappers.js`

Note: `mainPLAN.md` references `Frontend-V1/PLAN.md` and `Backend-V1/PLAN.md`, but those files are not present in this workspace. This checklist therefore uses `mainPLAN.md`, `Frontend-V1/Tasks.md`, and the current frontend code as the active contract.

## How To Use This Checklist

- [ ] Complete tasks in phase order unless a task explicitly says it can be built independently.
- [ ] Keep backend code JavaScript only. Do not add TypeScript.
- [ ] Every endpoint must return predictable JSON and stable HTTP status codes.
- [ ] Every frontend-facing money value must be calculated or verified by the backend.
- [ ] Every protected route must reject missing, invalid, expired, or wrong-role JWTs.
- [ ] Mark a task complete only after implementing code, adding tests where listed, and manually checking the behavior comment.
- [ ] Run the backend test suite and at least one frontend integration smoke pass before final acceptance.

## Global Backend Rules

- [ ] Use Node.js, Express.js, and JavaScript only.
- [ ] Store business data in MySQL.
- [ ] Store image records and image metadata in MongoDB.
- [ ] Never expose database credentials to the frontend.
- [ ] Use bcrypt for password hashing.
- [ ] Use JWT for customer and admin sessions.
- [ ] Use `.env` for configuration and never hardcode production secrets.
- [ ] Use centralized validation, error handling, and response formatting.
- [ ] Keep user-visible API error messages free of emoji characters because the frontend can display them directly.
- [ ] Return product `imageUrl` fields resolved by the backend when an image exists.
- [ ] Let the frontend use local fallback images when `imageUrl` is missing.
- [ ] Calculate cart totals, order totals, delivery charges, night charges, discounts, and payment status on the backend.
- [ ] Do not trust client-provided prices, totals, availability, customer trust state, or payment status.
- [ ] Keep API behavior compatible with the current React Native frontend.
- [ ] Return absolute public URLs for uploaded images, not filesystem paths, so React Native can load them from Android/iOS devices.

## Shared API Contract

- [ ] Use JSON responses for all non-image endpoints.
- [ ] Successful list endpoints should return either an array or an object containing one of `data`, `items`, `results`, `products`, `categories`, `orders`, or `customers`.
- [ ] Successful create/update endpoints should return the saved entity under a stable key such as `data`, `product`, `order`, `settings`, `offer`, or `image`.
- [ ] Auth endpoints must return a token under `token`, `jwt`, `accessToken`, or `access_token`, plus the user/admin profile.
- [ ] Error responses must include a human-readable `message`.
- [ ] Validation errors should include `code: "VALIDATION_ERROR"` and field details.
- [ ] Unauthorized errors should use `401`.
- [ ] Forbidden role or blocked-user errors should use `403`.
- [ ] Missing records should use `404`.
- [ ] Business rule failures such as minimum order, shop closed, unavailable item, or cancelled order should use `400` or `409` with a clear `message`.

Behavior comment: The frontend normalizers are flexible, but backend responses should still be consistent. Favor a simple shape such as `{ data: ... }` for objects and `{ data: [...] }` for lists, with useful aliases only where the frontend already expects them.

## Current Frontend Endpoint Inventory

- [ ] Public health endpoint: `GET /health`.
- [ ] Customer auth endpoints: `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/profile`.
- [ ] Public catalog endpoints: `GET /categories`, `GET /products`, `GET /products/:id`.
- [ ] Public image endpoint: `GET /images/:id` if the backend proxies or streams images.
- [ ] Public settings and offer endpoints: `GET /settings`, `GET /offers/active`.
- [ ] Customer cart/order endpoints: `POST /cart/calculate`, `POST /orders`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`.
- [ ] Admin auth endpoints: `POST /admin/login`, `GET /admin/me`.
- [ ] Admin dashboard endpoints: `GET /admin/dashboard`, `GET /admin/reports/sales`.
- [ ] Admin product endpoints: `GET /admin/products`, `GET /admin/products/:id`, `POST /admin/products`, `PATCH /admin/products/:id`, `DELETE /admin/products/:id`, `PATCH /admin/products/:id/availability`, `PATCH /admin/products/:id/image`.
- [ ] Admin image endpoints: `POST /admin/images`, `DELETE /admin/images/:id`.
- [ ] Admin order endpoints: `GET /admin/orders`, `GET /admin/orders/:id`, `PATCH /admin/orders/:id/status`, `PATCH /admin/orders/:id/payment`.
- [ ] Admin customer endpoints: `GET /admin/customers`, `PATCH /admin/customers/:id/trust`, `PATCH /admin/customers/:id/block`.
- [ ] Admin settings and offer endpoints: `GET /admin/settings`, `PATCH /admin/settings`, `GET /admin/offers/active`, `POST /admin/offers`, `PATCH /admin/offers/:id`.

Behavior comment: Implement this exact inventory before adding extra routes. The frontend already calls these paths, including the admin-only `GET /admin/settings` and `GET /admin/offers/active` aliases.

## Frontend Field Alias Contract

- [ ] Auth responses should include `token` and `user`; aliases `jwt`, `accessToken`, `access_token`, `customer`, or `profile` can also be accepted/returned.
- [ ] Product responses should include `id`, `name`, `price`, `unit`, `category`, `categoryId`, `available`, `imageUrl`, and optional `originalPrice`, `discountLabel`, `description`, `relatedProducts`.
- [ ] Category responses should include `id`, `name`, `productCount` or `count`, `type` or `storeType`, optional `imageUrl`, and optional `subcategories`.
- [ ] Settings responses should include `shopOpen` or `shop_open`, `minimumOrderAmount` or `minimum_order_amount`, `deliveryCharge` or `delivery_charge`, `nightCharge` or `night_charge`, `nightChargeStart` or `night_charge_start`, `nightChargeEnd` or `night_charge_end`, and support phone/WhatsApp.
- [ ] Cart calculation responses should include `subtotal`, `deliveryCharge`, `nightCharge`, `discount`, `grandTotal`, `minimumOrder`, and `paymentStatus`.
- [ ] Order responses should include `id`, `orderNumber`, `createdAt` or `created_at`, `status`, `paymentStatus`, `paymentMethod`, `itemCount`, `total`, `canCancel`, `address`, `mapUrl`, `customer`, `items`, and `bill`.
- [ ] Order item responses should include `id`, `productId`, `name`, `quantity`, `unitPrice` or `price`, `lineTotal`, and optional `unit` and `imageUrl`.
- [ ] Customer admin responses should include `id`, `name`, `phone`, `whatsappNumber` or `whatsapp`, `address`, `trusted`, and `blocked`.
- [ ] Dashboard responses should include `isShopOpen`, `metrics`, `reports`, `latestOrders`, `productAlerts`, and `topProducts`.
- [ ] Image responses should include `id`, `_id`, `url`, `imageUrl`, and `image_url`.

Behavior comment: The frontend accepts several aliases, but the backend should prefer camelCase in public JSON and may include snake_case aliases during integration to reduce mismatch risk.

## Phase B-01: Project Scaffold And Tooling

- [x] Create `package.json` inside `Backend-V1`.
- [x] Add scripts: `dev`, `start`, `test`, `lint`, and `db:migrate` if migrations are used.
- [x] Add Express app entrypoint, for example `src/server.js` and `src/app.js`.
- [x] Add folders: `src/config`, `src/db`, `src/middleware`, `src/routes`, `src/controllers`, `src/services`, `src/repositories`, `src/validators`, `src/utils`, `src/tests` or `tests`.
- [x] Add `.env.example` with all required variables.
- [x] Add `.gitignore` entries for `.env`, logs, uploads, and coverage.
- [x] Add request body JSON parsing with safe size limits.
- [x] Add request logging for development.
- [x] Add `GET /health`.

Behavior comment: `GET /health` must work before database features are complete and should return a small JSON payload such as `{ "status": "ok" }`.

Acceptance checks:
- [ ] `npm install` succeeds in `Backend-V1`.
- [ ] `npm run dev` starts the API.
- [ ] `GET /health` returns `200`.

## Phase B-02: Environment And Configuration

- [x] Load environment variables through a single config module.
- [x] Validate required env values at startup.
- [x] Support `PORT`, `NODE_ENV`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `ADMIN_OWNER_ID`, `ADMIN_PASSWORD`, `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MONGODB_URI`, `MONGODB_DATABASE`, and `CORS_ORIGIN`.
- [x] Support image/runtime variables such as `PUBLIC_BASE_URL`, `UPLOAD_DIR`, `MAX_IMAGE_SIZE_MB`, and `STATIC_UPLOAD_PATH` when disk uploads are used.
- [x] Provide local defaults only where safe.
- [x] Use local testing defaults for admin owner id `9350238504` and password `admin143` only when production env is not active.
- [x] Add a startup error if `JWT_SECRET` is unsafe in production.
- [x] Configure CORS for mobile/web local testing.
- [x] Bind the local dev server so the Android emulator frontend default `http://10.0.2.2:3000` can reach it.
- [x] Handle CORS preflight `OPTIONS` requests for every API route.

Behavior comment: Production should fail loudly when secrets or database settings are missing. Local development can be forgiving, but only for non-sensitive defaults.

## Phase B-03: Database Connections

- [x] Create a MySQL connection pool.
- [x] Create a MongoDB client connection.
- [x] Add graceful shutdown for both database clients.
- [x] Add connection health checks used by diagnostics.
- [x] Avoid opening a new database connection per request.
- [x] Normalize database errors before they reach controllers.

Behavior comment: Backend routes should not import raw connection setup directly. Controllers should call services, services should call repositories, and repositories should own SQL/Mongo queries.

## Phase B-04: MySQL Schema And Seed Data

- [x] Create `users` table with `id`, `name`, `phone`, `password_hash`, `whatsapp_number`, `address`, `trusted`, `blocked`, timestamps.
- [x] Create `categories` table with `id`, `name`, `slug`, `type`, `image_id`, `active`, timestamps.
- [x] Create `products` table with `id`, `name`, `price`, `category_id`, `unit`, `description`, `image_id`, `available`, timestamps.
- [x] Create `orders` table with customer snapshot fields, GPS fields, totals, payment fields, status, note, cancel reason, timestamps.
- [x] Create `order_items` table with order/product snapshot fields and line totals.
- [x] Create `settings` table with shop status, minimum order, delivery charge, free delivery threshold, night charge config, WhatsApp/support info, UPI info, delivery time message.
- [x] Create `offers` table with title, description, image id, active flag, timestamps.
- [x] Add a uniqueness strategy for daily `order_number` generation so two simultaneous orders cannot receive the same short number.
- [x] Store order status and payment status with constrained values, or validate them strictly in services before writing.
- [x] Store payment method values compatible with the frontend: `Cash` and `UPI`.
- [x] Add indexes for phone, slug, product category, order customer id, order status, created date, active offer.
- [x] Seed default settings with minimum order `149`, night charge window `21:00` to `07:00`, and sensible local delivery values.
- [x] Seed the six frontend categories: `Cold Drinks`, `Snacks`, `Fast Food`, `Groceries`, `Desserts`, and `Daily Essentials`.
- [x] Seed optional sample products for local frontend testing.
- [x] Make migrations and seed scripts idempotent so they can be safely re-run in development.

Behavior comment: Store snapshots on orders and order items. If a product name or price changes later, old orders must still show the original purchased data.

## Phase B-05: MongoDB Image Store

- [x] Create `images` collection with `_id`, `filename`, `originalName`, `mimeType`, `size`, `storageType`, `url`, `gridFsFileId`, `altText`, timestamps.
- [x] Decide local V1 storage mode: disk URL, cloud URL, or GridFS.
- [x] If using disk storage, serve uploaded files from a backend-controlled static path.
- [x] If using GridFS, add streaming support for `GET /images/:id`.
- [x] Generate image URLs from `PUBLIC_BASE_URL` or the incoming request host, not from local filesystem locations.
- [x] Validate image MIME type and file size.
- [x] Return image data with `id`, `_id`, `url`, `imageUrl`, and `image_url` aliases for frontend compatibility.
- [x] Delete unused image records when admin deletes or replaces product images.

Behavior comment: Admin image upload must return an immediately displayable URL. The frontend product form fails intentionally if upload succeeds but no image URL is returned.

## Phase B-06: Validation And Error Middleware

- [x] Add reusable validators for phone, required string, numeric amount, boolean, enum, id, coordinates, and pagination.
- [x] Add route-level validation before services run.
- [x] Accept both camelCase and snake_case request fields where the frontend sends both.
- [x] Add centralized async handler wrapper.
- [x] Add global error handler.
- [x] Add not-found route handler.
- [x] Convert database duplicate-key errors into readable validation errors.
- [x] Never leak stack traces in production responses.

Behavior comment: Frontend screens show `error.message` directly in many places, so backend messages must be short, user-safe, and actionable.

## Phase B-07: Passwords, JWT, And Auth Middleware

- [x] Add bcrypt hashing helper.
- [x] Add password compare helper.
- [x] Add JWT sign helper for customers.
- [x] Add JWT sign helper for admins.
- [x] Add customer auth middleware for `auth: "customer"` frontend calls.
- [x] Add admin auth middleware for `auth: "admin"` frontend calls.
- [x] Add role separation so a customer token cannot access admin routes and an admin token cannot masquerade as a customer.
- [x] Add token payloads with stable `sub`, `role`, and issued/expiry fields.
- [x] Add a helper for reading `Authorization: Bearer <token>` and returning consistent missing-token errors.

Behavior comment: Session restore uses `/auth/me` and `/admin/me`. Expired or invalid tokens should return `401` so the frontend can clear or block the session cleanly.

## Phase B-08: Customer Auth And Profile

- [ ] Implement `POST /auth/signup`.
- [ ] Implement `POST /auth/login`.
- [ ] Implement `GET /auth/me`.
- [ ] Implement `PATCH /auth/profile`.
- [ ] Validate signup fields: name/fullName, phone, password, address/deliveryAddress, optional WhatsApp number.
- [ ] Normalize phone numbers consistently.
- [ ] Reject duplicate phone signup.
- [ ] Hash passwords before storage.
- [ ] Return customer token and profile after signup/login.
- [ ] Exclude `password_hash` from every response.
- [ ] Let customers update name, WhatsApp number, and delivery address.
- [ ] Accept profile update aliases: `name`, `fullName`, `whatsappNumber`, `whatsapp`, `deliveryAddress`, and `address`.
- [ ] Include `trusted` and `blocked` in admin responses; expose customer-facing status only if useful and safe.

Behavior comment: The frontend sends both camelCase and snake_case aliases for some fields. Accept both, but store one clean canonical form in MySQL.

Tests:
- [ ] Signup creates a user and returns a token.
- [ ] Duplicate phone is rejected.
- [ ] Login rejects wrong password.
- [ ] `/auth/me` requires a customer token.
- [ ] Profile update persists only allowed fields.

## Phase B-09: Admin Auth

- [x] Implement `POST /admin/login`.
- [x] Implement `GET /admin/me`.
- [x] Accept `ownerId` or `owner_id` plus password.
- [x] Compare credentials against env-configured admin owner id and password.
- [x] Return admin token and minimal admin profile.
- [x] Never return the admin password.
- [x] Add rate-limit protection or a simple login throttle.

Behavior comment: Admin JWT must be stored separately by the frontend, and admin routes must reject customer JWTs even if the token is otherwise valid.

Tests:
- [ ] Default local admin can log in with local env.
- [ ] Wrong password is rejected.
- [ ] Customer token cannot access `/admin/me`.

## Phase B-10: Public Settings And Offers

- [x] Implement `GET /settings`.
- [x] Implement `GET /offers/active`.
- [x] Return settings fields accepted by the frontend normalizer: `shopOpen` or `shop_open`, `minimumOrderAmount` or `minimum_order_amount`, `deliveryCharge` or `delivery_charge`, `nightCharge` or `night_charge`, support phone/WhatsApp, active offer.
- [x] Return only one active public offer.
- [x] Return `204` or `{ data: null }` safely when no offer exists; the frontend has fallback offer text.
- [x] Include safe fallback values when settings row is missing by creating or loading defaults.

Behavior comment: Home, Cart, and Checkout depend on settings. This endpoint should be fast, cacheable if needed, and safe for unauthenticated users.

## Phase B-11: Categories API

- [x] Implement `GET /categories`.
- [x] Support query filters `type` and `storeType`.
- [ ] Use consistent `type` values for mode filtering, for example `packed` and `fast_food`, and map them to frontend labels `Packed Items` and `Fast Food`.
- [ ] Return active categories only for public requests.
- [ ] Include product counts.
- [ ] Include `imageUrl` when category image exists.
- [ ] Include optional `subcategories` or `chips` when available.
- [ ] Ensure seeded category names match frontend visible labels.

Behavior comment: `Packed Items` and `Fast Food` mode in the frontend filters categories using category `type`, `storeType`, or name matching. Backend should provide `type` values so the UI does not rely only on names.

## Phase B-12: Products API

- [x] Implement `GET /products`.
- [x] Implement `GET /products/:id`.
- [ ] Support query filters used by the frontend: `search`, `q`, `categoryId`, `category`, `storeType`, `featured`, `limit`, `offerId`, `available`, and sort fields if practical.
- [ ] Treat `offerId=active_offer` as the current active offer filter, because Home navigates to Product List with that value.
- [ ] Return active/available product data with `id`, `name`, `price`, `unit`, `description`, `category`, `categoryId`, `available`, `imageUrl`, `discountLabel` when applicable.
- [ ] Include `originalPrice` or `mrp` when discount display is needed.
- [ ] Join category names for display.
- [ ] Resolve `image_id` into `imageUrl`.
- [ ] Include `relatedProducts` on product detail when possible.
- [ ] Keep long descriptions on product detail only.

Behavior comment: The frontend can filter locally, but the backend should still honor common filters to keep mobile payloads small and results predictable.

Tests:
- [ ] Product list returns image URLs for products with images.
- [ ] Product detail returns `404` for missing products.
- [ ] Unavailable products are visible but marked `available: false` unless a query asks to hide them.

## Phase B-13: Cart Calculation

- [x] Implement `POST /cart/calculate`.
- [ ] Require customer auth for current frontend compatibility.
- [ ] Accept payload `{ items: [{ productId, quantity }] }`.
- [ ] Validate duplicate item ids by merging quantities or rejecting the payload consistently.
- [ ] Validate quantities as positive integers with a reasonable maximum.
- [ ] Fetch products from MySQL by id.
- [ ] Reject missing, inactive, or unavailable products with clear item-level details.
- [ ] Ignore client-provided prices.
- [ ] Calculate item line totals from database price.
- [ ] Calculate subtotal.
- [ ] Apply delivery charge from settings.
- [x] Apply free delivery threshold if configured.
- [x] Apply night charge during `21:00` to `07:00`.
- [x] Apply active offer or discount only if V1 offer rules are implemented.
- [x] Return `subtotal`, `deliveryCharge`, `nightCharge`, `discount`, `grandTotal`, `minimumOrder`, `paymentStatus`, and optionally normalized `items`.
- [x] Return both `grandTotal` and `total` during integration so every screen and mapper can read the amount.
- [x] Include a minimum order warning or failure detail when subtotal is below minimum.

Behavior comment: The frontend uses cart calculation in Cart and Checkout and disables checkout if this call fails. It must be reliable and must be the source of truth for totals.

Tests:
- [ ] Totals are correct for subtotal `98`.
- [ ] Totals are correct for subtotal `99`.
- [ ] Totals are correct for subtotal `149`.
- [ ] Totals are correct for subtotal `199`.
- [ ] Totals are correct for subtotal `200`.
- [ ] Night charge is applied from 9 PM to 7 AM.
- [ ] Client price spoofing cannot change totals.

## Phase B-14: Order Creation

- [x] Implement `POST /orders`.
- [ ] Require customer auth.
- [ ] Accept payload fields: `items`, `deliveryAddress` or `address`, `coordinates`, `paymentMethod`.
- [ ] Accept coordinates as `{ lat, lng }` and also tolerate `{ latitude, longitude }`.
- [ ] Recalculate cart totals inside order creation.
- [ ] Reject blocked customers.
- [ ] Reject closed shop checkout.
- [ ] Reject subtotal below minimum order.
- [ ] Reject unavailable or missing products.
- [ ] Generate daily short order numbers such as `SL-102`.
- [ ] Store customer snapshot: name, phone, WhatsApp, address.
- [ ] Store latitude, longitude, and generated Google Maps URL when coordinates exist.
- [ ] Generate a web Google Maps URL in addition to storing raw coordinates.
- [ ] Store payment method and initial payment status.
- [ ] Default payment method to `Cash` and payment status to `Pending` unless a supported payment state is explicitly provided by backend logic.
- [ ] Use a MySQL transaction for order and order items.
- [ ] Return the created order with `id`, `orderNumber`, `status`, `paymentStatus`, `total`, `address`, `mapUrl`, and `items`.

Behavior comment: Checkout calls `/cart/calculate` before `/orders`, but `/orders` must still recalculate everything again. The frontend check is UX only, not security.

Tests:
- [ ] Valid order creates rows in `orders` and `order_items`.
- [ ] Blocked customer cannot order.
- [ ] Closed shop blocks order.
- [ ] Minimum order blocks order.
- [ ] Transaction rolls back if an order item insert fails.

## Phase B-15: Customer Orders

- [x] Implement `GET /orders`.
- [x] Implement `GET /orders/:id`.
- [x] Implement `POST /orders/:id/cancel`.
- [x] Return only the authenticated customer's orders.
- [x] Sort latest orders first.
- [x] Return `orderNumber` as well as `id` so cards can display friendly order ids.
- [x] Include item count, preview image, payment status, order status, total, and `canCancel`.
- [x] Return full item list and bill summary on order detail.
- [x] Include delivery address and map URL when present.
- [x] Allow cancellation only before `Delivered` and when order is not already cancelled.
- [x] Store cancel reason if provided.

Behavior comment: The frontend shows Cancel buttons based on `canCancel`, but the backend must still enforce cancellation rules.

Tests:
- [ ] Customer cannot view another customer's order.
- [ ] Cancel before delivered succeeds.
- [ ] Cancel delivered order fails.
- [ ] Cancelled order shows updated status in list and detail.

## Phase B-16: Admin Dashboard And Reports

- [ ] Implement `GET /admin/dashboard`.
- [ ] Implement `GET /admin/reports/sales`.
- [ ] Require admin auth.
- [ ] Return dashboard metrics: today orders, today sales, pending orders, delivered orders, cash total, UPI total, pending payment total.
- [ ] Return metrics under both `metrics` and top-level aliases during early integration if simple.
- [ ] Return sales report values for today, week, and month.
- [ ] Return latest orders with pending orders first.
- [ ] Return product alerts for unavailable products and optional low stock values.
- [ ] Return top 5 products by quantity sold or sales amount.
- [ ] Include current shop open status.

Behavior comment: Admin dashboard should load useful operations data with one request even when there are no orders. Empty metrics should be zero, not missing fields.

## Phase B-17: Admin Orders

- [ ] Implement `GET /admin/orders`.
- [ ] Implement `GET /admin/orders/:id`.
- [ ] Implement `PATCH /admin/orders/:id/status`.
- [ ] Implement `PATCH /admin/orders/:id/payment`.
- [ ] Require admin auth.
- [ ] Support filters for `status`, `paymentStatus`, `paymentMethod`, search, and date range if practical.
- [ ] Accept query aliases such as `payment_status`, `payment_method`, `dateFrom`, `dateTo`, `from`, and `to` if filters are implemented.
- [ ] Sort pending orders first by default, then newest.
- [ ] Return customer phone, WhatsApp, address, GPS/map URL, total, payment status, and order status.
- [ ] Accept status values `Pending`, `Preparing`, `Out for Delivery`, `Delivered`, and `Cancelled`.
- [ ] Accept payment values `Pending`, `Paid`, `Failed`, and `Refunded`.
- [ ] Validate illegal status transitions if business rules require it.
- [ ] Return the updated order after status/payment changes.

Behavior comment: Admin order detail has separate buttons for status and payment updates. Each endpoint should update only its own field and leave the other fields unchanged.

Tests:
- [ ] Admin can list orders.
- [ ] Admin can update status.
- [ ] Admin can update payment status.
- [ ] Customer token cannot access admin orders.

## Phase B-18: Admin Products

- [ ] Implement `GET /admin/products`.
- [ ] Implement `GET /admin/products/:id`.
- [ ] Implement `POST /admin/products`.
- [ ] Implement `PATCH /admin/products/:id`.
- [ ] Implement `DELETE /admin/products/:id`.
- [ ] Implement `PATCH /admin/products/:id/availability`.
- [ ] Implement `PATCH /admin/products/:id/image`.
- [ ] Require admin auth for every admin product route.
- [ ] Accept product payload fields: `name`, `category`, `categoryId`, `price`, `unit`, `description`, `available`, `isAvailable`, `imageId`, `image_id`, `imageUrl`.
- [ ] Accept `focusImage` only as a frontend route hint; do not require it in backend APIs.
- [ ] Create category by name only if that behavior is explicitly desired; otherwise validate that the category exists.
- [ ] Validate price as a non-negative number.
- [ ] Resolve category display fields in responses.
- [ ] Resolve image URLs in responses.
- [ ] Soft delete products if old orders reference them, or hard delete only when safe.
- [ ] Availability endpoint should only change availability.
- [ ] Image attach endpoint should connect Mongo image records to product `image_id`.

Behavior comment: Product deletion must not break old orders. If in doubt, mark products inactive/unavailable instead of deleting rows that order history depends on.

Tests:
- [ ] Product create returns saved id.
- [ ] Product update changes only allowed fields.
- [ ] Availability toggle updates without changing price/name.
- [ ] Image attach returns product with usable `imageUrl`.
- [ ] Delete does not remove order history data.

## Phase B-19: Admin Images

- [ ] Implement `POST /admin/images`.
- [ ] Implement `DELETE /admin/images/:id`.
- [ ] Implement public `GET /images/:id` if image streaming/proxying is used.
- [ ] Require admin auth for upload/delete.
- [ ] Accept multipart field name `image`.
- [ ] Validate allowed MIME types.
- [ ] Validate maximum file size.
- [ ] Store image metadata in MongoDB.
- [ ] Return image object with `id`, `_id`, `url`, `imageUrl`, `image_url`, `filename`, and `mimeType`.
- [ ] Return an image URL that works from the Android emulator and physical devices on the same network.
- [ ] Delete or mark deleted image metadata on delete.
- [ ] Avoid deleting a file still referenced by another product unless reference counting is implemented.

Behavior comment: The frontend image picker sends a `FormData` object with field name `image`. Do not require any extra fields for a basic upload.

## Phase B-20: Admin Customers

- [ ] Implement `GET /admin/customers`.
- [ ] Implement `PATCH /admin/customers/:id/trust`.
- [ ] Implement `PATCH /admin/customers/:id/block`.
- [ ] Require admin auth.
- [ ] Support customer search by name, phone, or WhatsApp if query is provided.
- [ ] Also allow the frontend to fetch all customers with no query and filter locally.
- [ ] Return name, phone, WhatsApp number, short/full address, trusted status, blocked status, order count if practical.
- [ ] Accept trust payload `{ trusted: true|false }`.
- [ ] Accept block payload `{ blocked: true|false }`.
- [ ] Prevent blocked customers from placing new orders.
- [ ] Do not delete customers from admin controls in V1.

Behavior comment: Trust/block controls are operational toggles. They should be idempotent, so sending the same value twice should still return success.

## Phase B-21: Admin Settings And Offers

- [ ] Implement `GET /admin/settings`.
- [ ] Implement `PATCH /admin/settings`.
- [ ] Implement `GET /admin/offers/active`.
- [ ] Implement `POST /admin/offers`.
- [ ] Implement `PATCH /admin/offers/:id`.
- [ ] Require admin auth for admin settings and offer mutations.
- [ ] Accept settings payload fields: `shop_open`, `delivery_available`, `minimum_order_amount`, `delivery_charge`, `free_delivery_above`, `night_charge`, `night_charge_start`, `night_charge_end`, `whatsapp_number`, `upi_id`, `delivery_time_message`.
- [ ] Accept the dashboard quick-toggle payload `{ shop_open: true|false }` without requiring all settings fields.
- [ ] Validate numeric fields as non-negative numbers.
- [ ] Validate night charge time window.
- [ ] Preserve existing settings values when partial updates omit them.
- [ ] Update only provided settings fields.
- [ ] Return updated settings using both camelCase or snake_case aliases where helpful.
- [ ] Accept offer payload: `title`, `description`, `active`, optional `imageId`.
- [ ] Enforce only one active offer, or clearly return the newest active offer.
- [ ] Let admin create an offer when none exists and update an existing one.
- [ ] Return offer fields `id`, `title`, `description`, and `active` after create/update.

Behavior comment: Customer Home reads `/offers/active`; Admin Settings reads `/admin/offers/active`. Both should refer to the same active offer data, with admin allowed to see inactive/edit metadata if needed.

## Phase B-21A: Local Demo Data And Frontend Fixtures

- [ ] Add a seed command for a complete local demo catalog.
- [ ] Include products for both frontend modes: packed items and fast food.
- [ ] Include at least one product in every seeded category.
- [ ] Include at least one unavailable product so disabled add controls can be tested.
- [ ] Include at least one product with no image so local fallback images can be tested.
- [ ] Include at least one product with an uploaded image so backend image URLs can be tested.
- [ ] Include one active offer matching the frontend fallback theme, for example snacks and combos.
- [ ] Include one customer fixture and one blocked customer fixture for backend tests.
- [ ] Include orders in `Pending`, `Preparing`, `Out for Delivery`, `Delivered`, and `Cancelled` states.

Behavior comment: The frontend UI is already built. Good seed data makes it possible to prove the UI quickly without manually creating every product, status, customer, and offer.

## Phase B-22: Security And Abuse Protection

- [ ] Add CORS allowlist from env.
- [ ] Add basic rate limiting for auth endpoints.
- [ ] Add optional tighter rate limits for image upload and admin mutation endpoints.
- [ ] Add safe request size limits.
- [ ] Sanitize and validate uploaded filenames.
- [ ] Use parameterized SQL for every query.
- [ ] Do not log passwords, JWTs, database credentials, or full image payloads.
- [ ] Add helmet or equivalent secure HTTP headers where compatible.
- [ ] Add consistent audit logging for admin order/status/customer changes if practical.
- [ ] Add request ids to logs and error responses for easier mobile debugging.

Behavior comment: This is a small V1 backend, but order and admin endpoints are still high-risk. Treat admin actions as privileged operations from day one.

## Phase B-23: Integration Contract Documentation

- [ ] Add backend API docs in `Backend-V1/docs/api.md` or `Backend-V1/API.md`.
- [ ] Document request/response examples for signup, login, product list, product detail, cart calculate, checkout, order list, admin login, admin product image upload, admin order status update, settings update, and offer update.
- [ ] Include frontend-compatible field aliases.
- [ ] Document auth header format: `Authorization: Bearer <token>`.
- [ ] Document local `.env` setup.
- [ ] Document MySQL and MongoDB setup.
- [ ] Document how to set `PUBLIC_BASE_URL` so image URLs work on Android emulator, iOS simulator, and physical devices.
- [ ] Document the local frontend default base URL `http://10.0.2.2:3000`.

Behavior comment: The frontend is already built. Documentation should help a developer verify the backend against the existing app rather than invent a new contract.

## Phase B-24: Automated Tests

- [ ] Add test runner and test database strategy.
- [ ] Add auth tests.
- [ ] Add admin auth tests.
- [ ] Add product/category tests.
- [ ] Add image metadata tests.
- [ ] Add cart calculation tests for required totals.
- [ ] Add order creation tests.
- [ ] Add order cancellation tests.
- [ ] Add admin order update tests.
- [ ] Add customer trust/block tests.
- [ ] Add settings and offer tests.
- [ ] Add image URL tests that verify absolute public URLs are returned.
- [ ] Add settings partial-update tests for dashboard shop toggle.
- [ ] Add active offer tests for public and admin active-offer routes.
- [ ] Add role-protection tests for customer/admin route separation.

Behavior comment: Prioritize business rule tests over snapshot-style tests. The most important backend guarantee is that prices, totals, status rules, and permissions cannot be spoofed from the client.

## Phase B-25: Frontend Integration Smoke Test

- [ ] Set frontend base URL to the local backend.
- [ ] Confirm signup works.
- [ ] Confirm login and session restore work.
- [ ] Confirm Home loads settings, active offer, categories, and featured products.
- [ ] Confirm Home `Packed Items` / `Fast Food` mode changes returned category/product data.
- [ ] Confirm product search and category filters return usable data.
- [ ] Confirm `Shop Offer` opens products for the active offer.
- [ ] Confirm product images render when image URLs exist and fallback images render when missing.
- [ ] Confirm add to cart and cart calculation work.
- [ ] Confirm checkout creates an order with address and optional GPS coordinates.
- [ ] Confirm order confirmation receives an order id.
- [ ] Confirm order history and order detail load.
- [ ] Confirm eligible cancellation works.
- [ ] Confirm admin login works.
- [ ] Confirm admin dashboard loads zero states and real metrics.
- [ ] Confirm admin dashboard shop open/closed quick toggle persists through `/admin/settings`.
- [ ] Confirm admin order status and payment updates work.
- [ ] Confirm admin product create, edit, availability, image upload, and delete work.
- [ ] Confirm admin customer trust/block updates work.
- [ ] Confirm admin settings and active offer updates appear in customer Home.
- [ ] Confirm uploaded image URLs load in product list, product detail, admin products, and product form preview.

Behavior comment: Do this after backend tests pass. The aim is to catch field-name mismatches, auth header problems, image URL problems, and business-rule errors before calling backend complete.

## Phase B-26: Final Backend Acceptance

- [ ] Backend can run locally from `Backend-V1` with `.env`.
- [ ] `GET /health` returns success.
- [ ] No TypeScript files exist in backend.
- [ ] Customer can signup, login, restore session, update profile, browse products, calculate cart, place order, view orders, and cancel eligible orders.
- [ ] Admin can login, restore session, manage products/images, update order status, update payment status, block/trust users, edit settings, and manage one active offer.
- [ ] MySQL stores all business data.
- [ ] MongoDB stores image records and metadata.
- [ ] Frontend never needs direct database access.
- [ ] Client-provided prices cannot alter cart or order totals.
- [ ] Blocked customers cannot place orders.
- [ ] Closed shop prevents checkout.
- [ ] Minimum order is enforced.
- [ ] Night charge is correctly applied.
- [ ] Uploaded image URLs are absolute and reachable from the React Native app.
- [ ] Public and admin active-offer routes agree on the active offer.
- [ ] Admin-only routes reject customer tokens.
- [ ] Customer routes reject missing or invalid tokens.
- [ ] All critical order rules are covered by tests.

## Recommended First Implementation Order

- [ ] B-01 Project Scaffold And Tooling.
- [ ] B-02 Environment And Configuration.
- [ ] B-03 Database Connections.
- [ ] B-04 MySQL Schema And Seed Data.
- [ ] B-06 Validation And Error Middleware.
- [ ] B-07 Passwords, JWT, And Auth Middleware.
- [ ] B-08 Customer Auth And Profile.
- [ ] B-09 Admin Auth.
- [ ] B-10 Public Settings And Offers.
- [ ] B-11 Categories API.
- [ ] B-12 Products API.
- [ ] B-13 Cart Calculation.
- [ ] B-14 Order Creation.
- [ ] B-15 Customer Orders.
- [ ] B-16 through B-21 Admin Operations.
- [ ] B-21A Local Demo Data And Frontend Fixtures.
- [ ] B-22 through B-26 Security, docs, tests, integration, and acceptance.
