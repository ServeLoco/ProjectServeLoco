# IOSWEB Bug Report

A thorough audit of `IOSWEB/` (the customer-facing React + Vite PWA). Bugs are grouped
by severity. Each item references the file and the relevant line(s).

| Severity | Meaning |
|----------|---------|
| **Critical** | Crashes, broken core flows, data loss, security issue. Must fix before release. |
| **High** | Visible feature break, incorrect behaviour, race condition. Should fix soon. |
| **Medium** | UX issue, defensive code missing, brittle logic. Fix in next pass. |
| **Low** | Style / nit. Optional. |

---

## 1. Critical

### 1.1 — `setProfile` does not exist on the auth store
- **File:** `IOSWEB/src/screens/EditProfileScreen/EditProfileScreen.jsx:17`, `:61`
- **Bug:** The screen calls `useAuthStore(state => state.setProfile)`, but
  `src/stores/authStore.js` only exposes `token`, `user`, `login`, `updateUser`,
  and `logout`. Calling `setProfile(...)` at line 61 will throw
  `TypeError: setProfile is not a function` and the user sees a generic
  "Failed to update profile" error after a successful network response.
- **Fix:** Replace `setProfile` with `updateUser` (the existing action), and pass
  the updated user object (not a partial).

### 1.2 — Functions on the persisted cart store vanish after page reload
- **File:** `IOSWEB/src/stores/cartStore.js:57-58`
- **Bug:** `getTotalItems` and `getDisplayTotal` are defined inside the store
  state. The store is wrapped in `persist` middleware which serialises the
  state to JSON in `localStorage`. Functions do not survive JSON round-trip,
  so after a page reload the rehydrated state is `{ items: [...] }` only —
  `state.getTotalItems` and `state.getDisplayTotal` are `undefined`. The very
  next render of `StickyMiniCart.jsx:21-22` and any other consumer throws
  `TypeError: state.getTotalItems is not a function`.
- **Fix:** Move these out of the store. Either:
  - Export them as plain selectors: `export const getTotalItems = (state) => state.items.reduce(...)`,
  - Or wrap in `useShallow` / compute in the component.

### 1.3 — Password reset sends the new password to the API in plain text
- **File:** `IOSWEB/src/screens/AuthScreen/AuthScreen.jsx:77-80`
- **Bug:** `authApi.requestPasswordReset({ phone, new_password: formData.password })`
  submits the *new* password to the server as part of the reset request. Even
  if the backend ignores it, this is a security smell: the password crosses
  the wire and may end up in logs. The conventional flow is a one-time
  token + setting the password on a separate confirmation step.
- **Fix:** Send only `{ phone }` and surface a server-generated reset flow,
  or use a tokenised endpoint.

### 1.4 — CheckoutScreen boots users out on refresh / cold load
- **File:** `IOSWEB/src/screens/CheckoutScreen/CheckoutScreen.jsx:47-51`
- **Bug:** The first effect runs `if (items.length === 0) navigate('/', { replace: true })`.
  On a hard refresh, `items` is hydrated asynchronously from `localStorage`
  by the `persist` middleware. On the first render `items` is the empty
  initial state `[]`, so the user is bounced to Home and loses the checkout
  page. They can navigate back only by re-adding items and re-clicking
  "Proceed to Pay".
- **Fix:** Wait for persist rehydration. `const hasHydrated = useCartStore.persist.hasHydrated()`
  (zustand v4) — gate the redirect on that. Or read from `localStorage`
  directly before the first render.

### 1.5 — `connectCustomerRealtime` can be called with a token in a way that re-creates the socket
- **File:** `IOSWEB/src/api/realtimeClient.js:78-93`
- **Bug:** `activeToken === token` is checked, but the function still falls
  through to `disconnectCustomerRealtime()` and re-issues a fresh `io(...)`
  socket on every call when tokens differ. The auth store's `login` calls
  `connectCustomerRealtime(token)` *and* `AuthScreen.handleAuthSuccess` calls
  it again, so the second call always sees a different "activeToken" for
  the very first invocation (because it was set inside the first call's
  closure). The race can disconnect-then-reconnect, dropping early events.
  Also, when `RealtimeManager` re-runs the effect on token refresh, the
  previous `unsubscribers` may double-fire if the previous socket was still
  pending teardown.
