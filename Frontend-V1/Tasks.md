# ServeLoco Frontend Tasks

Use this checklist as the frontend implementation handoff. Give one task block at a time to an AI or developer. Each task should be completed, tested on common Android/iOS screen sizes, and checked off before moving to the next dependent task.

Source of truth: `../mainPLAN.md` frontend section.

## How To Use This Checklist

- [ ] Complete tasks in phase order unless a task says it can be built independently.
- [ ] For each screen task, finish layout, buttons, data states, API behavior, and animations before marking the task complete.
- [ ] Do not skip animation subtasks. They define the exact motion style for the app.
- [ ] Keep animations subtle and functional. The app should feel fast, not flashy.
- [ ] When giving work to another AI, copy the full task block including the animation lines and acceptance checks.

## Global Frontend Rules

- [ ] Use React Native with JavaScript only.
- [ ] Do not add TypeScript files.
- [ ] Do not connect directly to MySQL, MongoDB, or any database SDK.
- [ ] Make every backend call through one API client wrapper.
- [ ] Keep visible UI text free of emoji characters.
- [ ] Use backend `imageUrl` when available and local fallback images when missing.
- [ ] Show all product prices, discounts, fees, order totals, and payment status from backend responses.
- [ ] Use familiar icons for icon buttons: location, search, cart, orders, profile, back, close, call, WhatsApp, map, eye, edit, delete, plus, minus, upload, settings.
- [ ] Keep the design clean, premium, minimal, mobile-first, and not copied from Blinkit or Zomato.
- [ ] Add loading, empty, error, disabled, and success states for every API-driven screen.
- [ ] Use the app animation standard below for every screen and shared component.
- [ ] Use a professional folder structure with one folder per reusable component, screen, store, and feature module.
- [ ] Use PascalCase for components/screens, camelCase for functions/hooks, and kebab-case only for asset file names.

## Folder Structure And Naming Standard

- [ ] Keep source code inside `src/`.
- [ ] Create `src/api` for API client, endpoint wrappers, and request helpers.
- [ ] Create `src/assets` for images, icons, and local fallback product images.
- [ ] Create `src/components` for reusable shared UI components.
- [ ] Create `src/features` for feature-specific components and helpers.
- [ ] Create `src/navigation` for navigators, route constants, and navigation helpers.
- [ ] Create `src/screens/customer` for customer screens.
- [ ] Create `src/screens/admin` for admin screens.
- [ ] Create `src/store` for auth, admin auth, cart, settings, and app state stores.
- [ ] Create `src/theme` for colors, spacing, typography, shadows, radius, and motion tokens.
- [ ] Create `src/utils` for formatting, validation, permissions, and pure helpers.
- [ ] Give every reusable component its own folder, for example `src/components/Button/Button.js`.
- [ ] Add `index.js` in each reusable component folder for clean exports.
- [ ] Add colocated style files when styles are not tiny, for example `Button.styles.js`.
- [ ] Give every screen its own folder, for example `src/screens/customer/HomeScreen/HomeScreen.js`.
- [ ] Keep feature-only components near the feature, for example `src/features/cart/CartItemRow/CartItemRow.js`.
- [ ] Do not create large mixed files such as `components.js`, `screens.js`, or `helpers.js`.
- [ ] File names for components and screens must match the exported component name.
- [ ] Hook files must start with `use`, for example `useCartTotals.js`.
- [ ] API modules must be named by domain, for example `authApi.js`, `productsApi.js`, `ordersApi.js`, and `adminOrdersApi.js`.
- [ ] Store modules must be named by domain, for example `authStore.js`, `adminAuthStore.js`, `cartStore.js`, and `settingsStore.js`.
- [ ] Export public items through `index.js` files where it keeps imports readable.

## App Animation Standard

