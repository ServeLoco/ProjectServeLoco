# ServeLoco Main Plan

`mainPLAN.md` is the primary implementation plan for ServeLoco V1. The separate backend and frontend plans remain available as supporting references:

- [Backend-V1/PLAN.md](Backend-V1/PLAN.md)
- [Frontend-V1/PLAN.md](Frontend-V1/PLAN.md)

## Goal
Build ServeLoco V1 as an Android-first grocery, food, and quick-commerce app with a simple React Native frontend and a Node.js API backend. The frontend must talk only to backend APIs and must never connect directly to MySQL, MongoDB, or any other database.

## Non-Negotiable Rules
- JavaScript only for backend and frontend.
- No TypeScript.
- Frontend calls only the Node.js backend API.
- Database credentials are never exposed to frontend code.
- No direct database SDK imports or database writes from the frontend.
- No emoji characters in visible UI.
- Local fallback images should render before backend-provided image URLs are available.

## Tech Stack

### Frontend
- React Native.
- JavaScript only.
- API calls through the Node.js backend.
- Local fallback images first, backend-provided image URLs when available.
- Modern mobile UI focused on customer ordering and admin operations.

### Backend
- Node.js.
- Express.js.
- JavaScript only.
- REST API.
- JWT sessions for customer and admin auth.
- Password hashing with bcrypt.
- Centralized validation and error responses.
- Environment-based configuration with `.env`.

### Databases
- MySQL for main business data:
  - users
  - products
  - categories
  - carts/order calculations
  - orders
  - order items
  - settings
  - offers
- MongoDB for image data:
  - image records
  - image metadata
  - uploaded image references
  - optional GridFS storage if storing image files inside MongoDB

## Main Architecture Rule
The React Native app talks only to the Node.js API.

```text
React Native app -> Node.js Express API -> MySQL
React Native app -> Node.js Express API -> MongoDB images
```

## V1 Scope

### Included
- Customer signup/login with phone + password.
- JWT-based customer sessions.
- Owner/admin login with configurable credentials.
- Product listing, search, categories, and availability.
- Product images served through backend-managed image URLs.
- Cart total calculation through the backend.
- Checkout with delivery address, GPS coordinates, and Google Maps URL.
- Customer order history and cancellation before delivery.
- Admin product management.
- Admin image upload/update flow.
- Admin order status and payment status management.
- Admin customer trust/block controls.
- Shop settings, minimum order, delivery charges, night charges, and one active offer banner.

### Not Included
- TypeScript.
- Direct database access from frontend.
- OTP login.
- Razorpay or online payment gateway integration.
- Wallet, coupons, reviews, ratings, referrals, or loyalty points.
- Live delivery tracking.
- Delivery helper app.
- Multi-shop support.
- Advanced inventory or purchase management.
- Upload-list feature.
- Manager/delivery roles beyond documentation placeholders.

## Repository Structure
Recommended simple layout:

```text
/Backend-V1
/Frontend-V1
/assets/images
/docs
```

Backend code should live in `Backend-V1`. Frontend code should live in `Frontend-V1`.

## Backend Plan

