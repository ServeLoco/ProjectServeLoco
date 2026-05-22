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

- [ ] Create reusable fade-and-slide entry helper for screen sections.
- [ ] Create reusable staggered-list helper for product, category, order, and admin cards.
- [ ] Create reusable press feedback wrapper for touchable cards, buttons, and icon buttons.
- [ ] Create animated cart badge count bump.
- [ ] Create animated sticky mini-cart show/hide behavior.
- [ ] Create animated `Add` to quantity stepper transition.
- [ ] Create animated segmented control active indicator.
- [ ] Create animated bottom tab active indicator and icon scale.
- [ ] Create animated modal wrapper with backdrop fade and dialog scale.
- [ ] Create animated validation error helper with fade-in and optional shake.
- [ ] Create skeleton shimmer or pulse component.
- [ ] Add reduced-motion helper to disable decorative loops, staggered entry, and shake animations when supported.

### Task F-04: API Client

- [ ] Create one backend API client wrapper.
- [ ] Support base URL configuration.
- [ ] Attach customer JWT to customer requests.
- [ ] Attach admin JWT to admin requests.
- [ ] Handle JSON responses, network errors, unauthorized errors, and backend validation errors.
- [ ] Add methods for auth, products, cart, orders, settings, offers, admin dashboard, admin products, admin orders, admin customers, and admin images.
- [ ] Ensure no screen imports database packages or direct database credentials.

### Task F-05: Session And Stores

- [ ] Create customer auth/session store.
- [ ] Create separate admin auth/session store.
- [ ] Persist and restore sessions on app start.
- [ ] Add logout and admin logout actions.
- [ ] Create cart store with items, quantities, item count, and clear cart.
- [ ] Keep cart prices display-only until backend recalculation returns verified totals.
- [ ] Add app settings store for shop status, minimum order, delivery charges, night charges, and active offer.

### Task F-06: Navigation

- [ ] Add customer bottom tabs: `Home`, `Categories`, `Orders`, `Profile`.
- [ ] Add customer stack screens: `Home`, `Categories`, `Product List`, `Product Detail`, `Cart`, `Checkout`, `Order Confirmation`, `Orders`, `Order Detail`, `Profile`, `Edit Profile`, `Auth`.
- [ ] Add admin stack screens: `Admin Entry`, `Admin Login`, `Admin Dashboard`, `Admin Orders`, `Admin Order Detail`, `Admin Products`, `Admin Product Form`, `Admin Customers`, `Admin Settings`.
- [ ] Keep Cart out of the bottom tabs.
- [ ] Show Cart through header cart icon and sticky mini-cart.
- [ ] Add hidden admin entry route that is not visible in customer bottom navigation.
- [ ] Restore the correct route after customer or admin session restore.
- [ ] Animate bottom tab active icon scale and active indicator movement.
- [ ] Use subtle screen fade/slide transition when moving between stack screens.
- [ ] Keep navigation animations short so back/forward actions feel instant.

## Phase 2: Auth And Preview Gate

### Task F-07: Home Preview And Auth Gate

- [ ] Show Home Dashboard preview first.
- [ ] Allow preview for 10 seconds.
- [ ] After 10 seconds, require login/signup when the user tries to continue into protected actions.
- [ ] Protected actions include add to cart, checkout, orders, profile edit, and order cancellation.
- [ ] If already logged in, skip the auth gate.
- [ ] On successful auth, return to the intended action or Home.
- [ ] Fade in the auth prompt when a protected action is blocked.
- [ ] Keep preview-to-auth transition smooth with no layout jump.

### Task F-08: Login And Sign Up Screen