- [ ] Use React Native Reanimated for repeated UI motion when available.
- [ ] If Reanimated setup blocks progress, use React Native `Animated` with the same timing and behavior.
- [ ] Use 120ms to 180ms for tap feedback.
- [ ] Use 160ms to 260ms for small UI changes such as chip, tab, toggle, and stepper changes.
- [ ] Use 260ms to 420ms for screen content entrance.
- [ ] Use 600ms to 900ms only for the slow auth illustration float.
- [ ] Use fade plus 8px to 16px upward slide for normal screen content entry.
- [ ] Use 30ms to 45ms stagger delay for visible list cards.
- [ ] Use press scale or opacity feedback on every button, icon button, touchable card, and bottom tab.
- [ ] Use skeleton shimmer or pulse for loading lists, dashboard cards, products, cart totals, and orders.
- [ ] Use short horizontal shake only for invalid fields after validation failure.
- [ ] Use modal backdrop fade plus dialog scale from 96% to 100%.
- [ ] Use sticky mini-cart slide up/down from the bottom.
- [ ] Use cart badge scale bump when cart item count changes.
- [ ] Use quantity stepper width/opacity transition when changing between `Add` and `- quantity +`.
- [ ] Respect reduced-motion settings when available by disabling decorative loops, staggered entry, and shake animations.
- [ ] Do not add continuous decorative animation except auth illustration float and loading skeleton shimmer.

## Phase 1: App Shell And Foundations

### Task F-01: Create React Native App Shell

- [x] Scaffold the frontend app inside `Frontend-V1`.
- [x] Use JavaScript files only.
- [x] Add app entrypoint, package scripts, and basic local run setup.
- [x] Add folders for `src/api`, `src/assets`, `src/components`, `src/features`, `src/navigation`, `src/screens/customer`, `src/screens/admin`, `src/store`, `src/theme`, and `src/utils`.
- [x] Add starter `index.js` export files where needed for clean imports.
- [x] Add route constants in `src/navigation` instead of hardcoding route names across screens.
- [x] Add a no-emoji visible UI check if practical.
- [x] Verify the app opens to a temporary screen without crashing.


### Task F-02: Theme And Design Tokens

- [x] Create theme tokens for colors, spacing, typography, shadows, borders, and radius.
- [x] Use off-white or white app backgrounds, deep charcoal text, one warm primary accent, and one cool success accent.
- [x] Keep cards at 8px radius unless a platform control needs a pill shape.
- [x] Create shared screen padding and safe-area behavior.
- [x] Ensure text never overflows buttons, chips, cards, or headers on small screens.
- [x] Add motion tokens: `tapMs`, `smallMs`, `screenMs`, `staggerMs`, `loopMs`, `entryDistance`, and `modalScaleStart`.
- [x] Add one easing curve for app motion and reuse it across components.

### Task F-03: Reusable UI Components

- [x] Build each reusable component in its own folder under `src/components`.
- [x] Build `src/components/AppScreen/AppScreen.js` with safe-area support.
- [x] Build `src/components/AppHeader/AppHeader.js` with title, back button, optional actions, and cart badge support.
- [x] Build `src/components/Button/Button.js`, `src/components/IconButton/IconButton.js`, and `src/components/TextButton/TextButton.js`.
- [x] Build `src/components/TextInputField/TextInputField.js` with label, error text, disabled state, and password eye icon support.
- [x] Build `src/components/SegmentedControl/SegmentedControl.js`.
- [x] Build `src/components/Chip/Chip.js` and horizontal chip row component.
- [x] Build `src/components/QuantityStepper/QuantityStepper.js`.
- [x] Build `src/components/ProductImage/ProductImage.js` with backend image and local fallback support.
- [x] Build `ProductCard`, `CategoryCard`, `OrderCard`, and `AdminMetricCard` in separate component folders.
- [x] Build `BillSummary`, `StickyMiniCart`, `EmptyState`, `ErrorState`, `LoadingSkeleton`, and `ConfirmModal` in separate component folders.
- [x] Add `index.js` export file inside every reusable component folder.
- [x] Add colocated `.styles.js` files for components with meaningful styling.


### Task F-03A: Animation System Components

- [x] Create reusable fade-and-slide entry helper for screen sections.
- [x] Create reusable staggered-list helper for product, category, order, and admin cards.
- [x] Create reusable press feedback wrapper for touchable cards, buttons, and icon buttons.
- [x] Create animated cart badge count bump.
- [x] Create animated sticky mini-cart show/hide behavior.
- [x] Create animated `Add` to quantity stepper transition.
- [x] Create animated segmented control active indicator.
- [x] Create animated bottom tab active indicator and icon scale.
- [x] Create animated modal wrapper with backdrop fade and dialog scale.
- [x] Create animated validation error helper with fade-in and optional shake.
- [x] Create skeleton shimmer or pulse component.
- [x] Add reduced-motion helper to disable decorative loops, staggered entry, and shake animations when supported.