- **Fix:** Make `connectCustomerRealtime` idempotent using a single shared
  promise / ref. Ensure all `unsubscribers` are awaited before recreating.

---

## 2. High

### 2.1 — Hardcoded API host swap may corrupt query strings and ports
- **File:** `IOSWEB/src/utils/imageUtils.js:19-30`
- **Bug:** When the image URL host differs from the API host, the code
  rewrites `hostname`, `port`, *and* `protocol`. If the original URL has a
  query string (e.g. signed S3 URLs), the host rewrite leaves the query
  intact — fine. But when the API base is `https://api.foo.com:8443/api`
  and the image is `https://cdn.foo.com/img?w=200`, the result is
  `https://api.foo.com:8443/img?w=200`. The CDN's path/query was tied to
  the CDN origin and may 404.
- **Fix:** Only swap the host *if* the path is a relative-style upload path.
  Otherwise, return the original URL.

### 2.2 — `ProductListScreen` can enter an infinite re-fetch loop
- **File:** `IOSWEB/src/screens/ProductListScreen/ProductListScreen.jsx:57-101`
- **Bug:** `loadProducts` is a `useCallback` whose deps include
  `searchParams` and `setSearchParams`. Inside, it calls
  `setSearchParams(newParams, { replace: true })` even when the params
  haven't changed. If `activeCategory` and `searchQuery` change in ways
  that happen to produce the *same* `newParams` as the current
  `searchParams`, the React Router updater short-circuits and there is no
  loop. But if the activeCategory is a numeric `id` (`"5"`) and the URL
  has `?categoryId=5` and the code re-sets it to `"5"`, this is stable.
  However: if the URL *was* empty but the screen seeded
  `activeCategory = ''` and a user types, the call sets `search=...`. On
  the next render `searchParams` is a new object, `loadProducts` is
  recreated, the effect re-runs, debounce fires, `loadProducts` runs and
  re-sets identical params, etc. In practice this currently short-circuits
  but the dependency surface is brittle. A change in `URLSearchParams`
  serialisation (e.g. percent-encoding of spaces) would break the
  short-circuit and loop forever.
- **Fix:** Drop `searchParams` from the `useCallback` deps. Read it from a
  ref or only at submit time. Set `searchParams` in a `useEffect` keyed on
  `[activeCategory, searchQuery]`, separate from the load effect.

### 2.3 — Order placement is not retried-safe
- **File:** `IOSWEB/src/screens/CheckoutScreen/CheckoutScreen.jsx:109-160`
- **Bug:** On success, `clearCart()` is called and the user is navigated
  to `/order-confirmation/:id`. If `navigate` throws (e.g. in StrictMode
  double-render, or a transient unmount), `clearCart()` has already run and
  the user loses the cart without an order confirmation. On failure, the
  catch re-enables the button, but `isSubmitting.current` is set back to
  `false`. Meanwhile the previous "place order" request may still be
  in-flight on a slow network. The user can double-click the same button
  if `placing` is reset prematurely — though `placing` does remain true
  in state.
- **Fix:** Navigate *before* clearing the cart (using a server-confirmed
  `order_id`), or defer `clearCart()` until after navigation has succeeded.
  Add a request-id dedupe on the backend.

### 2.4 — `useEffect` in `AuthScreen` causes login form flicker
- **File:** `IOSWEB/src/screens/AuthScreen/AuthScreen.jsx:16-20`
- **Bug:** When a logged-in user opens `/auth`, the effect runs after the
  first paint and immediately navigates to `/`. For one frame the login
  form is shown before redirect, which on a cold load flashes a wrong
  screen. Also, if `token` changes after submit, the same effect will
  re-fire and re-navigate, which is desired but uses the dependency
  correctly — except that any concurrent `setMode` calls are clobbered.
- **Fix:** Read the token from storage synchronously on mount and decide
  *before* the first render whether to render the form. Use a state init
  function: `useState(() => getToken() ? 'redirect' : 'login')`.