- [ ] Build a full-screen auth layout with ServeLoco brand/logo placeholder.
- [ ] Add trust line: `Food, snacks and essentials delivered fast`.
- [ ] Add a small local illustration or product image placeholder.
- [ ] Add elevated auth card with segmented tabs: `Login` and `Sign Up`.
- [ ] Make `Login` the default tab.
- [ ] Login fields: phone number, password, password eye icon.
- [ ] Login buttons: `Login`, `Create an account`.
- [ ] Sign Up fields: full name, phone number, WhatsApp number, delivery address, password, confirm password.
- [ ] Sign Up buttons: `Create Account`, `Already have an account`.
- [ ] Add required field validation.
- [ ] Add password confirmation validation.
- [ ] Show inline API errors above the primary button.
- [ ] Show loading state and disable inputs while submitting.
- [ ] Call `POST /auth/login` for login.
- [ ] Call `POST /auth/signup` for signup.
- [ ] Store returned customer JWT/session.
- [ ] Navigate to Home after successful auth.
- [ ] Animate brand and trust line with fade plus upward slide on screen load.
- [ ] Animate illustration with slow vertical float loop.
- [ ] Animate auth card fade-in after brand animation.
- [ ] Animate active tab indicator sliding between `Login` and `Sign Up`.
- [ ] Animate form content with crossfade and horizontal slide on tab change.
- [ ] Animate card height when switching between login and signup forms.
- [ ] Animate invalid fields with short shake and inline error fade-in.
- [ ] Animate primary button loading state while submitting.

## Phase 3: Customer Shopping Flow

### Task F-09: Home Dashboard Screen

- [ ] Build header with ServeLoco title, location selector, and cart icon with badge.
- [ ] Add search input for items, food, snacks, drinks, and essentials.
- [ ] Tapping search opens Product List in search mode.
- [ ] Add `Packed Items` / `Fast Food` segmented toggle.
- [ ] Add offer banner using backend active offer when available.
- [ ] Add fallback offer text: `Flat 30% off on snacks & combos`.
- [ ] Add `Shop Offer` button that opens Product List filtered by offer products if available.
- [ ] Add horizontal category cards: `Cold Drinks`, `Snacks`, `Fast Food`, `Groceries`, `Desserts`, `Daily Essentials`.
- [ ] Category tap opens Product List filtered by category.
- [ ] Add combo deal cards with image, title, price, discount label, and `Add` button.
- [ ] Replace `Add` with `- quantity +` stepper after an item is in cart.
- [ ] Add optional popular product preview list.
- [ ] Show sticky mini-cart when cart has items.
- [ ] Show shop closed banner when backend settings say closed.
- [ ] Disable add controls for unavailable products.
- [ ] Add loading skeletons for banner, categories, and products.
- [ ] Animate header, search, toggle, offer banner, categories, and products with fade plus upward slide.
- [ ] Animate category and combo cards with light staggered entry.
- [ ] Animate `Add` button into quantity stepper.
- [ ] Animate cart badge scale bump when item count changes.
- [ ] Animate sticky mini-cart sliding up when first item is added.

### Task F-10: Categories Screen

- [ ] Build header with title, search shortcut, and cart badge.
- [ ] Add two-column category grid.
- [ ] Include `Cold Drinks`, `Snacks`, `Fast Food`, `Groceries`, `Desserts`, and `Daily Essentials`.
- [ ] Each card shows image/icon, category name, and product count when available.
- [ ] Add `Packed Items` / `Fast Food` segmented control.
- [ ] Add optional horizontal subcategory chips from backend data.
- [ ] Add `View All Products` button.
- [ ] Add sticky mini-cart when cart has items.
- [ ] Add empty category state with `No items found` and `View All Products`.
- [ ] Add loading skeleton grid.
- [ ] Animate category cards with row-by-row staggered entry.
- [ ] Animate segmented control and chip active states.
- [ ] Animate empty category state with fade plus upward slide.

### Task F-11: Product List And Search Results Screen

- [ ] Build header with back button when opened from category/search.
- [ ] Add search field with current query.
- [ ] Add cart icon with count badge.
- [ ] Add category chips.
- [ ] Add availability chip: `Available`.
- [ ] Add sort control for `Popular`, `Price Low to High`, and `Price High to Low`.
- [ ] Product card shows image/fallback, name, unit/size, price, discount/offer label, and availability.
- [ ] Product card includes `Add` button or `- quantity +` stepper.
- [ ] Tapping product opens Product Detail.
- [ ] Add sticky mini-cart with count, estimated total, and `View Cart`.
- [ ] Add empty search state with `No products found` and `Clear Search`.
- [ ] Add API error state with `Retry`.
- [ ] Animate product cards with staggered entry after data loads.
- [ ] Animate filter and sort changes with list crossfade.
- [ ] Animate `Add` button into quantity stepper.
- [ ] Animate sticky mini-cart sliding in and out.