### Task F-04: API Client

- [x] Create one backend API client wrapper.
- [x] Support base URL configuration.
- [x] Attach customer JWT to customer requests.
- [x] Attach admin JWT to admin requests.
- [x] Handle JSON responses, network errors, unauthorized errors, and backend validation errors.
- [x] Add methods for auth, products, cart, orders, settings, offers, admin dashboard, admin products, admin orders, admin customers, and admin images.
- [x] Ensure no screen imports database packages or direct database credentials.

### Task F-05: Session And Stores

- [x] Create customer auth/session store.
- [x] Create separate admin auth/session store.
- [x] Persist and restore sessions on app start.
- [x] Add logout and admin logout actions.
- [x] Create cart store with items, quantities, item count, and clear cart.
- [x] Keep cart prices display-only until backend recalculation returns verified totals.
- [x] Add app settings store for shop status, minimum order, delivery charges, night charges, and active offer.

### Task F-06: Navigation

- [x] Add customer bottom tabs: `Home`, `Categories`, `Orders`, `Profile`.
- [x] Add customer stack screens: `Home`, `Categories`, `Product List`, `Product Detail`, `Cart`, `Checkout`, `Order Confirmation`, `Orders`, `Order Detail`, `Profile`, `Edit Profile`, `Auth`.
- [x] Add admin stack screens: `Admin Entry`, `Admin Login`, `Admin Dashboard`, `Admin Orders`, `Admin Order Detail`, `Admin Products`, `Admin Product Form`, `Admin Customers`, `Admin Settings`.
- [x] Keep Cart out of the bottom tabs.
- [x] Show Cart through header cart icon and sticky mini-cart.
- [x] Add hidden admin entry route that is not visible in customer bottom navigation.
- [x] Restore the correct route after customer or admin session restore.
- [x] Animate bottom tab active icon scale and active indicator movement.
- [x] Use subtle screen fade/slide transition when moving between stack screens.
- [x] Keep navigation animations short so back/forward actions feel instant.

## Phase 2: Auth And Preview Gate

### Task F-07: Home Preview And Auth Gate

- [x] Show Home Dashboard preview first.
- [x] Allow preview for 10 seconds.
- [x] After 10 seconds, require login/signup when the user tries to continue into protected actions.
- [x] Protected actions include add to cart, checkout, orders, profile edit, and order cancellation.
- [x] If already logged in, skip the auth gate.
- [x] On successful auth, return to the intended action or Home.
- [x] Fade in the auth prompt when a protected action is blocked.
- [x] Keep preview-to-auth transition smooth with no layout jump.

### Task F-08: Login And Sign Up Screen

- [x] Build a full-screen auth layout with ServeLoco brand/logo placeholder.
- [x] Add trust line: `Food, snacks and essentials delivered fast`.
- [x] Add a small local illustration or product image placeholder.
- [x] Add elevated auth card with segmented tabs: `Login` and `Sign Up`.
- [x] Make `Login` the default tab.
- [x] Login fields: phone number, password, password eye icon.
- [x] Login buttons: `Login`, `Create an account`.
- [x] Sign Up fields: full name, phone number, WhatsApp number, delivery address, password, confirm password.
- [x] Sign Up buttons: `Create Account`, `Already have an account`.
- [x] Add required field validation.
- [x] Add password confirmation validation.
- [x] Show inline API errors above the primary button.
- [x] Show loading state and disable inputs while submitting.
- [x] Call `POST /auth/login` for login.
- [x] Call `POST /auth/signup` for signup.
- [x] Store returned customer JWT/session.
- [x] Navigate to Home after successful auth.
- [x] Animate brand and trust line with fade plus upward slide on screen load.
- [x] Animate illustration with slow vertical float loop.
- [x] Animate auth card with delayed fade plus upward slide.
- [x] Use animated validation shake for incorrect login attempts.
- [x] Animate active tab indicator sliding between `Login` and `Sign Up`.
- [x] Animate form content with crossfade and horizontal slide on tab change.
- [x] Animate card height when switching between login and signup forms.
- [x] Animate invalid fields with short shake and inline error fade-in.
- [x] Animate primary button loading state while submitting.