### 2.5 — `StickyMiniCart` and `BottomNav` selectors return a new value every render
- **File:** `IOSWEB/src/components/StickyMiniCart.jsx:21-22`
- **Bug:** `useCartStore((state) => state.getTotalItems())` runs the
  function inside the selector. Zustand compares the result of the
  selector with the previous one with `Object.is`. The result *is* a
  primitive, so re-renders happen only when the count changes. But the
  selector itself is a new function on every render, and the function
  also calls `get()` — which is fine, but a memoised
  `useCartStore((state) => state.items.length)` style would be cheaper
  and not depend on the `getTotalItems` function existing.
- **Fix:** Use `useCartStore((state) => state.items.reduce(...))` inline
  in the component, or move derived state out of the store (see 1.2).

### 2.6 — `OrderDetailScreen` does not refetch when realtime update arrives
- **File:** `IOSWEB/src/screens/OrderDetailScreen/OrderDetailScreen.jsx:40-53`
- **Bug:** The realtime handler does a shallow merge of
  `{ status, payment_status }` into local state. If the backend pushes
  additional fields (e.g. `delivered_at`, `cancelled_reason`,
  `payment_method`), they are *not* merged. The detail screen will
  show stale data.
- **Fix:** When an update event arrives, refetch the order via
  `ordersApi.getOrder(id)` instead of trusting the partial payload.

### 2.7 — `OrdersScreen` likewise only merges 2 fields
- **File:** `IOSWEB/src/screens/OrdersScreen/OrdersScreen.jsx:40-53`
- **Bug:** Same pattern as 2.6 but for the orders list. Updates like
  `total_amount`, `items`, `delivery_type` will not be reflected.
- **Fix:** Refetch on realtime events, or merge *all* keys from
  `payload` defensively.

### 2.8 — Notifications mark-all-read is fire-and-forget and may 401-loop
- **File:** `IOSWEB/src/screens/NotificationsScreen/NotificationsScreen.jsx:36-39`
- **Bug:** After fetching the list, the screen calls
  `notificationsApi.markAllRead()` and `fetchUnreadCount()`. If
  `markAllRead` 401s (expired token), the user sees a partially rendered
  list. More importantly, the call has no error handling and the catch
  block only catches the *fetch*, not the markAllRead call, so an
  unhandled promise rejection is raised.
- **Fix:** Wrap the markAllRead call in a try/catch. Skip if the token is
  missing or expired.

---

## 3. Medium

### 3.1 — `CategoryChip` button has no explicit `type="button"`
- **File:** `IOSWEB/src/components/CategoryChip.jsx:4-12`
- **Bug:** Default `<button>` type inside a `<form>` is `submit`. If this
  chip is ever rendered inside a form it will submit the form. The current
  screens don't have it inside a form, so latent bug.
- **Fix:** Add `type="button"`.

### 3.2 — `BottomNav` `NavLink` is missing `end` on non-home routes
- **File:** `IOSWEB/src/components/BottomNav.jsx:23-53`
- **Bug:** `<NavLink to="/">` uses `end`, so the Home icon only highlights
  on exact `/`. `/orders` highlights on both `/orders` and `/orders/:id`,
  which is desired. But `/profile` highlights on both `/profile` and
  `/profile/edit`, which may be intentional. The inconsistency means
  the active pill behaviour differs between tabs. Not a crash, but
  inconsistent UX.
- **Fix:** Document the desired behaviour; either add `end` to all or
  none.

### 3.3 — `ProfileScreen` returns `null` if no user, but `BottomNav` still renders
- **File:** `IOSWEB/src/screens/ProfileScreen/ProfileScreen.jsx:48`
- **Bug:** `if (!user) return null;` short-circuits *before* `<BottomNav/>`
  is rendered. The bottom nav disappears for unauthenticated users who
  somehow reach this screen. Other screens (Home, Categories, Orders)
  render the nav regardless.
- **Fix:** Move the early return after the nav. Or guard the entire
  screen with `AuthGuard` in `App.jsx` (which is already done at line 38
  in `App.jsx`), so the screen is unreachable without a user. The
  current defensive check is a no-op in practice but masks layout
  differences.

### 3.4 — `CheckoutScreen` `setCalculateError` stores the Error object in state
- **File:** `IOSWEB/src/screens/CheckoutScreen/CheckoutScreen.jsx:78`
- **Bug:** `setCalculateError(err)` stores the raw `Error` instance in
  React state. React DevTools will serialise this poorly and React 19
  may emit a console warning about non-serialisable state. The variable
  is never read, so it's dead code anyway.