### Task F-12: Product Detail Screen

- [ ] Build header with back button and cart badge.
- [ ] Show large product image with fallback.
- [ ] Show product name, unit/size, category, price, discount label, and availability.
- [ ] Show short product description when backend provides it.
- [ ] Add related or similar products section when available.
- [ ] Add bottom `Add to Cart` button.
- [ ] If product is already in cart, show `- quantity +` stepper and `View Cart`.
- [ ] Disable add controls when unavailable.
- [ ] Add compact missing-description state.
- [ ] Animate product image fade-in after load.
- [ ] Animate product details with slight upward slide.
- [ ] Animate bottom action bar sliding up when ready.
- [ ] Animate related products with light horizontal card entry.

### Task F-13: Cart Screen

- [ ] Build header with title, optional back button, and `Clear` action when cart has items.
- [ ] Show cart item rows with image, name, unit/size, price, and `- quantity +` stepper.
- [ ] Add remove item icon button to each row.
- [ ] Show unavailable item warning when backend marks a product unavailable.
- [ ] Call `POST /cart/calculate` to verify totals.
- [ ] Show bill summary: subtotal, delivery charge, night charge, discount, grand total, and minimum order warning.
- [ ] Add bottom `Checkout` button.
- [ ] Disable checkout if cart is empty, below minimum order, shop closed, blocked customer, or backend calculation fails.
- [ ] Add empty cart state with `Start Shopping`.
- [ ] Add recalculation loading state.
- [ ] Add backend validation error with retry.
- [ ] Animate cart rows in on load and out on remove.
- [ ] Animate quantity number with small scale bump on change.
- [ ] Animate bill summary totals with crossfade when recalculated.
- [ ] Animate empty cart state after last item removal.

### Task F-14: Checkout Screen

- [ ] Build header with title and back button.
- [ ] Add delivery address text area prefilled from profile when available.
- [ ] Add `Use Current Location` button.
- [ ] Request GPS permission and show selected coordinates after success.
- [ ] Add `Open Map` button when Google Maps URL is available.
- [ ] Add payment method selector with `Cash` and `UPI` if backend supports both.
- [ ] Show payment status as pending unless backend says otherwise.
- [ ] Show order summary from backend totals.
- [ ] Add bottom `Place Order` button.
- [ ] Add `Back to Cart` text button.
- [ ] Validate address before submit.
- [ ] Add GPS retry state.
- [ ] Show shop closed, minimum order, and blocked customer errors before order creation.
- [ ] Disable submit while creating order.
- [ ] Create order through `POST /orders`.
- [ ] Navigate to Order Confirmation on success.
- [ ] Animate delivery, payment, and summary sections with slight stagger.
- [ ] Animate GPS success by fading in coordinates and map action.
- [ ] Animate GPS failure by fading in retry message.
- [ ] Animate `Place Order` button loading transition.

### Task F-15: Order Confirmation Screen

- [ ] Show success title.
- [ ] Show order id.
- [ ] Show estimated/current status label.
- [ ] Show delivery address summary.
- [ ] Show total paid or payable.
- [ ] Add primary button: `View Order`.
- [ ] Add secondary button: `Continue Shopping`.
- [ ] `View Order` opens Order Detail.
- [ ] `Continue Shopping` opens Home and clears checkout state.
- [ ] Animate success mark with one scale-in.
- [ ] Animate order details fade-in after success mark.
- [ ] Animate action buttons sliding up together.

## Phase 4: Customer Account And Orders

### Task F-16: Orders Screen

