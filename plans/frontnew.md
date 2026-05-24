# Front New Design And Flow Tasks

## Goal
Update the customer app flow and visual design so the first user experience is login/signup, then the user reaches the dashboard/home screen after authentication.

The app should keep the same real content, backend APIs, data, forms, buttons, cart behavior, checkout flow, orders, profile, and navigation destinations. Only the entry flow and frontend presentation should change.

Design direction:
- Light glass 3D mobile UI
- Soft off-white/grey background
- Tactile raised cards and inset fields
- Premium dark primary buttons
- Green confirmation and cart actions
- Orange offer/highlight surfaces
- Floating bottom navigation with dark active pill
- Smooth responsive phone-first layout

The provided screenshots and HTML file are design references only. The final UI should match their quality, mood, spacing, depth, and interaction feel, but should not copy them exactly.

---

## 1. Scope And Non-Negotiables

### Goal
Keep implementation focused and prevent feature regressions.

### In scope
- Customer app flow in `Frontend-V1`
- Login/signup first experience
- Dashboard/home after successful auth
- Theme tokens and reusable component styling
- Screen-level visual polish for existing screens
- Mobile responsiveness and no horizontal overflow
- Smooth micro-interactions

### Out of scope
- Backend logic changes
- Database changes
- Admin manager changes
- New customer features
- Removing existing customer features
- Changing product/category/order/cart data contracts

### Must not change
- Existing API endpoints and request payload intent
- Existing auth login/signup API calls
- Existing cart/add/remove/update behavior
- Existing checkout/order placement behavior
- Existing order history behavior
- Existing profile edit behavior
- Existing product/category content source
- Existing payment method behavior

### Testing checklist
- [x] Login still authenticates with existing backend
- [x] Signup still creates a user with existing backend
- [x] Authenticated user lands on dashboard/home
- [x] Logged-out user sees login/signup first
- [x] Existing cart, checkout, orders, and profile flows still work

---

## 2. Current Flow Review

### Goal
Understand current navigation before changing the entry flow.

### Files likely checked
- `Frontend-V1/App.js`
- `Frontend-V1/src/navigation/RootNavigator.js`
- `Frontend-V1/src/navigation/CustomerNavigator.js`
- `Frontend-V1/src/screens/customer/AuthScreen/AuthScreen.js`
- `Frontend-V1/src/stores/useAuthStore.js`
- `Frontend-V1/src/hooks/useAuthGate.js`

### Current notes
- `RootNavigator` currently renders `CustomerNavigator`.
- `CustomerNavigator` starts at `MainTabs`.
- `AuthScreen` currently exists inside the customer stack as a transparent modal.
- `HomeScreen` uses `useAuthGate` for protected actions.
- Auth state is managed through `useAuthStore`.

### Subtasks
- [x] Confirm how persisted auth state is loaded on app start
- [x] Confirm how `setSession` stores token and user profile
- [x] Confirm how logout clears session
- [x] Confirm how `useAuthGate` redirects protected actions
- [x] Confirm current screen names used after login/signup
- [x] Confirm no admin screens remain in the customer app flow

### Things to avoid
- [x] Do not remove `useAuthGate` until the new auth-first flow is proven
- [x] Do not break deep screen navigation such as cart, checkout, and order detail
- [x] Do not change auth API payload fields during flow work

### Testing checklist
- [x] Fresh app launch behavior is understood
- [x] Logged-in app launch behavior is understood
- [x] Logout behavior is understood
- [x] Existing auth modal behavior is documented before replacement

---

## 3. Auth-First Navigation Plan

### Goal
Show login/signup before dashboard for logged-out users, then route to home/dashboard after successful auth.

### Files likely changed
- `Frontend-V1/src/navigation/RootNavigator.js`
- `Frontend-V1/src/navigation/CustomerNavigator.js`
- `Frontend-V1/src/screens/customer/AuthScreen/AuthScreen.js`
- `Frontend-V1/src/stores/useAuthStore.js` only if session boot state needs clarification

### Exact changes to make
- [x] Add an auth-aware root decision:
  - If no valid customer token exists, show `AuthScreen`
  - If a valid customer token exists, show `CustomerNavigator`