## Phase 3: Customer Shopping Flow

### Task F-09: Home Dashboard Screen

- [x] Build header with ServeLoco title, location selector, and cart icon with badge.
- [x] Add search input for items, food, snacks, drinks, and essentials.
- [x] Tapping search opens Product List in search mode.
- [x] Add `Packed Items` / `Fast Food` segmented toggle.
- [x] Add offer banner using backend active offer when available.
- [x] Add fallback offer text: `Flat 30% off on snacks & combos`.
- [x] Add `Shop Offer` button that opens Product List filtered by offer products if available.
- [x] Add horizontal category cards: `Cold Drinks`, `Snacks`, `Fast Food`, `Groceries`, `Desserts`, `Daily Essentials`.
- [x] Category tap opens Product List filtered by category.
- [x] Add combo deal cards with image, title, price, discount label, and `Add` button.
- [x] Replace `Add` with `- quantity +` stepper after an item is in cart.
- [x] Add optional popular product preview list.
- [x] Show sticky mini-cart when cart has items.
- [x] Show shop closed banner when backend settings say closed.
- [x] Disable add controls for unavailable products.
- [x] Add loading skeletons for banner, categories, and products.
- [x] Animate header, search, toggle, offer banner, categories, and products with fade plus upward slide.
- [x] Animate category and combo cards with light staggered entry.
- [x] Animate `Add` button into quantity stepper.
- [x] Animate cart badge scale bump when item count changes.
- [x] Animate sticky mini-cart sliding up when first item is added.

### Task F-10: Categories Screen

- [x] Build header with title, search shortcut, and cart badge.
- [x] Add two-column category grid.
- [x] Include `Cold Drinks`, `Snacks`, `Fast Food`, `Groceries`, `Desserts`, and `Daily Essentials`.
- [x] Each card shows image/icon, category name, and product count when available.
- [x] Add `Packed Items` / `Fast Food` segmented control.
- [x] Add optional horizontal subcategory chips from backend data.
- [x] Add `View All Products` button.
- [x] Add sticky mini-cart when cart has items.
- [x] Add empty category state with `No items found` and `View All Products`.
- [x] Add loading skeleton grid.
- [x] Animate category cards with row-by-row staggered entry.
- [x] Animate segmented control and chip active states.
- [x] Animate empty category state with fade plus upward slide.

### Task F-11: Product List And Search Results Screen

- [x] Build header with back button when opened from category/search.
- [x] Add search field with current query.
- [x] Add cart icon with count badge.
- [x] Add category chips.
- [x] Add availability chip: `Available`.
- [x] Add sort control for `Popular`, `Price Low to High`, and `Price High to Low`.
- [x] Product card shows image/fallback, name, unit/size, price, discount/offer label, and availability.
- [x] Product card includes `Add` button or `- quantity +` stepper.
- [x] Tapping product opens Product Detail.
- [x] Add sticky mini-cart with count, estimated total, and `View Cart`.
- [x] Add empty search state with `No products found` and `Clear Search`.
- [x] Add API error state with `Retry`.
- [x] Animate product cards with staggered entry after data loads.
- [x] Animate filter and sort changes with list crossfade.
- [x] Animate `Add` button into quantity stepper.
- [x] Animate sticky mini-cart sliding in and out.

### Task F-12: Product Detail Screen

- [x] Build header with back button and cart badge.
- [x] Show large product image with fallback.
- [x] Show product name, unit/size, category, price, discount label, and availability.
- [x] Show short product description when backend provides it.
- [x] Add related or similar products section when available.
- [x] Add bottom `Add to Cart` button.
- [x] If product is already in cart, show `- quantity +` stepper and `View Cart`.
- [x] Disable add controls when unavailable.
- [x] Add compact missing-description state.
- [x] Animate product image fade-in after load.
- [x] Animate product details with slight upward slide.
- [x] Animate bottom action bar sliding up when ready.
- [x] Animate related products with light horizontal card entry.

### Task F-13: Cart Screen