### Environment Variables
- `PORT`
- `NODE_ENV`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `ADMIN_OWNER_ID`
- `ADMIN_PASSWORD`
- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_DATABASE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MONGODB_URI`
- `MONGODB_DATABASE`
- `CORS_ORIGIN`

### Default Local Admin
- Owner ID: `9350238504`
- Password: `admin143`

These defaults are for local/testing only. Production must override them.

### MySQL Data Models

#### users
- `id`
- `name`
- `phone`
- `password_hash`
- `whatsapp_number`
- `address`
- `trusted`
- `blocked`
- `created_at`
- `updated_at`

#### categories
- `id`
- `name`
- `slug`
- `image_id`
- `active`
- `created_at`
- `updated_at`

#### products
- `id`
- `name`
- `price`
- `category_id`
- `image_id`
- `available`
- `created_at`
- `updated_at`

#### orders
- `id`
- `order_number`
- `customer_id`
- `customer_name`
- `phone`
- `whatsapp_number`
- `address`
- `latitude`
- `longitude`
- `map_url`
- `subtotal`
- `delivery_charge`
- `night_charge`
- `total`
- `payment_method`
- `payment_status`
- `status`
- `note`
- `cancel_reason`
- `created_at`
- `updated_at`

#### order_items
- `id`
- `order_id`
- `product_id`
- `product_name`
- `quantity`
- `unit_price`
- `line_total`

#### settings
- `id`
- `shop_open`
- `delivery_available`
- `minimum_order_amount`
- `delivery_charge`
- `free_delivery_above`
- `night_charge`
- `night_charge_start`
- `night_charge_end`
- `whatsapp_number`
- `upi_id`
- `upi_qr_image_id`
- `delivery_time_message`
- `updated_at`

#### offers
- `id`
- `title`
- `description`
- `image_id`
- `active`
- `created_at`
- `updated_at`

### MongoDB Image Model

#### images
- `_id`
- `filename`
- `originalName`
- `mimeType`
- `size`
- `storageType`
- `url`
- `gridFsFileId`
- `altText`
- `createdAt`
- `updatedAt`

Use `url` when files are stored on disk/cloud storage. Use `gridFsFileId` if image files are stored in MongoDB GridFS.

### Order Rules
- Minimum order amount defaults to `149`.
- Backend calculates subtotal from MySQL product records, not client-provided prices.
- Backend applies delivery charge and night charge.
- Night fee window: 9 PM to 7 AM.
- Blocked customers cannot place orders.
- Closed shop blocks checkout unless admin reopens the shop.
- Customer can cancel only before `Delivered`.
- Admin can update status and payment status.
- Short daily order numbers use the format `SL-102`.

### API Plan

#### Health
- `GET /health`

#### Customer Auth
- `POST /auth/signup`
- `POST /auth/login`
- `GET /auth/me`
- `PATCH /auth/profile`

#### Products
- `GET /products`
- `GET /products/:id`
- `GET /categories`

#### Images
- `GET /images/:id`
- `POST /admin/images`
- `DELETE /admin/images/:id`

#### Cart / Checkout
- `POST /cart/calculate`
- `POST /orders`

#### Customer Orders
- `GET /orders`
- `GET /orders/:id`
- `POST /orders/:id/cancel`

#### Admin Auth
- `POST /admin/login`
- `GET /admin/me`

#### Admin Dashboard
- `GET /admin/dashboard`
- `GET /admin/reports/sales`

#### Admin Products
- `POST /admin/products`
- `PATCH /admin/products/:id`
- `DELETE /admin/products/:id`
- `PATCH /admin/products/:id/availability`
- `PATCH /admin/products/:id/image`

#### Admin Orders
- `GET /admin/orders`
- `GET /admin/orders/:id`
- `PATCH /admin/orders/:id/status`
- `PATCH /admin/orders/:id/payment`

#### Admin Customers
- `GET /admin/customers`
- `PATCH /admin/customers/:id/trust`
- `PATCH /admin/customers/:id/block`

#### Admin Settings / Offers
- `GET /settings`
- `PATCH /admin/settings`
- `GET /offers/active`
- `POST /admin/offers`
- `PATCH /admin/offers/:id`

### Backend Build Phases

#### Phase 1: API Foundation
- Create JavaScript Express app.
- Add `.env` config loader.
- Add request logging.
- Add global error handler.
- Add health route.
- Add CORS.
- Add MySQL connection pool.
- Add MongoDB connection for images.

#### Phase 2: Auth
- Implement password hashing with bcrypt.
- Implement customer signup/login.
- Implement customer JWT middleware.
- Implement admin login.
- Implement admin JWT middleware.
- Add basic auth tests.

#### Phase 3: Products, Categories, and Images
- Implement MySQL product/category APIs.
- Implement MongoDB image records.
- Implement admin image upload/update flow.
- Implement admin product CRUD.
- Return products with resolved `imageUrl`.

#### Phase 4: Settings, Cart, and Orders
- Implement settings read/update.
- Seed default settings.
- Implement backend cart total calculation.
- Implement order creation in MySQL transaction.
- Implement daily order number generation.
- Implement customer order history.
- Implement customer cancellation rule.

#### Phase 5: Admin Operations
- Implement dashboard summary from MySQL.
- Implement order status updates.
- Implement payment status updates.
- Implement customer trust/block updates.
- Implement active offer management.

#### Phase 6: Frontend Integration Contract
- Document request/response payloads.
- Confirm frontend uses only the API client.
- Add integration examples for login, product list, image loading, cart calculate, checkout, and admin order update.
- Add CORS config for local mobile/web testing.

## Frontend Plan

### Stack Rules
- React Native.
- JavaScript only.
- No TypeScript.
- API calls only through the backend API client.
- Local fallback images first, backend-provided image URLs when available.
- No emoji characters in visible UI.
- Use a professional folder structure with one folder per reusable component, screen, store, and feature module.
- Use clear, consistent naming: PascalCase for components/screens, camelCase for functions/hooks, kebab-case only for asset file names.

### Frontend Folder Structure And Naming
- Keep source code inside `src/`.
- Recommended top-level folders:
  - `src/api` for API client, endpoint wrappers, and request helpers.
  - `src/assets` for images, icons, and local fallback product images.
  - `src/components` for reusable shared UI components.
  - `src/features` for feature-specific components and helpers that are not globally reusable.
  - `src/navigation` for navigators, route constants, and navigation helpers.
  - `src/screens` for screen-level components.
  - `src/store` for auth, admin auth, cart, settings, and app state stores.
  - `src/theme` for colors, spacing, typography, shadows, radius, and motion tokens.
  - `src/utils` for formatting, validation, permissions, and small pure helpers.
- Each reusable component must have its own folder, for example `src/components/Button/Button.js`.
- Each component folder should include `index.js` for exports and a colocated style file when styles are not tiny, for example `Button.styles.js`.
- Each screen should have its own folder, for example `src/screens/customer/HomeScreen/HomeScreen.js` and `src/screens/admin/AdminDashboardScreen/AdminDashboardScreen.js`.
- Keep customer and admin screens separated under `src/screens/customer` and `src/screens/admin`.
- Keep feature-only components close to their feature, for example `src/features/cart/CartItemRow/CartItemRow.js`.
- Do not create large mixed files such as `components.js`, `screens.js`, or `helpers.js`.
- File names for components and screens must match the exported component name.
- Hooks must start with `use`, for example `useCartTotals.js`.
- API modules should be named by domain, for example `authApi.js`, `productsApi.js`, `ordersApi.js`, and `adminOrdersApi.js`.
- Store modules should be named by domain, for example `authStore.js`, `adminAuthStore.js`, `cartStore.js`, and `settingsStore.js`.
- Keep imports readable by exporting public items through `index.js` files where it reduces long relative paths.

### Frontend Design System
- Build a clean mobile-first app for grocery, snacks, fast food, and daily essentials ordering.
- Keep the UI premium but minimal: white or off-white screens, deep charcoal text, one warm primary accent, one cool success accent, soft borders, and compact shadows.
- Use 8px card radius unless a platform control needs a slightly larger pill shape.
- Use familiar icons for location, search, cart, orders, profile, back, close, call, WhatsApp, map, eye, edit, delete, plus, minus, upload, and settings.
- Keep primary buttons full-width at the bottom of forms or checkout screens. Use compact icon buttons for repeated card actions.
- Keep text short and scannable. Do not use visible onboarding text to explain how the app works.
- All money, delivery fee, night charge, discount, and order totals shown in the UI must come from backend API responses.
- Product images use backend `imageUrl` when available and local fallback images when missing.
- Show loading skeletons for product lists, cart totals, order lists, and admin dashboard cards.
- Show empty states with one clear action button.

### Animation And Motion Guidelines
- Use React Native Reanimated for repeated UI motion when available. If setup becomes a blocker, use React Native `Animated` for the same motion patterns.
- Keep animation fast, smooth, and useful. Default timing should be 160ms to 260ms for taps and small transitions, 260ms to 420ms for screen/content entrance, and 600ms to 900ms for slow decorative loops.
- Do not animate large blocks continuously. Continuous animation is allowed only for the small auth illustration and skeleton shimmer.
- Every touchable card, icon button, and primary button should have a small press scale or opacity response.
- Screen entry should use a subtle fade with 8px to 16px upward slide for main content.
- Lists should stagger visible cards lightly, no more than 30ms to 45ms between cards.
- Loading skeletons should use a soft shimmer or pulse.
- Empty states should fade in and slide up once.
- Error messages should fade in with a short horizontal shake only on validation failure.
- Success states should use a small scale-in check/status mark and fade-in details.
- Modals and confirmation dialogs should fade the backdrop and scale the dialog from 96% to 100%.
- Sticky mini-cart should slide up from the bottom when it appears and slide down when hidden.
- Quantity stepper should animate between `Add` and `- quantity +` using width/opacity transition.
- Bottom tab changes should animate icon scale and active indicator movement.
- Respect reduced-motion settings when available by disabling decorative loops, staggered list entry, and shake animations.

### Navigation Structure
- Customer bottom tabs: `Home`, `Categories`, `Orders`, `Profile`.
- Cart is not a bottom tab. Show it as a header cart icon and a sticky mini-cart bar when the cart has items.
- Auth flow: show the home dashboard preview for 10 seconds, then require login/signup when the user tries to continue.
- Customer stack screens: `Home`, `Categories`, `Product List`, `Product Detail`, `Cart`, `Checkout`, `Order Confirmation`, `Orders`, `Order Detail`, `Profile`, `Edit Profile`, `Auth`.
- Admin stack screens: `Admin Entry`, `Admin Login`, `Admin Dashboard`, `Admin Orders`, `Admin Order Detail`, `Admin Products`, `Admin Product Form`, `Admin Customers`, `Admin Settings`.

### Customer Page UI Plans

#### 1. Home Dashboard
- Purpose: first customer screen for browsing, searching, quick category entry, offers, and adding popular items.
- Header:
  - ServeLoco brand/title.
  - Location selector button with current short address and chevron.
  - Cart icon button with item count badge.
- Search:
  - Search input with placeholder for items, food, snacks, drinks, and essentials.
  - Tapping search opens the product list in search mode.
- Mode toggle:
  - Two-option segmented control: `Packed Items` and `Fast Food`.
  - Selected mode changes product/category sections without changing the overall layout.
- Offer banner:
  - One compact banner using active backend offer text when available.
  - Fallback text: `Flat 30% off on snacks & combos`.
  - Button: `Shop Offer`.
- Category cards:
  - Horizontal scroll cards for `Cold Drinks`, `Snacks`, `Fast Food`, `Groceries`, `Desserts`, and `Daily Essentials`.
  - Each card has an image/icon placeholder, label, and tap action to open the category product list.
- Combo deals:
  - Cards for combo items such as burger + cold drink, chips + soft drink, and pizza slice + fries.
  - Each card shows image, title, price, discount label, and `Add` button.
  - After adding, replace `Add` with `- quantity +` stepper.
- Product preview:
  - Optional compact list of popular products below combo deals.
  - Each product has image, name, unit/size, price, availability state, and `Add` button.
- Sticky mini-cart:
  - Appears after at least one item is added.
  - Shows item count, estimated total, and `View Cart` button.
- Bottom navigation:
  - Four tabs: `Home`, `Categories`, `Orders`, `Profile`.
  - Home tab active.
- States:
  - Closed shop banner if settings say the shop is closed.
  - Product unavailable cards keep content visible but disable `Add`.
  - Loading skeletons for banner, categories, and products.
- Animations:
  - Header, search, mode toggle, banner, categories, and product sections fade in with slight upward slide.
  - Category and combo cards use light staggered entry.
  - Add button transforms into quantity stepper with width/opacity transition.
  - Cart badge uses a small scale bump when item count changes.
  - Sticky mini-cart slides up when cart gets first item.

#### 2. Login And Sign Up
- Purpose: combined auth screen after preview/auth gate.
- Layout:
  - ServeLoco brand/logo placeholder.
  - Trust line: `Food, snacks and essentials delivered fast`.
  - Small local illustration or product image placeholder.
  - Single elevated form card with segmented tabs.
- Tabs:
  - `Login` tab is default.
  - `Sign Up` tab switches form with smooth card height animation.
- Login fields:
  - Phone number.
  - Password.
  - Eye icon button to show/hide password.
  - Primary button: `Login`.
  - Secondary text button: `Create an account`.
- Sign Up fields:
  - Full name.
  - Phone number.
  - WhatsApp number.
  - Delivery address.
  - Password.
  - Confirm password.
  - Eye icon buttons on password fields.
  - Primary button: `Create Account`.
  - Secondary text button: `Already have an account`.
- Validation and states:
  - Required field errors show inline below fields.
  - Password mismatch shows inline error.
  - API error appears above the primary button.
  - Primary button shows loading state and disables fields while submitting.
- Behavior:
  - Login calls `POST /auth/login`.
  - Signup calls `POST /auth/signup`.
  - Store returned JWT/session in auth/session store.
  - Successful auth opens the home dashboard.
- Animations:
  - Brand and trust line fade in and slide up on screen load.
  - Illustration gently floats in a slow vertical loop.
  - Auth card fades in after the brand.
  - Active tab indicator slides between `Login` and `Sign Up`.
  - Form content crossfades and slides horizontally on tab change.
  - Card height animates smoothly when switching forms.
  - Invalid fields use a short shake and inline error fade-in.

#### 3. Categories
- Purpose: fast browsing by product group.
- Header:
  - Title: `Categories`.
  - Search icon/input shortcut.
  - Cart icon with count badge.
- Content:
  - Responsive two-column grid of category cards.
  - Categories: `Cold Drinks`, `Snacks`, `Fast Food`, `Groceries`, `Desserts`, `Daily Essentials`.
  - Each card shows image/icon, category name, and small product count when available.
- Filters:
  - Top segmented control for `Packed Items` and `Fast Food`.
  - Optional horizontal chips for common subcategories when returned by backend.
- Buttons and actions:
  - Tapping a category opens Product List filtered by that category.
  - `View All Products` button at the bottom.
  - Sticky mini-cart appears when cart has items.
- States:
  - Empty category state shows `No items found` and `View All Products`.
  - Loading skeleton grid.
- Animations:
  - Category cards stagger in row by row.
  - Filter chips animate active indicator/opacity on selection.
  - Empty state fades and slides up.

#### 4. Product List And Search Results
- Purpose: browse products from search, categories, offer banner, or mode toggle.
- Header:
  - Back button when opened from category/search.
  - Search field with current query.
  - Cart icon with count badge.
- Filter row:
  - Category chips.
  - Availability chip: `Available`.
  - Sort button for `Popular`, `Price Low to High`, and `Price High to Low`.
- Product cards:
  - Image or fallback image.
  - Name.
  - Unit/size.
  - Price.
  - Discount or offer label when available.
  - Availability indicator.
  - `Add` button or `- quantity +` stepper.
- Product detail:
  - Tapping product opens Product Detail.
  - Long descriptions are kept on Product Detail, not crowded into list cards.
- Sticky mini-cart:
  - Shows count, estimated total, and `View Cart`.
- States:
  - Empty search shows `No products found` and `Clear Search`.
  - API failure shows retry button.
- Animations:
  - Product cards stagger in as data loads.
  - Filter and sort changes crossfade the list.
  - Add button transforms into quantity stepper.
  - Sticky mini-cart slides in/out from the bottom.

#### 5. Product Detail
- Purpose: focused product view before adding or changing quantity.
- Header:
  - Back button.
  - Cart icon with count badge.
- Content:
  - Large product image with fallback.
  - Product name, unit/size, category, price, discount label, and availability.
  - Short product description if backend provides it.
  - Related or similar products section when available.
- Buttons:
  - Primary bottom button: `Add to Cart`.
  - If already in cart, show bottom `- quantity +` stepper and `View Cart`.
- States:
  - Disable add controls when unavailable.
  - Show fallback image and compact missing-description state.
- Animations:
  - Product image fades in after load.
  - Product details slide up under the image.
  - Bottom action bar slides up when ready.
  - Related products use light horizontal card entry.

#### 6. Cart
- Purpose: review items and calculate backend-verified total.
- Header:
  - Title: `Cart`.
  - Back button when opened from stack.
  - `Clear` text button if cart has items.
- Item list:
  - Each row shows image, name, unit/size, price, and `- quantity +` stepper.
  - Remove item icon button on each row.
  - Unavailable item warning if a product becomes unavailable.
- Bill summary:
  - Subtotal.
  - Delivery charge.
  - Night charge when applicable.
  - Offer/discount when applicable.
  - Grand total.
  - Minimum order warning if below backend setting.
- Buttons:
  - Primary bottom button: `Checkout`.
  - Disabled if cart is empty, below minimum order, shop closed, blocked customer, or backend calculation fails.
  - Secondary button in empty state: `Start Shopping`.
- Behavior:
  - Cart total calls `POST /cart/calculate`.
  - Do not trust client-side prices.
- States:
  - Empty cart state.
  - Recalculate loading state.
  - Backend validation error with retry.
- Animations:
  - Cart rows animate in and animate out when removed.
  - Quantity changes use small button press and number scale bump.
  - Bill summary totals crossfade when recalculated.
  - Empty cart state fades in after last item removal.

#### 7. Checkout
- Purpose: collect delivery details and place order.
- Header:
  - Title: `Checkout`.
  - Back button.
- Delivery section:
  - Address text area prefilled from profile when available.
  - Button: `Use Current Location`.
  - Show GPS permission status and selected coordinates after success.
  - Button: `Open Map` when Google Maps URL is available.
- Payment section:
  - Payment method selector with `Cash` and `UPI` if supported by backend.
  - Payment status starts as pending unless backend says otherwise.
- Order summary:
  - Compact item count.
  - Subtotal, delivery charge, night charge, discounts, and grand total from backend.
- Buttons:
  - Primary bottom button: `Place Order`.
  - Secondary text button: `Back to Cart`.
- Validation and states:
  - Address required.
  - GPS failure state allows retry and manual address continuation if backend allows.
  - Shop closed, minimum order, and blocked customer errors show before placing order.
  - Loading state disables submit while order is being created.
- Behavior:
  - Create order through `POST /orders`.
  - On success, open Order Confirmation.
- Animations:
  - Delivery, payment, and summary sections enter with slight stagger.
  - GPS success fades in coordinates and map action.
  - GPS failure fades in retry message.
  - Place order button shows spinner/loading transition.

#### 8. Order Confirmation
- Purpose: success screen after checkout.
- Content:
  - Success title.
  - Order number/id.
  - Estimated status label.
  - Delivery address summary.
  - Total paid or payable.
- Buttons:
  - Primary button: `View Order`.
  - Secondary button: `Continue Shopping`.
- Behavior:
  - `View Order` opens Order Detail.
  - `Continue Shopping` opens Home and clears checkout state.
- Animations:
  - Success mark scales in once.
  - Order details fade in after success mark.
  - Action buttons slide up together.

#### 9. Orders
- Purpose: customer order history.
- Header:
  - Title: `Orders`.
  - Optional filter icon.
- Filters:
  - Chips: `All`, `Pending`, `Preparing`, `Delivered`, `Cancelled`.
- Order cards:
  - Order id/date.
  - Status.
  - Payment status.
  - Item count.
  - Total.
  - Small preview of first products.
- Buttons:
  - `View Details` on every order card.
  - `Cancel` on orders eligible for cancellation before delivered.
  - `Reorder` can be added later only if backend supports it.
- States:
  - Empty state with `Start Shopping`.
  - Loading skeleton cards.
  - API failure with `Retry`.
- Behavior:
  - Fetch orders through `GET /orders`.
  - Cancel through `POST /orders/:id/cancel`.
- Animations:
  - Order cards stagger in after loading.
  - Filter chip changes crossfade the visible order list.
  - Cancelled order status updates with a soft highlight fade.

#### 10. Order Detail
- Purpose: detailed tracking and cancellation for one order.
- Header:
  - Back button.
  - Title: order id.
- Content:
  - Status timeline.
  - Payment status.
  - Item list with quantity and price.
  - Bill summary.
  - Delivery address and map link if available.
- Buttons:
  - `Cancel Order` only when order is not delivered and backend allows cancellation.
  - `Contact Store` button if a support phone is configured.
  - `Continue Shopping`.
- States:
  - Cancel confirmation modal with `Keep Order` and `Cancel Order`.
  - Cancel loading and success state.
- Animations:
  - Status timeline steps fade/slide in from top to bottom.
  - Cancel confirmation modal fades and scales in.
  - Cancel success uses a short status highlight fade.

#### 11. Profile
- Purpose: account, address, and session actions.
- Header:
  - Title: `Profile`.
- Customer card:
  - Name.
  - Phone.
  - WhatsApp number.
  - Delivery address.
  - Trust/block warning only if backend exposes a customer-facing status.
- Options:
  - `Edit Profile`.
  - `My Orders`.
  - `Saved Address`.
  - `Help and Support`.
  - `Logout`.
- Buttons:
  - Edit icon button on profile card.
  - Logout uses confirmation modal with `Stay Logged In` and `Logout`.
- Behavior:
  - Profile loads from `GET /auth/me`.
  - Edit Profile saves through `PATCH /auth/profile`.
- Animations:
  - Profile card fades in first.
  - Option rows stagger in lightly.
  - Logout confirmation modal fades and scales in.

#### 12. Edit Profile
- Purpose: update customer profile details.
- Fields:
  - Full name.
  - WhatsApp number.
  - Delivery address.
- Buttons:
  - Primary button: `Save Changes`.
  - Secondary button: `Cancel`.
- States:
  - Inline validation.
  - Save loading state.
  - Success returns to Profile.
- Animations:
  - Fields enter with slight stagger.
  - Validation errors fade in and shake the invalid field.
  - Save success shows a small button success state before returning.

### Admin Page UI Plans

#### 13. Admin Entry
- Purpose: hidden admin route that does not appear in customer bottom navigation.
- Layout:
  - Minimal page with ServeLoco admin title.
  - Button: `Admin Login`.
  - Back button to customer app.
- Behavior:
  - Opens Admin Login.
  - If admin session already exists, open Admin Dashboard.
- Animations:
  - Admin title and login button fade in.
  - Button uses press scale feedback.

#### 14. Admin Login
- Purpose: owner/admin authentication.
- Fields:
  - Owner id.
  - Password.
  - Eye icon button for password visibility.
- Buttons:
  - Primary button: `Login`.
  - Secondary button: `Back to App`.
- States:
  - Inline errors.
  - API error near button.
  - Loading state disables inputs.
- Behavior:
  - Calls `POST /admin/login`.
  - Stores admin JWT separately from customer session.
- Animations:
  - Form card fades in.
  - Invalid fields shake and show inline error fade-in.
  - Login button shows spinner/loading transition.

#### 15. Admin Dashboard
- Purpose: quick operations overview and shop control.
- Header:
  - Title: `Admin Dashboard`.
  - Logout icon button.
- Summary cards:
  - Today orders.
  - Today sales.
  - Pending orders.
  - Delivered orders.
  - Cash, UPI, and pending payment totals.
  - Today/week/month sales.
- Controls:
  - Shop open/closed toggle.
  - Button: `Manage Orders`.
  - Button: `Manage Products`.
  - Button: `Settings`.
- Latest orders:
  - Pending orders shown first.
  - Each card has order id, customer, total, payment status, order status, and `Open` button.
- Product alerts:
  - Unavailable or low-stock-style alerts if supported by backend fields.
  - Button: `View Products`.
- Top products:
  - Top 5 products list with rank, product name, and sales count/amount when available.
- Behavior:
  - Summary calls `GET /admin/dashboard`.
  - Sales report calls `GET /admin/reports/sales`.
- Animations:
  - Metric cards stagger in.
  - Shop toggle animates thumb and color change.
  - Latest order cards fade in after metrics.
  - Refresh/reload crossfades updated metric values.

#### 16. Admin Orders
- Purpose: list and manage all customer orders.
- Header:
  - Title: `Orders`.
  - Search/filter icon.
- Filters:
  - Chips: `Pending`, `Preparing`, `Out for Delivery`, `Delivered`, `Cancelled`, `All`.
  - Payment chips: `Pending`, `Paid`, `Cash`, `UPI` when available.
- Order cards:
  - Pending orders first by default.
  - Customer name and phone.
  - Order id/date.
  - Delivery address short line.
  - Total.
  - Payment status.
  - Order status.
- Buttons:
  - `Open`.
  - Call icon.
  - WhatsApp icon.
  - Map icon.
- States:
  - Empty filter state.
  - Loading skeletons.
  - Retry on API failure.
- Behavior:
  - Fetch through `GET /admin/orders`.
- Animations:
  - Order cards stagger in with pending orders first.
  - Filter changes crossfade the list.
  - Call, WhatsApp, and map buttons use press scale feedback.

#### 17. Admin Order Detail
- Purpose: operational control for one order.
- Header:
  - Back button.
  - Order id.
- Content:
  - Customer name, phone, WhatsApp, address, GPS/map link.
  - Item list with quantities and prices.
  - Bill summary.
  - Current order status.
  - Current payment status.
- Buttons and controls:
  - Status selector: `Pending`, `Preparing`, `Out for Delivery`, `Delivered`, `Cancelled`.
  - Payment selector: `Pending`, `Paid`, `Failed`, `Refunded` when backend supports values.
  - Primary button: `Update Status`.
  - Secondary button: `Update Payment`.
  - Call icon, WhatsApp icon, and map icon.
- Behavior:
  - Order detail calls `GET /admin/orders/:id`.
  - Status update calls `PATCH /admin/orders/:id/status`.
  - Payment update calls `PATCH /admin/orders/:id/payment`.
- Animations:
  - Customer and bill sections fade in with slight stagger.
  - Status/payment selector changes use active indicator movement.
  - Successful updates briefly highlight the changed status row.

#### 18. Admin Products
- Purpose: manage catalog items and images.
- Header:
  - Title: `Products`.
  - Search input.
  - Add icon/button.
- Filters:
  - Category chips.
  - Availability chip.
  - Sort button.
- Product rows/cards:
  - Image.
  - Product name.
  - Category.
  - Price.
  - Availability state.
- Buttons:
  - `Add Product`.
  - Edit icon.
  - Delete icon.
  - Availability toggle.
  - Image upload/change icon.
- States:
  - Empty catalog state with `Add Product`.
  - Confirm delete modal with `Keep Product` and `Delete`.
- Behavior:
  - Create through `POST /admin/products`.
  - Update through `PATCH /admin/products/:id`.
  - Delete through `DELETE /admin/products/:id`.
  - Availability through `PATCH /admin/products/:id/availability`.
  - Image attach through `PATCH /admin/products/:id/image`.
- Animations:
  - Product rows stagger in.
  - Availability toggle animates thumb and color.
  - Delete confirmation modal fades and scales in.
  - Deleted product row collapses/fades out.

#### 19. Admin Product Form
- Purpose: add or edit one product.
- Fields:
  - Product name.
  - Category.
  - Price.
  - Unit/size.
  - Description.
  - Availability toggle.
  - Image upload/change control.
- Buttons:
  - Primary button: `Save Product`.
  - Secondary button: `Cancel`.
  - Delete button only in edit mode.
- States:
  - Field validation.
  - Upload loading state.
  - Save loading state.
  - Image preview with fallback.
- Behavior:
  - Image upload calls `POST /admin/images`.
  - Image delete calls `DELETE /admin/images/:id` when replacing or removing an image.
- Animations:
  - Form sections enter with slight stagger.
  - Image preview fades in after upload/select.
  - Validation errors fade in and shake invalid fields.
  - Save button shows spinner/loading transition.

#### 20. Admin Customers
- Purpose: trust and block customer management.
- Header:
  - Title: `Customers`.
  - Search input.
- Customer cards:
  - Name.
  - Phone.
  - WhatsApp number.
  - Address short line.
  - Trust status.
  - Block status.
- Buttons:
  - Trust toggle.
  - Block toggle.
  - Call icon.
  - WhatsApp icon.
- Confirmation:
  - Blocking requires confirm modal with `Cancel` and `Block Customer`.
  - Unblocking requires confirm modal with `Cancel` and `Unblock Customer`.
- Behavior:
  - Fetch through `GET /admin/customers`.
  - Trust update through `PATCH /admin/customers/:id/trust`.
  - Block update through `PATCH /admin/customers/:id/block`.
- Animations:
  - Customer cards stagger in.
  - Trust and block toggles animate thumb/color changes.
  - Block/unblock confirmation modal fades and scales in.

#### 21. Admin Settings And Offers
- Purpose: manage shop rules, charges, and active offer banner.
- Sections:
  - Shop status.
  - Minimum order.
  - Delivery charge.
  - Night charge.
  - Night charge time window display.
  - Active offer banner.
- Controls:
  - Shop open/closed toggle.
  - Numeric inputs for minimum order, delivery charge, and night charge.
  - Text input for offer title.
  - Text input for offer subtitle/description.
  - Offer active toggle.
- Buttons:
  - Primary button: `Save Settings`.
  - Secondary button: `Preview Offer`.
  - `Create Offer` when no offer exists.
  - `Update Offer` when editing an existing offer.
- States:
  - Validation for numeric fields.
  - Save loading state.
  - Success message after save.
- Behavior:
  - Settings read through `GET /settings`.
  - Settings update through `PATCH /admin/settings`.
  - Offer create through `POST /admin/offers`.
  - Offer update through `PATCH /admin/offers/:id`.
- Animations:
  - Settings sections fade in with slight stagger.
  - Toggles animate thumb/color changes.
  - Offer preview crossfades when title or subtitle changes.
  - Save success shows a compact fade-in success message.

### Frontend Build Phases

#### Phase 1: App Shell
- Create the React Native JavaScript app.
- Add theme tokens, base layout, and reusable UI primitives.
- Add shared animation helpers for screen entry, press feedback, card stagger, modals, skeletons, sticky mini-cart, cart badge, and quantity stepper.
- Add API client wrapper.
- Add auth/session store.
- Add 10-second dashboard preview before auth gate.
- Build the home dashboard first screen.
- Build the login/signup auth screen.

#### Phase 2: Customer Flow
- Product browsing.
- Search and category filters.
- Product image fallback rendering.
- Cart.
- Checkout with GPS permission and failure state.
- Order confirmation.
- Order history.
- Cancel eligible orders.
- Profile and edit profile.
- Apply required customer screen animations from the page UI plans.

#### Phase 3: Admin Flow
- Hidden admin screen/route.
- Admin login.
- Dashboard summary.
- Order cards with pending first.
- Product management screens.
- Image upload/change controls.
- Shop settings and offer banner editing.
- Call, WhatsApp, and map actions.
- Apply required admin screen animations from the page UI plans.

## Testing Checklist

### Backend
- Signup/login/JWT.
- Password hashing.
- Admin login/JWT.
- MySQL connection.
- MongoDB image record flow.
- Product CRUD.
- Product image update.
- Order totals for `98`, `99`, `149`, `199`, `200`.
- Night fee from 9 PM to 7 AM.
- Minimum order validation.
- Shop closed validation.
- Settings update.
- Order status update.
- Payment status update.
- Customer block/trust.

### Frontend
- No emoji UI check.
- No direct database imports/checks.
- 10-second preview then auth gate.
- Login/signup/session persistence.
- Home dashboard renders on common Android and iOS screen sizes.
- Search, category, toggle, offer banner, combo cards, and bottom navigation are visible.
- Login/signup tabs, validation, loading states, and animations work.
- Product image fallback rendering.
- Cart flow.
- Checkout GPS success/failure.
- Order history.
- Cancel before delivered.
- Admin dashboard.
- Admin order actions.

### Integration
- Frontend calls backend API only.
- Backend writes business data to MySQL.
- Backend manages image data through MongoDB.
- Client cannot spoof product prices.
- Blocked customers cannot place orders.
- Admin-only routes reject customer tokens.
- Customer routes reject missing/invalid tokens.

## Acceptance Criteria
- Backend can run locally with `.env`.
- `GET /health` returns success.
- React Native app has no TypeScript files.
- Backend has no TypeScript files.
- Customer can signup, login, browse products, calculate cart, place order, view orders, and cancel eligible orders.
- Admin can login, manage products/images, update orders, update payment status, block/trust users, edit settings, and manage an active offer.
- Database credentials are never exposed to frontend code.
- All critical order rules are covered by tests.
- `mainPLAN.md` remains the primary project planning document.

## Immediate Next Steps
1. Scaffold the backend JavaScript Express project.
2. Add env config, MySQL pool, MongoDB connection, and health route.
3. Implement auth models, password hashing, JWT helpers, and auth middleware.
4. Add product/category/settings MySQL repositories.
5. Add MongoDB image repository and image API.
6. Implement cart calculation before order creation.
7. Scaffold the React Native JavaScript frontend app.
8. Build theme tokens, auth/session store, API client wrapper, home dashboard, and login/signup screen.