- [x] Make `AuthScreen` usable as a full first screen, not only as a modal
- [x] After successful login, navigate or re-render into `CustomerNavigator`
- [x] After successful signup, navigate or re-render into `CustomerNavigator`
- [x] Keep redirect behavior for protected actions where still useful
- [x] On logout, return user to `AuthScreen`
- [x] Keep `MainTabs` as the dashboard/home shell after auth
- [x] Decide whether the modal `Auth` stack route is still needed for edge cases
- [x] If the modal route is kept, ensure it does not conflict with auth-first startup

### Things to avoid
- [x] Do not create duplicate navigation containers
- [x] Do not reset cart or settings unnecessarily on login
- [x] Do not trap logged-in users on auth screen
- [x] Do not allow logged-out users into checkout/order placement

### Testing checklist
- [x] Fresh install opens login/signup screen first
- [x] Login lands on home/dashboard
- [x] Signup lands on home/dashboard
- [x] App restart while logged in opens dashboard/home
- [x] Logout returns to login/signup
- [x] Back button does not return logged-out users to dashboard

---

## 4. Design Token Foundation

### Goal
Create a consistent glass/light-3D theme foundation used across screens.

### Files likely changed
- `Frontend-V1/src/theme/colors.js`
- `Frontend-V1/src/theme/shadows.js`
- `Frontend-V1/src/theme/borders.js`
- `Frontend-V1/src/theme/spacing.js`
- `Frontend-V1/src/theme/typography.js`
- `Frontend-V1/src/theme/motion.js`
- `Frontend-V1/src/theme/layout.js`

### Exact changes to make
- [x] Set app background near `#EEF0F3`
- [x] Use near-black ink near `#0E1116` for primary controls
- [x] Use white/near-white raised surfaces
- [x] Add semantic accents:
  - Success green for cart, delivery, payment success
  - Orange/saffron for offers and highlights
  - Blue for accepted/info
  - Amber for packing/warning
  - Red for errors/cancelled
- [x] Add raised shadow tokens for cards and bars
- [x] Add inset shadow style tokens where React Native supports the effect
- [x] Keep radius controlled:
  - Cards mostly `12-16`
  - Buttons `14-16`
  - Chips/nav pills fully rounded
- [x] Keep typography system-based with bold compact headings
- [x] Add fast motion tokens for tap, card press, and screen entry

### Things to avoid
- [x] Do not remove existing exported token names
- [x] Do not make the app one-color or too dark
- [x] Do not use giant radiuses everywhere
- [x] Do not add theme values that require backend changes

### Testing checklist
- [x] App imports still resolve
- [x] Existing screens compile
- [x] No unreadable text on light backgrounds
- [x] Buttons and cards remain visually distinct

---

## 5. Auth Screen Redesign

### Goal
Make login/signup match the reference style while keeping current form content and logic.

### Files likely changed
- `Frontend-V1/src/screens/customer/AuthScreen/AuthScreen.js`
- `Frontend-V1/src/components/TextInputField.js`
- `Frontend-V1/src/components/Button.js`
- `Frontend-V1/src/components/SegmentedControl.js`

### Exact changes to make
- [x] Convert auth UI into a full-screen mobile-first entry screen
- [x] Use soft grey background with subtle glass/3D surfaces
- [x] Use bold welcome heading and compact helper text
- [x] Keep existing login fields:
  - Phone
  - Password
- [x] Keep existing signup fields:
  - Full name
  - Phone
  - WhatsApp number
  - Delivery address
  - Password
  - Confirm password
- [x] Use inset input styling inspired by reference
- [x] Use dark raised 3D primary button for login/signup submit
- [x] Keep login/signup switch, but style it cleanly
- [x] Keep existing validation and error messages
- [x] If a close button exists only for modal mode, hide/remove it only in auth-first mode
- [x] Keep keyboard behavior on Android and iOS

### Things to avoid
- [x] Do not remove signup fields
- [x] Do not change validation rules
- [x] Do not add social login buttons unless already supported
- [x] Do not change auth API calls
- [x] Do not make auth screen horizontally scroll

### Testing checklist
- [x] Login form submits correctly
- [x] Signup form submits correctly
- [x] Error shake/message still works
- [x] Keyboard does not cover submit button
- [x] Small phone widths remain usable