- [x] Build header with title, optional back button, and `Clear` action when cart has items.
- [x] Show cart item rows with image, name, unit/size, price, and `- quantity +` stepper.
- [x] Add remove item icon button to each row.
- [x] Show unavailable item warning when backend marks a product unavailable.
- [x] Call `POST /cart/calculate` to verify totals.
- [x] Show bill summary: subtotal, delivery charge, night charge, discount, grand total, and minimum order warning.
- [x] Add bottom `Checkout` button.
- [x] Disable checkout if cart is empty, below minimum order, shop closed, blocked customer, or backend calculation fails.
- [x] Add empty cart state with `Start Shopping`.
- [x] Add recalculation loading state.
- [x] Add backend validation error with retry.
- [x] Animate cart rows in on load and out on remove.
- [x] Animate quantity number with small scale bump on change.
- [x] Animate bill summary totals with crossfade when recalculated.
- [x] Animate empty cart state after last item removal.

### Task F-14: Checkout Screen

- [x] Build header with title and back button.
- [x] Add delivery address text area prefilled from profile when available.
- [x] Add `Use Current Location` button.
- [x] Request GPS permission and show selected coordinates after success.
- [x] Add `Open Map` button when Google Maps URL is available.
- [x] Add payment method selector with `Cash` and `UPI` if backend supports both.
- [x] Show payment status as pending unless backend says otherwise.
- [x] Show order summary from backend totals.
- [x] Add bottom `Place Order` button.
- [x] Add `Back to Cart` text button.
- [x] Validate address before submit.
- [x] Add GPS retry state.
- [x] Show shop closed, minimum order, and blocked customer errors before order creation.
- [x] Disable submit while creating order.
- [x] Create order through `POST /orders`.
- [x] Navigate to Order Confirmation on success.
- [x] Animate delivery, payment, and summary sections with slight stagger.
- [x] Animate GPS success by fading in coordinates and map action.
- [x] Animate GPS failure by fading in retry message.
- [x] Animate `Place Order` button loading transition.

### Task F-15: Order Confirmation Screen

- [x] Show success title.
- [x] Show order id.
- [x] Show estimated/current status label.
- [x] Show delivery address summary.
- [x] Show total paid or payable.
- [x] Add primary button: `View Order`.
- [x] Add secondary button: `Continue Shopping`.
- [x] `View Order` opens Order Detail.
- [x] `Continue Shopping` opens Home and clears checkout state.
- [x] Animate success mark with one scale-in.
- [x] Animate order details fade-in after success mark.
- [x] Animate action buttons sliding up together.

## Phase 4: Customer Account And Orders

### Task F-16: Orders Screen

- [x] Build header with title and optional filter icon.
- [x] Fetch order history through `GET /orders`.
- [x] Add filter chips: `All`, `Pending`, `Preparing`, `Delivered`, `Cancelled`.
- [x] Order card shows order id/date, status, payment status, item count, total, and small product preview.
- [x] Add `View Details` button on each order card.
- [x] Add `Cancel` button only when backend says cancellation is allowed before delivered.
- [x] Add empty state with `Start Shopping`.
- [x] Add loading skeleton cards.
- [x] Add API failure state with `Retry`.
- [x] Cancel orders through `POST /orders/:id/cancel`.
- [x] Animate order cards with staggered entry after loading.
- [x] Animate filter changes with list crossfade.
- [x] Animate cancelled order status with soft highlight fade.

### Task F-17: Order Detail Screen

- [x] Build header with back button and order id.
- [x] Fetch order detail through `GET /orders/:id`.
- [x] Show status timeline.
- [x] Show payment status.
- [x] Show item list with quantity and price.
- [x] Show bill summary.
- [x] Show delivery address and map link when available.
- [x] Show `Cancel Order` only when cancellation is allowed.
- [x] Show `Contact Store` if support phone is configured.
- [x] Show `Continue Shopping`.
- [x] Add cancel confirmation modal with `Keep Order` and `Cancel Order`.
- [x] Add cancel loading and success state.
- [x] Animate status timeline steps from top to bottom.
- [x] Animate cancel confirmation modal with backdrop fade and dialog scale.
- [x] Animate cancel success with short status highlight fade.

### Task F-18: Profile Screen