- [ ] Build header with title and optional filter icon.
- [ ] Fetch order history through `GET /orders`.
- [ ] Add filter chips: `All`, `Pending`, `Preparing`, `Delivered`, `Cancelled`.
- [ ] Order card shows order id/date, status, payment status, item count, total, and small product preview.
- [ ] Add `View Details` button on each order card.
- [ ] Add `Cancel` button only when backend says cancellation is allowed before delivered.
- [ ] Add empty state with `Start Shopping`.
- [ ] Add loading skeleton cards.
- [ ] Add API failure state with `Retry`.
- [ ] Cancel orders through `POST /orders/:id/cancel`.
- [ ] Animate order cards with staggered entry after loading.
- [ ] Animate filter changes with list crossfade.
- [ ] Animate cancelled order status with soft highlight fade.

### Task F-17: Order Detail Screen

- [ ] Build header with back button and order id.
- [ ] Fetch order detail through `GET /orders/:id`.
- [ ] Show status timeline.
- [ ] Show payment status.
- [ ] Show item list with quantity and price.
- [ ] Show bill summary.
- [ ] Show delivery address and map link when available.
- [ ] Show `Cancel Order` only when cancellation is allowed.
- [ ] Show `Contact Store` if support phone is configured.
- [ ] Show `Continue Shopping`.
- [ ] Add cancel confirmation modal with `Keep Order` and `Cancel Order`.
- [ ] Add cancel loading and success state.
- [ ] Animate status timeline steps from top to bottom.
- [ ] Animate cancel confirmation modal with backdrop fade and dialog scale.
- [ ] Animate cancel success with short status highlight fade.

### Task F-18: Profile Screen

- [ ] Fetch profile through `GET /auth/me`.
- [ ] Build header with title.
- [ ] Show customer card with name, phone, WhatsApp number, and delivery address.
- [ ] Show trust/block warning only if backend exposes a customer-facing status.
- [ ] Add profile options: `Edit Profile`, `My Orders`, `Saved Address`, `Help and Support`, `Logout`.
- [ ] Add edit icon button on profile card.
- [ ] Add logout confirmation modal with `Stay Logged In` and `Logout`.
- [ ] Logout clears customer session and protected customer state.
- [ ] Animate profile card fade-in first.
- [ ] Animate option rows with light staggered entry.
- [ ] Animate logout confirmation modal with backdrop fade and dialog scale.

### Task F-19: Edit Profile Screen

- [ ] Add fields for full name, WhatsApp number, and delivery address.
- [ ] Add primary button: `Save Changes`.
- [ ] Add secondary button: `Cancel`.
- [ ] Add inline validation.
- [ ] Add save loading state.
- [ ] Save through `PATCH /auth/profile`.
- [ ] Return to Profile after successful save.
- [ ] Animate fields with slight staggered entry.
- [ ] Animate validation errors with fade-in and optional shake.
- [ ] Animate save button loading and short success state before returning.

## Phase 5: Admin Flow

### Task F-20: Admin Entry Screen

- [ ] Create hidden admin route not visible in bottom navigation.
- [ ] Show minimal ServeLoco admin title.
- [ ] Add `Admin Login` button.
- [ ] Add back button to customer app.
- [ ] If admin session exists, open Admin Dashboard.
- [ ] Animate admin title and login button fade-in.
- [ ] Add press scale feedback to `Admin Login`.

### Task F-21: Admin Login Screen

- [ ] Add owner id field.
- [ ] Add password field with eye icon button.
- [ ] Add primary button: `Login`.
- [ ] Add secondary button: `Back to App`.
- [ ] Add inline validation.
- [ ] Add API error near button.
- [ ] Add loading state that disables inputs.
- [ ] Login through `POST /admin/login`.
- [ ] Store admin JWT separately from customer JWT.
- [ ] Navigate to Admin Dashboard on success.
- [ ] Animate form card fade-in.
- [ ] Animate invalid fields with short shake and inline error fade-in.
- [ ] Animate login button loading transition.

### Task F-22: Admin Dashboard Screen