---

## 6. Dashboard/Home Redesign

### Goal
Make the existing home dashboard look like the reference home screen while keeping existing app content.

### Files likely changed
- `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js`
- `Frontend-V1/src/components/CategoryCard.js`
- `Frontend-V1/src/components/ProductCard.js`
- `Frontend-V1/src/components/StickyMiniCart.js`
- `Frontend-V1/src/components/LoadingSkeleton.js`

### Exact changes to make
- [ ] Keep current content sources:
  - Address/location
  - Cart badge
  - Store type switch
  - Categories
  - Active offer
  - Featured products
  - Shop status
  - Sticky mini cart
- [ ] Style header like a clean mobile dashboard
- [ ] Use raised icon buttons for cart and actions
- [ ] Make search/store controls feel inset or raised depending on current layout
- [ ] Keep four category cards per row where currently intended
- [ ] Make category cards tactile, compact, and readable
- [ ] Style active offer with orange/saffron 3D depth
- [ ] Style product grid like the reference:
  - Image panel on top
  - Price/name below
  - Small discount/status chip where current data exists
  - Dark or raised quantity controls
- [ ] Keep sticky mini cart green and raised like reference

### Things to avoid
- [ ] Do not add fake shops or fake categories
- [ ] Do not remove current Packed/Fast Food behavior
- [ ] Do not change product filtering logic
- [ ] Do not change add-to-cart handlers
- [ ] Do not create horizontal scroll

### Testing checklist
- [ ] Home loads categories from backend
- [ ] Home loads products from backend
- [ ] Category tap opens product list
- [ ] Product add/remove still works
- [ ] Sticky cart opens cart
- [ ] Four-card category row fits on common phone widths

---

## 7. Bottom Navigation Redesign

### Goal
Match the floating premium nav style from the reference.

### Files likely changed
- `Frontend-V1/src/navigation/CustomerNavigator.js`
- `Frontend-V1/src/components/AppIcon.js`
- Theme token files if needed

### Exact changes to make
- [ ] Keep current tab routes:
  - Home
  - Categories
  - Orders
  - Profile
- [ ] Use floating rounded nav container
- [ ] Use dark active pill with white/bright icon
- [ ] Use muted inactive icons
- [ ] Add subtle active scale or pill animation
- [ ] Keep tab labels only if current UX requires them and they fit cleanly
- [ ] Ensure bottom safe area and sticky cart do not overlap badly

### Things to avoid
- [ ] Do not rename tab routes
- [ ] Do not add cart as a tab
- [ ] Do not hide navigation on main tabs unless current behavior expects it
- [ ] Do not make active tab text overflow

### Testing checklist
- [ ] All tabs navigate correctly
- [ ] Active state updates correctly
- [ ] Nav does not overlap main actions on common screens
- [ ] Nav remains usable on small phones

---

## 8. Cart Screen Redesign

### Goal
Make cart visually match the reference cart while preserving current cart behavior.

### Files likely changed
- `Frontend-V1/src/screens/customer/CartScreen/CartScreen.js`
- `Frontend-V1/src/components/QuantityStepper.js`
- `Frontend-V1/src/components/Button.js`
- `Frontend-V1/src/components/ProductImage.js`

### Exact changes to make
- [ ] Keep existing cart item data and quantity behavior
- [ ] Use raised white cart rows
- [ ] Use compact image tiles with soft colored backgrounds where product images need fallback
- [ ] Use dark 3D quantity steppers
- [ ] Use raised coupon/payment/bill detail sections
- [ ] Use green 3D checkout/place-order style action where existing action means checkout
- [ ] Keep empty cart state but style it within the new theme

### Things to avoid
- [ ] Do not change subtotal calculation
- [ ] Do not trust frontend totals for checkout
- [ ] Do not remove invalid-item guards already added to cart
- [ ] Do not change cart store behavior

### Testing checklist
- [ ] Cart opens without crash
- [ ] Quantity plus/minus works
- [ ] Remove item works
- [ ] Clear cart works
- [ ] Checkout navigation works
- [ ] Empty cart state works

---

## 9. Profile Screen Redesign

### Goal
Make profile match the raised summary card and clean menu-row style from the reference.