- [x] Fetch profile through `GET /auth/me`.
- [x] Build header with title.
- [x] Show customer card with name, phone, WhatsApp number, and delivery address.
- [x] Show trust/block warning only if backend exposes a customer-facing status.
- [x] Add profile options: `Edit Profile`, `My Orders`, `Saved Address`, `Help and Support`, `Logout`.
- [x] Add edit icon button on profile card.
- [x] Add logout confirmation modal with `Stay Logged In` and `Logout`.
- [x] Logout clears customer session and protected customer state.
- [x] Animate profile card fade-in first.
- [x] Animate option rows with light staggered entry.
- [x] Animate logout confirmation modal with backdrop fade and dialog scale.

### Task F-19: Edit Profile Screen

- [x] Add fields for full name, WhatsApp number, and delivery address.
- [x] Add primary button: `Save Changes`.
- [x] Add secondary button: `Cancel`.
- [x] Add inline validation.
- [x] Add save loading state.
- [x] Save through `PATCH /auth/profile`.
- [x] Return to Profile after successful save.
- [x] Animate fields with slight staggered entry.
- [x] Animate validation errors with fade-in and optional shake.
- [x] Animate save button loading and short success state before returning.

## Phase 5: Admin Flow

### Task F-20: Admin Entry Screen

- [x] Create hidden admin route not visible in bottom navigation.
- [x] Show minimal ServeLoco admin title.
- [x] Add `Admin Login` button.
- [x] Add back button to customer app.
- [x] If admin session exists, open Admin Dashboard.
- [x] Animate admin title and login button fade-in.
- [x] Add press scale feedback to `Admin Login`.

### Task F-21: Admin Login Screen

- [x] Add owner id field.
- [x] Add password field with eye icon button.
- [x] Add primary button: `Login`.
- [x] Add secondary button: `Back to App`.
- [x] Add inline validation.
- [x] Add API error near button.
- [x] Add loading state that disables inputs.
- [x] Login through `POST /admin/login`.
- [x] Store admin JWT separately from customer JWT.
- [x] Navigate to Admin Dashboard on success.
- [x] Animate form card fade-in.
- [x] Animate invalid fields with short shake and inline error fade-in.
- [x] Animate login button loading transition.

### Task F-22: Admin Dashboard Screen

- [x] Fetch dashboard through `GET /admin/dashboard`.
- [x] Fetch sales report through `GET /admin/reports/sales`.
- [x] Build header with `Admin Dashboard` and logout icon button.
- [x] Add metric cards for today orders, today sales, pending orders, delivered orders, cash total, UPI total, pending payment total, today/week/month sales.
- [x] Add shop open/closed toggle.
- [x] Add buttons: `Manage Orders`, `Manage Products`, `Settings`.
- [x] Add latest order cards with pending orders first.
- [x] Each latest order card shows order id, customer, total, payment status, order status, and `Open` button.
- [x] Add product alerts section if backend exposes unavailable or alert fields.
- [x] Add `View Products` button in product alerts.
- [x] Add top 5 products list with rank, product name, and sales count/amount when available.
- [x] Add loading skeletons and API retry state.
- [x] Animate metric cards with staggered entry.
- [x] Animate shop toggle thumb and color change.
- [x] Animate latest order cards after metrics load.
- [x] Animate refreshed metric values with crossfade.

### Task F-23: Admin Orders Screen

- [x] Fetch admin orders through `GET /admin/orders`.
- [x] Build header with title and search/filter icon.
- [x] Add status chips: `Pending`, `Preparing`, `Out for Delivery`, `Delivered`, `Cancelled`, `All`.
- [x] Add payment chips: `Pending`, `Paid`, `Cash`, `UPI` when available.
- [x] Show pending orders first by default.
- [x] Order card shows customer name, phone, order id/date, short address, total, payment status, and order status.
- [x] Add `Open` button.
- [x] Add call icon button.
- [x] Add WhatsApp icon button.
- [x] Add map icon button.
- [x] Add empty filter state.
- [x] Add loading skeletons.
- [x] Add API failure state with `Retry`.
- [x] Animate order cards with staggered entry, pending first.
- [x] Animate filter changes with list crossfade.
- [x] Add press scale feedback to call, WhatsApp, and map buttons.