- **Fix:** Remove the state, or store only `err.message`.

### 3.5 — `getResolvedImageUrl` returns host-rewritten URLs even for absolute external URLs
- **File:** `IOSWEB/src/utils/imageUtils.js:24-30`
- **Bug:** If an admin uploads an external CDN URL (e.g. a Shopify CDN)
  through some path, the host will be force-rewritten to the API host,
  producing broken images. The intent was to fix hardcoded
  `PUBLIC_BASE_URL` in the backend, but the heuristic is too broad.
- **Fix:** Only rewrite the host if the URL pathname starts with
  `/uploads/` (or matches the backend upload prefix). Leave external
  URLs alone.

### 3.6 — `formatPrice` swallows `undefined` to `0` silently
- **File:** `IOSWEB/src/utils/formatters.js:1-4`
- **Bug:** `isNaN(price) || price === null` returns `'₹0'` for
  `undefined` and any non-numeric value. If the backend sends a missing
  price field, the user sees `₹0` rather than "Price unavailable".
- **Fix:** Distinguish between `null`/`undefined` and a real `0`. Return
  `''` or a "—" for missing.

### 3.7 — `timeAgo` returns nonsense for future dates
- **File:** `IOSWEB/src/utils/formatters.js:18-34`
- **Bug:** If the server's clock is ahead of the client's,
  `(new Date() - date) / 1000` is negative. All branches fail, and the
  function returns `'Just now'`. Better, but if the server is *behind*
  (date is a year ahead), it returns `'-1 years ago'` or
  `'NaN years ago'`.
- **Fix:** Guard with `if (seconds < 0) return 'Just now';` and
  `if (!isFinite(seconds)) return '';`.

### 3.8 — `AddToHomePrompt` localStorage key is never cleared on logout
- **File:** `IOSWEB/src/components/AddToHomePrompt.jsx:11-22`
- **Bug:** Once a user dismisses the prompt, `ath-dismissed = true` is
  persisted. If the user logs out, switches accounts, and is on a
  different iOS device, the prompt never re-appears. Worse: it's
  never reset when the user actually installs the PWA, so on a
  reinstall they may still see the prompt.
- **Fix:** Clear the flag on logout and on `appinstalled` event.

### 3.9 — `RealtimeManager` requests Notification permission unconditionally on mount
- **File:** `IOSWEB/src/components/RealtimeManager.jsx:16-20`
- **Bug:** The permission prompt is requested on first mount regardless
  of whether the user is logged in. For a guest browsing, this is
  intrusive. Once dismissed/denied, browsers won't ask again, so the
  prompt is wasted.
- **Fix:** Gate on `token` and on `isStandalone()`.

### 3.10 — `ProductCard` `available` check uses `===` comparisons
- **File:** `IOSWEB/src/components/ProductCard.jsx:88`
- **Bug:** `disabled={... || (item.available === false) || (item.available === 0)}`
  treats `undefined` as available. If the backend returns
  `available: null` (e.g. for combos), the button is enabled when it
  may not be.
- **Fix:** Use `item.available === false || item.available === 0 ||
  item.available === null`.

### 3.11 — `CheckoutScreen` fast-delivery fallback resets silently without informing user
- **File:** `IOSWEB/src/screens/CheckoutScreen/CheckoutScreen.jsx:72-75`
- **Bug:** If the user picks Express and the backend reports it's
  disabled, the code sets `deliveryType` back to `'standard'`. The
  user gets no feedback. The radio button visually flips to Standard
  with no explanation.
- **Fix:** Show a toast or inline note: "Express isn't available for
  your area".

### 3.12 — `EditProfileScreen` sends duplicate fields to the API
- **File:** `IOSWEB/src/screens/EditProfileScreen/EditProfileScreen.jsx:51-58`
- **Bug:** The request body contains both `name` and `fullName`,
  `whatsapp` and `whatsappNumber`, `address` and `deliveryAddress`. The
  backend may reject unknown fields (some Express-validator setups
  return 400), or pick the wrong one. This is also a maintenance hazard.
- **Fix:** Send only the fields the API expects (verify with backend).