### Files likely changed
- `Frontend-V1/src/screens/customer/ProfileScreen/ProfileScreen.js`
- `Frontend-V1/src/screens/customer/EditProfileScreen/EditProfileScreen.js`
- Shared card/icon components if used

### Exact changes to make
- [ ] Keep existing profile content and actions
- [ ] Use raised profile summary card
- [ ] Use dark rounded avatar tile or existing user avatar pattern
- [ ] Style stats as compact raised tiles
- [ ] Style menu rows as grouped white cards
- [ ] Keep logout action visible and safe
- [ ] Keep edit profile navigation unchanged

### Things to avoid
- [ ] Do not add fake membership data unless current data exists
- [ ] Do not remove profile edit
- [ ] Do not change logout logic
- [ ] Do not expose admin controls in customer profile

### Testing checklist
- [ ] Profile loads logged-in user data
- [ ] Edit profile opens correctly
- [ ] Logout returns to login/signup
- [ ] Menu rows remain tappable

---

## 10. Orders And Order Detail Redesign

### Goal
Apply the same premium style to order history and status detail without changing order logic.

### Files likely changed
- `Frontend-V1/src/screens/customer/OrdersScreen/OrdersScreen.js`
- `Frontend-V1/src/screens/customer/OrderDetailScreen/OrderDetailScreen.js`
- `Frontend-V1/src/components/OrderCard.js` if present

### Exact changes to make
- [ ] Use raised order cards
- [ ] Use semantic chips:
  - Green for delivered
  - Blue for accepted
  - Amber for packing
  - Orange for out for delivery
  - Red for cancelled
- [ ] Keep order detail fields unchanged
- [ ] Keep delivery distance/charge display from current location work
- [ ] Polish timeline/status surfaces with light 3D depth

### Things to avoid
- [ ] Do not change order status mapping
- [ ] Do not hide backend validation/error messages
- [ ] Do not recalculate order totals in the UI

### Testing checklist
- [ ] Orders list loads
- [ ] Order detail opens
- [ ] Status chips remain accurate
- [ ] Old orders without new fields still display

---

## 11. Product List And Detail Redesign

### Goal
Make product browsing visually consistent with the dashboard product cards.

### Files likely changed
- `Frontend-V1/src/screens/customer/ProductListScreen/ProductListScreen.js`
- `Frontend-V1/src/screens/customer/ProductDetailScreen/ProductDetailScreen.js`
- `Frontend-V1/src/components/ProductCard.js`
- `Frontend-V1/src/components/QuantityStepper.js`

### Exact changes to make
- [ ] Keep existing product search/filter/category behavior
- [ ] Use tactile product cards
- [ ] Keep product images clear and inspectable
- [ ] Use consistent price, discount, and availability styling
- [ ] Use dark quantity controls or raised add button
- [ ] Keep product detail add-to-cart flow unchanged

### Things to avoid
- [ ] Do not change product API query parameters
- [ ] Do not hide out-of-stock messaging
- [ ] Do not change category/product navigation params

### Testing checklist
- [ ] Search opens and filters as before
- [ ] Category products load
- [ ] Product detail opens
- [ ] Add/update quantity works

---

## 12. Checkout Screen Redesign

### Goal
Apply the new theme to checkout while preserving location-based delivery and payment flow.

### Files likely changed
- `Frontend-V1/src/screens/customer/CheckoutScreen/CheckoutScreen.js`
- `Frontend-V1/src/components/Button.js`
- `Frontend-V1/src/components/TextInputField.js`

### Exact changes to make
- [ ] Keep GPS-required delivery behavior
- [ ] Keep backend delivery fee calculation
- [ ] Style address/location surfaces as raised/inset cards
- [ ] Style bill summary like reference cart bill details
- [ ] Use green/dark 3D final order button depending on current action meaning
- [ ] Keep all loading/error/out-of-range messages visible

### Things to avoid
- [ ] Do not calculate delivery fee locally
- [ ] Do not remove manual address field
- [ ] Do not change payment method logic
- [ ] Do not bypass location validation

### Testing checklist
- [ ] Checkout requires GPS as currently designed
- [ ] Delivery fee recalculates from backend
- [ ] In-range order can be placed
- [ ] Out-of-range order is blocked
- [ ] Free delivery offer shows zero charge