- [ ] Fetch dashboard through `GET /admin/dashboard`.
- [ ] Fetch sales report through `GET /admin/reports/sales`.
- [ ] Build header with `Admin Dashboard` and logout icon button.
- [ ] Add metric cards for today orders, today sales, pending orders, delivered orders, cash total, UPI total, pending payment total, today/week/month sales.
- [ ] Add shop open/closed toggle.
- [ ] Add buttons: `Manage Orders`, `Manage Products`, `Settings`.
- [ ] Add latest order cards with pending orders first.
- [ ] Each latest order card shows order id, customer, total, payment status, order status, and `Open` button.
- [ ] Add product alerts section if backend exposes unavailable or alert fields.
- [ ] Add `View Products` button in product alerts.
- [ ] Add top 5 products list with rank, product name, and sales count/amount when available.
- [ ] Add loading skeletons and API retry state.
- [ ] Animate metric cards with staggered entry.
- [ ] Animate shop toggle thumb and color change.
- [ ] Animate latest order cards after metrics load.
- [ ] Animate refreshed metric values with crossfade.

### Task F-23: Admin Orders Screen

- [ ] Fetch admin orders through `GET /admin/orders`.
- [ ] Build header with title and search/filter icon.
- [ ] Add status chips: `Pending`, `Preparing`, `Out for Delivery`, `Delivered`, `Cancelled`, `All`.
- [ ] Add payment chips: `Pending`, `Paid`, `Cash`, `UPI` when available.
- [ ] Show pending orders first by default.
- [ ] Order card shows customer name, phone, order id/date, short address, total, payment status, and order status.
- [ ] Add `Open` button.
- [ ] Add call icon button.
- [ ] Add WhatsApp icon button.
- [ ] Add map icon button.
- [ ] Add empty filter state.
- [ ] Add loading skeletons.
- [ ] Add API failure state with `Retry`.
- [ ] Animate order cards with staggered entry, pending first.
- [ ] Animate filter changes with list crossfade.
- [ ] Add press scale feedback to call, WhatsApp, and map buttons.

### Task F-24: Admin Order Detail Screen

- [ ] Fetch order through `GET /admin/orders/:id`.
- [ ] Build header with back button and order id.
- [ ] Show customer name, phone, WhatsApp, address, and GPS/map link.
- [ ] Show item list with quantities and prices.
- [ ] Show bill summary.
- [ ] Show current order status.
- [ ] Show current payment status.
- [ ] Add status selector: `Pending`, `Preparing`, `Out for Delivery`, `Delivered`, `Cancelled`.
- [ ] Add payment selector: `Pending`, `Paid`, `Failed`, `Refunded` when backend supports values.
- [ ] Add primary button: `Update Status`.
- [ ] Add secondary button: `Update Payment`.
- [ ] Add call, WhatsApp, and map icon buttons.
- [ ] Update status through `PATCH /admin/orders/:id/status`.
- [ ] Update payment through `PATCH /admin/orders/:id/payment`.
- [ ] Add loading and success states for both update actions.
- [ ] Animate customer, item, bill, and controls sections with slight stagger.
- [ ] Animate status and payment selector active indicator movement.
- [ ] Animate successful updates with brief highlight on changed row.

### Task F-25: Admin Products Screen

- [ ] Build header with title, search input, and add icon/button.
- [ ] Add category chips.
- [ ] Add availability chip.
- [ ] Add sort button.
- [ ] Product row/card shows image, product name, category, price, and availability state.
- [ ] Add `Add Product` button.
- [ ] Add edit icon button.
- [ ] Add delete icon button.
- [ ] Add availability toggle.
- [ ] Add image upload/change icon button.
- [ ] Add empty catalog state with `Add Product`.
- [ ] Add confirm delete modal with `Keep Product` and `Delete`.
- [ ] Create through `POST /admin/products`.
- [ ] Update through `PATCH /admin/products/:id`.
- [ ] Delete through `DELETE /admin/products/:id`.
- [ ] Toggle availability through `PATCH /admin/products/:id/availability`.
- [ ] Attach image through `PATCH /admin/products/:id/image`.
- [ ] Animate product rows with staggered entry.
- [ ] Animate availability toggle thumb and color change.
- [ ] Animate delete confirmation modal with backdrop fade and dialog scale.
- [ ] Animate deleted product row collapse/fade-out.