### 3.13 — `imageUtils` PLACEHOLDER isn't used consistently
- **File:** `IOSWEB/src/screens/CartScreen/CartScreen.jsx:99-103`
- **Bug:** The cart uses a hardcoded `/placeholder.png` for missing
  images, while `getResolvedImageUrl` returns an inline SVG placeholder.
  The cart shows a broken image icon if `/placeholder.png` is not
  served from `public/`.
- **Fix:** Use `getResolvedImageUrl` in the cart too. Or, add
  `placeholder.png` to `public/`.

### 3.14 — `ProductListScreen` "Load More" uses `length === 20` as the heuristic
- **File:** `IOSWEB/src/screens/ProductListScreen/ProductListScreen.jsx:76`
- **Bug:** `setHasMore(newProducts.length === 20)` assumes the page
  size is always 20 and the last page is always < 20. If the backend
  caps at exactly 20 on the last page, the user is offered a Load More
  button that returns 0 items.
- **Fix:** Use a server-provided `has_more` / `nextPage` field instead.

### 3.15 — `apiClient` swallows axios response unwrap errors
- **File:** `IOSWEB/src/api/client.js:19-29`
- **Bug:** The interceptor returns `response.data` directly, so every
  caller does `res.data || res`. This is a code smell and the pattern
  is repeated in 8+ files. It hides the difference between "the
  server returned a JSON envelope" and "the interceptor unwrapped it".
- **Fix:** Pick one: either keep the interceptor returning `response`
  and have callers do `res.data`, or remove the `res.data || res`
  defensive code.

### 3.16 — `App.jsx` falls through to `/` on any unknown route
- **File:** `IOSWEB/src/App.jsx:52`
- **Bug:** `<Route path="*" element={<Navigate to="/" replace />} />`
  redirects 404s to the home page. For a SPA, a real 404 page is
  clearer and helps with debugging.
- **Fix:** Add a `NotFoundScreen` and route to it.

### 3.17 — `AuthScreen` has no debounce on the submit button
- **File:** `IOSWEB/src/screens/AuthScreen/AuthScreen.jsx:45-89`
- **Bug:** A double-tap on the submit button before `setLoading(true)`
  is applied can fire two requests. The `loading` guard helps but only
  after the first re-render.
- **Fix:** Use a ref-based guard or rely on the button's `disabled`
  attribute (which is set via `loading`).

### 3.18 — `HomeScreen` `storeType` initial value is hardcoded to `'fast_food'`
- **File:** `IOSWEB/src/screens/HomeScreen/HomeScreen.jsx:38`
- **Bug:** When a user lands on Home, they always see Fast Food. If
  the shop only sells Packed Items at that moment, the first paint
  shows an empty dashboard. There's no persistence of the user's
  preferred tab.
- **Fix:** Read from `localStorage` or query string on mount.

### 3.19 — `CartScreen` uses `placeholder.png` but `index.html` has no fallback
- **File:** `IOSWEB/src/screens/CartScreen/CartScreen.jsx:99-103`,
  `IOSWEB/index.html`
- **Bug:** `/placeholder.png` is referenced but never declared in
  `public/`. The image returns 404. The `getResolvedImageUrl` utility
  does have a `PLACEHOLDER` SVG, but the cart bypasses it.
- **Fix:** Use `getResolvedImageUrl` (see 3.13).

### 3.20 — `useEffect` debounce timer is created in render scope
- **File:** `IOSWEB/src/screens/ProductListScreen/ProductListScreen.jsx:95-101`
- **Bug:** `useEffect` runs after every render where deps change. The
  inner `setTimeout` is created with the captured `loadProducts`
  reference. The cleanup clears it. This is correct, but the
  `useCallback` deps include `loadProducts`, so any change in
  `searchParams` creates a new `loadProducts` and a new timer, which
  is fine — except the `loadProducts` function itself calls
  `setSearchParams`, which can re-trigger the effect.
- **Fix:** Decouple the URL-update effect from the load effect. Or
  use a ref for the latest `loadProducts`.

---

## 4. Low