### Task F-24: Admin Order Detail Screen

- [x] Fetch order through `GET /admin/orders/:id`.
- [x] Build header with back button and order id.
- [x] Show customer name, phone, WhatsApp, address, and GPS/map link.
- [x] Show item list with quantities and prices.
- [x] Show bill summary.
- [x] Show current order status.
- [x] Show current payment status.
- [x] Add status selector: `Pending`, `Preparing`, `Out for Delivery`, `Delivered`, `Cancelled`.
- [x] Add payment selector: `Pending`, `Paid`, `Failed`, `Refunded` when backend supports values.
- [x] Add primary button: `Update Status`.
- [x] Add secondary button: `Update Payment`.
- [x] Add call, WhatsApp, and map icon buttons.
- [x] Update status through `PATCH /admin/orders/:id/status`.
- [x] Update payment through `PATCH /admin/orders/:id/payment`.
- [x] Add loading and success states for both update actions.
- [x] Animate customer, item, bill, and controls sections with slight stagger.
- [x] Animate status and payment selector active indicator movement.
- [x] Animate successful updates with brief highlight on changed row.

### Task F-25: Admin Products Screen

- [x] Build header with title, search input, and add icon/button.
- [x] Add category chips.
- [x] Add availability chip.
- [x] Add sort button.
- [x] Product row/card shows image, product name, category, price, and availability state.
- [x] Add `Add Product` button.
- [x] Add edit icon button.
- [x] Add delete icon button.
- [x] Add availability toggle.
- [x] Add image upload/change icon button.
- [x] Add empty catalog state with `Add Product`.
- [x] Add confirm delete modal with `Keep Product` and `Delete`.
- [x] Create through `POST /admin/products`.
- [x] Update through `PATCH /admin/products/:id`.
- [x] Delete through `DELETE /admin/products/:id`.
- [x] Toggle availability through `PATCH /admin/products/:id/availability`.
- [x] Attach image through `PATCH /admin/products/:id/image`.
- [x] Animate product rows with staggered entry.
- [x] Animate availability toggle thumb and color change.
- [x] Animate delete confirmation modal with backdrop fade and dialog scale.
- [x] Animate deleted product row collapse/fade-out.

### Task F-26: Admin Product Form Screen

- [x] Support add mode and edit mode.
- [x] Add fields for product name, category, price, unit/size, and description.
- [x] Add availability toggle.
- [x] Add image upload/change control.
- [x] Add image preview with fallback.
- [x] Add primary button: `Save Product`.
- [x] Add secondary button: `Cancel`.
- [x] Add delete button only in edit mode.
- [x] Add field validation.
- [x] Add upload loading state.
- [x] Add save loading state.
- [x] Upload image through `POST /admin/images`.
- [x] Delete old image through `DELETE /admin/images/:id` when replacing or removing an image.
- [x] Return to Admin Products after successful save.
- [x] Animate form sections with slight staggered entry.
- [x] Animate image preview fade-in after upload/select.
- [x] Animate validation errors with fade-in and optional shake.
- [x] Animate save button loading transition.

### Task F-27: Admin Customers Screen

- [x] Fetch customers through `GET /admin/customers`.
- [x] Build header with title and search input.
- [x] Customer card shows name, phone, WhatsApp number, short address, trust status, and block status.
- [x] Add trust toggle.
- [x] Add block toggle.
- [x] Add call icon button.
- [x] Add WhatsApp icon button.
- [x] Blocking requires confirm modal with `Cancel` and `Block Customer`.
- [x] Unblocking requires confirm modal with `Cancel` and `Unblock Customer`.
- [x] Update trust through `PATCH /admin/customers/:id/trust`.
- [x] Update block through `PATCH /admin/customers/:id/block`.
- [x] Add loading, empty, and retry states.
- [x] Animate customer cards with staggered entry.
- [x] Animate trust and block toggle thumb/color changes.
- [x] Animate block and unblock confirmation modals with backdrop fade and dialog scale.

### Task F-28: Admin Settings And Offers Screen