### Task F-26: Admin Product Form Screen

- [ ] Support add mode and edit mode.
- [ ] Add fields for product name, category, price, unit/size, and description.
- [ ] Add availability toggle.
- [ ] Add image upload/change control.
- [ ] Add image preview with fallback.
- [ ] Add primary button: `Save Product`.
- [ ] Add secondary button: `Cancel`.
- [ ] Add delete button only in edit mode.
- [ ] Add field validation.
- [ ] Add upload loading state.
- [ ] Add save loading state.
- [ ] Upload image through `POST /admin/images`.
- [ ] Delete old image through `DELETE /admin/images/:id` when replacing or removing an image.
- [ ] Return to Admin Products after successful save.
- [ ] Animate form sections with slight staggered entry.
- [ ] Animate image preview fade-in after upload/select.
- [ ] Animate validation errors with fade-in and optional shake.
- [ ] Animate save button loading transition.

### Task F-27: Admin Customers Screen

- [ ] Fetch customers through `GET /admin/customers`.
- [ ] Build header with title and search input.
- [ ] Customer card shows name, phone, WhatsApp number, short address, trust status, and block status.
- [ ] Add trust toggle.
- [ ] Add block toggle.
- [ ] Add call icon button.
- [ ] Add WhatsApp icon button.
- [ ] Blocking requires confirm modal with `Cancel` and `Block Customer`.
- [ ] Unblocking requires confirm modal with `Cancel` and `Unblock Customer`.
- [ ] Update trust through `PATCH /admin/customers/:id/trust`.
- [ ] Update block through `PATCH /admin/customers/:id/block`.
- [ ] Add loading, empty, and retry states.
- [ ] Animate customer cards with staggered entry.
- [ ] Animate trust and block toggle thumb/color changes.
- [ ] Animate block and unblock confirmation modals with backdrop fade and dialog scale.

### Task F-28: Admin Settings And Offers Screen

- [ ] Read settings through `GET /settings`.
- [ ] Build sections for shop status, minimum order, delivery charge, night charge, night charge time window, and active offer banner.
- [ ] Add shop open/closed toggle.
- [ ] Add numeric inputs for minimum order, delivery charge, and night charge.
- [ ] Add text input for offer title.
- [ ] Add text input for offer subtitle/description.
- [ ] Add offer active toggle.
- [ ] Add primary button: `Save Settings`.
- [ ] Add secondary button: `Preview Offer`.
- [ ] Add `Create Offer` when no offer exists.
- [ ] Add `Update Offer` when editing an existing offer.
- [ ] Validate numeric fields.
- [ ] Add save loading state.
- [ ] Show success message after save.
- [ ] Update settings through `PATCH /admin/settings`.
- [ ] Create offer through `POST /admin/offers`.
- [ ] Update offer through `PATCH /admin/offers/:id`.
- [ ] Animate settings sections with slight staggered entry.
- [ ] Animate toggle thumb/color changes.
- [ ] Animate offer preview crossfade when title or subtitle changes.
- [ ] Animate save success message with compact fade-in.

## Phase 6: Integration And QA

### Task F-29: Frontend API Integration Pass

- [ ] Replace all mock data with backend API calls.
- [ ] Confirm login, signup, session restore, and logout work.
- [ ] Confirm product list, category filters, search, and image fallback work.
- [ ] Confirm add to cart and quantity stepper work from Home, Product List, and Product Detail.
- [ ] Confirm cart calculation uses `POST /cart/calculate`.
- [ ] Confirm checkout creates an order with address and GPS data.
- [ ] Confirm order history and order detail load correctly.
- [ ] Confirm eligible order cancellation works.
- [ ] Confirm admin login and admin session restore work.
- [ ] Confirm admin dashboard, orders, products, customers, settings, and offers call admin APIs only.
- [ ] Confirm customer token cannot access admin screens.
- [ ] Confirm admin token is stored separately from customer token.

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