### 4.1 — `EmptyState` icon prop is rendered without a `key`
- **File:** `IOSWEB/src/components/EmptyState.jsx:7`
- **Bug:** When a parent passes a new icon element on every render, the
  `key` is the same. No actual bug, but `EmptyState` is sometimes
  wrapped in parent `<></>` with implicit keys.
- **Fix:** Add a stable `key` for list rendering.

### 4.2 — `BottomNav` `navClass` arrow function recreated every render
- **File:** `IOSWEB/src/components/BottomNav.jsx:21`
- **Bug:** Trivial. Re-renders are cheap; the function is recreated.
- **Fix:** Move it outside the component.

### 4.3 — `notificationsApi` `getUnreadCount` response shape is fragile
- **File:** `IOSWEB/src/stores/notificationStore.js:13`
- **Bug:** `payload.unreadCount ?? payload.count ?? payload ?? 0`
  falls back to the entire payload if it's a number. If the backend
  ever returns `null`, the unread count becomes `null`.
- **Fix:** Type-check: `typeof payload === 'number' ? payload : 0`.

### 4.4 — `addToHomePrompt` `setShow(true)` after 3s — race with unmount
- **File:** `IOSWEB/src/components/AddToHomePrompt.jsx:14`
- **Bug:** If the user navigates away within 3s, the timer fires after
  unmount and `setShow(true)` runs on an unmounted component. React 19
  warns about this in strict mode.
- **Fix:** Track unmounted state in a ref.