---

## 13. Icons And Micro-Interactions

### Goal
Make the app feel smooth and premium without changing behavior.

### Files likely changed
- `Frontend-V1/src/components/AppIcon.js`
- `Frontend-V1/src/components/Button.js`
- `Frontend-V1/src/components/IconButton.js`
- `Frontend-V1/src/components/QuantityStepper.js`
- `Frontend-V1/src/components/PressableScale.js` if present or added as visual helper

### Exact changes to make
- [ ] Keep lucide icon meanings
- [ ] Standardize icon size and stroke
- [ ] Add button press compression
- [ ] Add card tap feedback
- [ ] Add bottom nav active movement
- [ ] Smooth skeleton shimmer
- [ ] Keep animations fast and subtle

### Things to avoid
- [ ] Do not add a new icon library unless already approved
- [ ] Do not use distracting loops
- [ ] Do not delay important actions with animation
- [ ] Do not tie animation to business logic

### Testing checklist
- [ ] Taps feel responsive
- [ ] Animations do not block navigation
- [ ] Icons remain recognizable
- [ ] Loading states stay readable

---

## 14. Responsive And Overflow Pass

### Goal
Ensure the final UI works on real phone widths without horizontal scroll.

### Files likely changed
- Theme layout files
- Screen local styles where overflow appears
- Shared card/button/input components

### Exact changes to make
- [ ] Test common widths around `360`, `390`, and `430`
- [ ] Confirm text stays inside buttons/cards/chips
- [ ] Confirm category grid fits four per row where intended
- [ ] Confirm product cards remain readable
- [ ] Confirm bottom nav and sticky cart do not overlap important actions
- [ ] Confirm keyboard states work on auth and checkout

### Things to avoid
- [ ] Do not solve overflow by hiding important content
- [ ] Do not scale font size directly with viewport width
- [ ] Do not make cards too small to tap

### Testing checklist
- [ ] No horizontal scroll on dashboard
- [ ] No clipped auth submit button
- [ ] No clipped cart quantity buttons
- [ ] No overlapping sticky cart and bottom nav
- [ ] Long names/addresses truncate cleanly

---

## 15. Implementation Order

### Recommended order
1. Review current auth state and navigation
2. Implement auth-first routing
3. Update design tokens
4. Redesign AuthScreen as first screen
5. Redesign shared buttons, inputs, cards, icons
6. Redesign Home/dashboard
7. Redesign bottom navigation
8. Redesign cart
9. Redesign profile
10. Redesign product list/detail
11. Redesign orders/order detail
12. Redesign checkout
13. Run responsive/overflow pass
14. Run final tests and graph update

### Task-by-task rule
- [ ] Complete only one task at a time
- [ ] Run focused checks after each task
- [ ] Stop and review before starting the next task
- [ ] Keep each change easy to revert if a regression appears

---

## 16. Final Verification

### Goal
Confirm the app flow and design are complete without feature regressions.

### Commands/checks
- [ ] `cd Frontend-V1 && npm run lint`
- [ ] `cd Frontend-V1 && npm test -- --runInBand`
- [ ] Start the frontend app with the current project command
- [ ] Run `graphify update .` after code changes

### Manual flow checklist
- [ ] Fresh launch shows login/signup first
- [ ] Login goes to home/dashboard
- [ ] Signup goes to home/dashboard
- [ ] Home/dashboard matches the glass/light-3D reference mood
- [ ] Categories are four per row where intended
- [ ] Add-to-cart works
- [ ] Cart opens without error
- [ ] Checkout location delivery still works
- [ ] Orders still load
- [ ] Profile still loads
- [ ] Logout returns to login/signup
- [ ] No horizontal scroll
- [ ] UI looks good on common phone widths

### Acceptance criteria
- [ ] Login/signup is the first screen for logged-out users
- [ ] Dashboard/home is shown after auth
- [ ] Existing content remains the source of truth
- [ ] Features and backend integrations remain unchanged
- [ ] Visual style clearly matches the reference mood: glass, light 3D, modern, premium, responsive
- [ ] App remains stable across auth, home, cart, checkout, orders, and profile