- [x] Read settings through `GET /settings`.
- [x] Build sections for shop status, minimum order, delivery charge, night charge, night charge time window, and active offer banner.
- [x] Add shop open/closed toggle.
- [x] Add numeric inputs for minimum order, delivery charge, and night charge.
- [x] Add text input for offer title.
- [x] Add text input for offer subtitle/description.
- [x] Add offer active toggle.
- [x] Add primary button: `Save Settings`.
- [x] Add secondary button: `Preview Offer`.
- [x] Add `Create Offer` when no offer exists.
- [x] Add `Update Offer` when editing an existing offer.
- [x] Validate numeric fields.
- [x] Add save loading state.
- [x] Show success message after save.
- [x] Update settings through `PATCH /admin/settings`.
- [x] Create offer through `POST /admin/offers`.
- [x] Update offer through `PATCH /admin/offers/:id`.
- [x] Animate settings sections with slight staggered entry.
- [x] Animate toggle thumb/color changes.
- [x] Animate offer preview crossfade when title or subtitle changes.
- [x] Animate save success message with compact fade-in.

## Phase 6: Integration And QA

### Task F-29: Frontend API Integration Pass

- [x] Replace all mock data with backend API calls.
- [x] Confirm login, signup, session restore, and logout work.
- [x] Confirm product list, category filters, search, and image fallback work.
- [x] Confirm add to cart and quantity stepper work from Home, Product List, and Product Detail.
- [x] Confirm cart calculation uses `POST /cart/calculate`.
- [x] Confirm checkout creates an order with address and GPS data.
- [x] Confirm order history and order detail load correctly.
- [x] Confirm eligible order cancellation works.
- [x] Confirm admin login and admin session restore work.
- [x] Confirm admin dashboard, orders, products, customers, settings, and offers call admin APIs only.
- [x] Confirm customer token cannot access admin screens.
- [x] Confirm admin token is stored separately from customer token.

### Task F-30: UI State QA

- [ ] Test loading states for all API screens.
- [ ] Test empty states for products, cart, orders, admin orders, products, and customers.
- [ ] Test API error states and retry buttons.
- [ ] Test disabled buttons for unavailable products, invalid cart, blocked customer, shop closed, and submitting forms.
- [ ] Test inline validation on auth, checkout, profile, product form, and settings forms.
- [ ] Test confirmation modals for logout, cancel order, delete product, block customer, and unblock customer.
- [ ] Test no text overlaps on common Android and iOS screen sizes.
- [ ] Test keyboard does not cover auth, checkout, profile, product form, and settings inputs.
- [ ] Test all visible UI text has no emoji characters.
- [ ] Test tap feedback on buttons, icon buttons, touchable cards, and tabs.
- [ ] Test screen entry animations do not cause layout jumps.
- [ ] Test list stagger animations remain fast on long product and order lists.
- [ ] Test sticky mini-cart slide in/out.
- [ ] Test `Add` to quantity stepper transition.
- [ ] Test modal fade/scale animation on all confirmation modals.
- [ ] Test validation error fade/shake on auth, checkout, profile, product form, and settings.
- [ ] Test skeleton shimmer or pulse on loading states.
- [ ] Test reduced-motion behavior when supported.

### Task F-31: Final Acceptance Checklist

- [ ] React Native app uses JavaScript only.
- [ ] Customer can preview Home for 10 seconds, then login or signup.
- [ ] Customer can browse categories and products.
- [ ] Customer can search and filter products.
- [ ] Customer can add items, update quantity, and view Cart.
- [ ] Customer can checkout with address and GPS success/failure handling.
- [ ] Customer can view order confirmation.
- [ ] Customer can view order history and details.
- [ ] Customer can cancel eligible orders before delivered.
- [ ] Customer can view and edit profile.
- [ ] Admin can access hidden admin entry and login.
- [ ] Admin can view dashboard metrics and latest orders.
- [ ] Admin can update order status and payment status.
- [ ] Admin can manage products and images.
- [ ] Admin can trust/block customers.
- [ ] Admin can update shop settings and active offer.
- [ ] Frontend does not expose database credentials.
- [ ] Frontend imports no direct database SDKs.
- [ ] Product prices and order totals cannot be spoofed from the client UI.
- [ ] Every screen follows the App Animation Standard.
- [ ] Animations are subtle, fast, and do not block input.
- [ ] No continuous decorative animation exists except auth illustration float and loading skeleton shimmer.