### 4.5 — `RealtimeManager` listens to `order.created` but never uses the payload
- **File:** `IOSWEB/src/components/RealtimeManager.jsx:44-49`
- **Bug:** `subscribeOrderEvents` re-fetches the unread count for *all*
  order events, including `order.created`, `order.cancelled`, etc.
  Wasteful: when a new order arrives for the user, the unread count
  might not even change (it's the same user).
- **Fix:** Only call `fetchUnreadCount` on `order.cancelled` and
  `order.updated` events.

### 4.6 — `CategoryCard` uses `loading="lazy"` without width/height
- **File:** `IOSWEB/src/components/CategoryCard.jsx:19`
- **Bug:** Lazy-loaded images with no explicit dimensions cause layout
  shift. Add `width` and `height` (or aspect-ratio CSS) to prevent
  CLS.
- **Fix:** Add `aspect-ratio: 1` to `.category-img-wrapper`.

### 4.7 — Inline `style={{ boxShadow: ... }}` in CategoriesScreen
- **File:** `IOSWEB/src/screens/CategoriesScreen/CategoriesScreen.jsx:30`
- **Bug:** `style` overrides the CSS class. The `--shadow-sm` variable
  is used in the CSS file, but the inline style may not respect CSS
  variables in all browsers (older Safari). Move to the CSS file.
- **Fix:** Move the style to `CategoriesScreen.css`.

### 4.8 — `BottomNav` icons have no `aria-label` or `aria-hidden`
- **File:** `IOSWEB/src/components/BottomNav.jsx:5-19`
- **Bug:** Decorative SVGs without `aria-hidden` are read by screen
  readers.
- **Fix:** Add `aria-hidden="true"` to the SVGs and a `title` element
  to the parent `<NavLink>` for accessibility.

### 4.9 — `useEffect` in `AuthScreen` depends on `navigate`
- **File:** `IOSWEB/src/screens/AuthScreen/AuthScreen.jsx:20`
- **Bug:** `navigate` is stable in react-router-dom v6+ but eslint
  exhaustive-deps may still warn. Minor.
- **Fix:** Remove `navigate` from deps or add an eslint-disable.

### 4.10 — `vite.config.js` PWA workbox glob excludes `json` and other assets
- **File:** `IOSWEB/vite.config.js:12`
- **Bug:** `globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}']` does
  not include `json`, `woff`, `woff2`, or `ttf` — font assets won't
  be precached.
- **Fix:** Add `woff` and `woff2` to the glob.

### 4.11 — `getRealtimeBaseUrl` is module-level and reads env once
- **File:** `IOSWEB/src/api/realtimeClient.js:4-5`
- **Bug:** The base URL is read at module import time. If `VITE_API_URL`
  changes between builds (e.g. in a storybook or test environment),
  the change is not picked up.
- **Fix:** Read inside the function.

### 4.12 — `BottomNav` does not highlight for `/categories`
- **File:** `IOSWEB/src/components/BottomNav.jsx:23-53`
- **Bug:** The Categories tab is not in the bottom nav at all, even
  though the route exists. Users must access it from the Home screen
  or directly via URL.
- **Fix:** Add a Categories tab to the bottom nav (or remove the
  route if it shouldn't be a top-level screen).

### 4.13 — `RealtimeManager` console logs on every connect/disconnect
- **File:** `IOSWEB/src/api/realtimeClient.js:74-75`
- **Bug:** Noisy logs in production. Use a debug flag.
- **Fix:** Gate behind `if (import.meta.env.DEV)`.

### 4.14 — `OrderConfirmationScreen` history hack may break iOS Safari PWA
- **File:** `IOSWEB/src/screens/OrderConfirmationScreen/OrderConfirmationScreen.jsx:17-24`
- **Bug:** `window.history.pushState` on a confirmation screen can
  interact badly with iOS Safari's PWA swipe-back gesture.
- **Fix:** Use react-router's `<Navigate replace>` instead, or set
  state on the route.

### 4.15 — `CheckoutScreen` uses `alert()` for all error messages
- **File:** `IOSWEB/src/screens/CheckoutScreen/CheckoutScreen.jsx:92, 103, 112, 116, 124, 155`
- **Bug:** Native `alert` is jarring and not stylable. In a PWA, an
  inline toast is preferred.
- **Fix:** Replace `alert` with a toast component.

### 4.16 — `imageUtils` PLACEHOLDER SVG is repeated 5 times in similar components
- **File:** `IOSWEB/src/utils/imageUtils.js:4-6`
- **Bug:** The placeholder is only used in `imageUtils`. Other
  components (Cart, Profile, etc.) don't use it. Inconsistent.
- **Fix:** Standardise on `getResolvedImageUrl` for all images.

### 4.17 — `RealtimeManager` `popstate` listener in `OrderConfirmationScreen`
  can fire on hash change
- **File:** `IOSWEB/src/screens/OrderConfirmationScreen/OrderConfirmationScreen.jsx:18-23`
- **Bug:** Listening only to `popstate` may miss iOS Safari's edge
  swipe.
- **Fix:** Use a navigation blocker library or `useBlocker` from
  react-router.

### 4.18 — `Button` component has no `loading` prop
- **File:** `IOSWEB/src/components/Button.jsx:4-25`
- **Bug:** Buttons that need a spinner during async work (Auth
  Submit, Place Order, etc.) have to write their own "Loading..."
  text. Inconsistent.
- **Fix:** Add `loading` and `loadingText` props.

### 4.19 — `ProductListScreen` `activeCategory` is `String` everywhere
- **File:** `IOSWEB/src/screens/ProductListScreen/ProductListScreen.jsx:36, 108, 140-141`
- **Bug:** Consistent within the file, but the searchParams round-trip
  is implicit. If a category id is `'12'`, the URL has `?categoryId=12`
  and `setSearchParams` writes it back unchanged. But the initial
  read from `searchParams.get('categoryId')` returns a string. No
  bug; brittle.
- **Fix:** Centralise in a `useQueryParam` hook.

### 4.20 — `OrderDetailScreen` re-subscribes to socket on every `id` change but doesn't re-fetch
- **File:** `IOSWEB/src/screens/OrderDetailScreen/OrderDetailScreen.jsx:25-56`
- **Bug:** When the user navigates from `/order/1` to `/order/2`, the
  effect re-runs and re-fetches. OK. But the previous socket
  subscription is unsubscribed. If the previous order was being
  tracked, the unsubscribe happens correctly. No bug, but the effect
  has a missing dep `navigate`.
- **Fix:** Add `navigate` to deps or remove it (it's stable).

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 5 |
| High     | 8 |
| Medium   | 20 |
| Low      | 20 |
| **Total** | **53** |

**Top 5 to fix first:**
1. `setProfile` does not exist on the auth store (1.1) — broken profile update
2. Persisted cart store functions vanish after reload (1.2) — broken mini-cart
3. Plain-text password in reset request (1.3) — security
4. CheckoutScreen boots users out on refresh (1.4) — broken checkout
5. Duplicate fields in EditProfile request body (3.12) — backend 400s likely
