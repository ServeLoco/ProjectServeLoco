# Final Issues — Frontend & Admin Audit

Audit pass over `Frontend-V1/` (customer React Native app) and `adminManager-V1/` (admin web app). Each issue has severity, file:line, what the user sees, and a suggested fix. Findings are NOT fixed yet — list is for review.

Severity legend: **Critical** = breaks core flow / data loss / double-billing. **High** = visible bug or wrong behavior in normal flow. **Medium** = edge-case bug or UX confusion. **Low** = cosmetic / wasteful but not broken.

---

## Frontend-V1 (Customer App)

### Critical

#### F-C1. Profile → "My Orders" navigates to a non-existent route
- **File**: `src/screens/customer/ProfileScreen/ProfileScreen.js:168`
- **Issue**: `navigation.navigate('Orders')` — `Orders` is a tab inside `MainTabs`, not a stack route.
- **Impact**: Tapping "My Orders" from Profile throws "action NAVIGATE not handled" or does nothing.
- **Fix**: `navigation.navigate('MainTabs', { screen: 'Orders' })`.

#### F-C2. Place Order can be double-submitted (creates two orders)
- **File**: `src/screens/customer/CheckoutScreen/CheckoutScreen.js` `handlePlaceOrder` (~line 264)
- **Issue**: Only `isSubmitting` state guards re-entry. React state is async — a fast double-tap fires `handlePlaceOrder` twice before `setIsSubmitting(true)` propagates.
- **Impact**: Customer gets charged / receives two orders.
- **Fix**: Use a `useRef` (`isSubmittingRef.current`) and bail at the top of the handler.

#### F-C3. `clearCart()` runs before navigation reset in checkout
- **File**: `CheckoutScreen.js` (around lines 318–327)
- **Issue**: Cart is cleared first, then `navigation.dispatch(reset(...))`. If the reset throws synchronously, cart is gone but user is still on Checkout with an empty cart.
- **Fix**: Reset navigation first, clear cart inside `InteractionManager.runAfterInteractions` or after navigation success.

#### F-C4. `OrderConfirmationScreen` renders "undefined" and navigates to a broken Detail screen when params are missing
- **File**: `src/screens/customer/OrderConfirmationScreen/OrderConfirmationScreen.js:17`
- **Issue**: `normalizeOrder({})` returns `id: "undefined"` (via `String(undefined)` in `apiMappers.js`). Screen displays `Order #undefined` and the 3-second redirect navigates to `OrderDetail` with `orderId = "undefined"` → 404.
- **Fix**: Guard `route.params?.order`/`orderId` before rendering; show an error/empty state and route back to Orders if missing.

#### F-C5. Cart persists across user sessions on the same device
- **File**: `src/stores/useCartStore.js` `clearCart` (line 71) + `useAuthStore.js` logout/setSession
- **Issue**: `clearCart` only resets `items`. On `setSession` for a new user, previous user's cart persists in AsyncStorage.
- **Impact**: User A logs out → User B logs in on same device → sees User A's cart.
- **Fix**: Clear cart on `setSession` (and on `logout`), OR namespace the persisted cart key by user id.

### High

#### F-H1. `FadeInItem` declared inside `OrdersScreen` body — remounts every row each render
- **File**: `src/screens/customer/OrdersScreen/OrdersScreen.js:238–334`
- **Impact**: Every order card unmounts/remounts on filter changes, realtime patches, refresh. Animation flicker, perf jank.
- **Fix**: Move `FadeInItem` outside the `OrdersScreen` function.

#### F-H2. Cart store mutates state in place (`addItem`, `addCombo`)
- **File**: `src/stores/useCartStore.js:14–25` and addCombo (~33)
- **Issue**: `updatedItems[i].quantity = ...` mutates the existing object; only the array is shallow-copied.
- **Impact**: Reference-equality selectors don't re-render; intermittent stale UI for cart badges/totals.
- **Fix**: `updatedItems[i] = { ...updatedItems[i], quantity: ... }`.

#### F-H3. `displayTotal`/cart totals can become `NaN`
- **File**: `useCartStore.js:78–80`
- **Issue**: `item.product.price * item.quantity` with no `Number(...)` coercion. Persisted legacy carts may have `price` as a string or undefined.
- **Impact**: Mini cart badge and total display `NaN` / `₹NaN`.
- **Fix**: `Number(item.product?.price) || 0`.

#### F-H4. `String(undefined)` becomes the literal string `"undefined"` for missing IDs
- **File**: `src/utils/apiMappers.js:109` (items), 137 (categories), 202 (profile), 265 (orders)
- **Issue**: `String(pickFirst(undefined, undefined, …))` returns `"undefined"`.
- **Impact**: UI displays literal text `"undefined"`. Equality checks (`item.id === productId`) silently collide between unrelated items, causing duplicates/wrong matches.
- **Fix**: Guard `pickFirst` result before stringifying; return `null` if undefined.

#### F-H5. Persisted cart has no schema/version migration
- **File**: `useCartStore.js` (whole file)
- **Issue**: Cart is persisted to AsyncStorage with no version field. Legacy items may have undefined `product.id`, stale `price`, missing `type`.
- **Impact**: After app upgrade, ghost items show wrong prices, backend `cart/calculate` rejects them, UI breaks.
- **Fix**: Add a persist `version` + migration that drops/repairs invalid entries.

#### F-H6. Silent failure on order cancel from `OrderDetailScreen`
- **File**: `src/screens/customer/OrderDetailScreen/OrderDetailScreen.js:201–221`
- **Issue**: `.finally(setIsCancelling(false))` but no `.catch`. If cancel API throws, modal stays open, `isCancelling` flag is reset but the user gets no error feedback and no way to retry.
- **Fix**: Add `.catch` that surfaces error and closes modal.

#### F-H7. Cancel failure on `OrdersScreen` blows away the whole list
- **File**: `src/screens/customer/OrdersScreen/OrdersScreen.js:214–231`
- **Issue**: `.catch(() => setIsError(true))` triggers full-screen error state. A single cancel failure wipes the list rendering.
- **Fix**: Per-row error or transient toast; keep the list.

#### F-H8. Bell-shake interval & continuous `Animated.loop`s never pause when screen blurs
- **File**: `src/screens/customer/HomeScreen.js:221–262`, plus CheckoutScreen arrow/gpsPulse, OrdersScreen glow, etc.
- **Impact**: Battery drain; React Native animations keep running when screen is off-focus.
- **Fix**: Use `useFocusEffect` to start/stop loops.

#### F-H9. `HomeScreen` `loadHomeData` setTimeout cleanup race
- **File**: `HomeScreen.js:155–165`
- **Issue**: `cleanupLoad` is set from inside a `setTimeout(0)`. If deps change before the timer fires, cleanup is `undefined` and the in-flight fetch's `isMounted` flag is never reset.
- **Impact**: Stale `setState` on unmounted component, or older response overwriting newer data.
- **Fix**: Drop the `setTimeout(0)` indirection; or use a stable `useRef` flag instead.



#### F-H11. No debounce on Checkout bill recalculation
- **File**: `CheckoutScreen.js:177–212`
- **Issue**: Every change to `coordinates`/`deliveryType` fires a new `cart/calculate` immediately. The `isActive` flag guards stale writes, but multiple parallel network requests fire.
- **Fix**: Debounce 250–300 ms like CartScreen does.

### Medium

#### F-M1. `EditProfileScreen` `setTimeout(goBack, 800)` not cancelled on unmount
- **File**: `EditProfileScreen.js:80–107`
- **Impact**: User backs out manually within 800 ms → `goBack` fires again, pops past the intended screen.
- **Fix**: Track ref, clear on unmount.

#### F-M2. `OrderDetailScreen` notification permission modal timer not cleared
- **File**: `OrderDetailScreen.js:121–145`
- **Issue**: `setTimeout(showModal, 2000)` runs; if user navigates away before 2 s, modal pops up on the new screen.
- **Fix**: Track timer ref, clear in cleanup.

#### F-M3. `OrderConfirmationScreen` BackHandler + 3-second auto-redirect can both navigate
- **File**: `OrderConfirmationScreen.js:46–84`
- **Issue**: BackHandler `replace`s to MainTabs and returns true, but the `redirectTimer` for `OrderDetail` may still be live in some race orderings.
- **Fix**: Clear `redirectTimer` inside BackHandler before calling replace.

#### F-M4. Order line item display may be doubled
- **File**: `OrderDetailScreen.js:350` shows `₹{item.price * item.quantity}`
- **Issue**: `apiMappers.js:235` maps `unit_price`, `unitPrice`, or `line_total` into `price`. If backend returned `line_total` (already qty-multiplied), the multiplication here doubles it.
- **Fix**: Always normalize to unit price client-side, and use a separate `lineTotal` field for the display.

#### F-M5. `AuthScreen` switching between Login/Reset Password keeps typed password in field
- **File**: `AuthScreen.js:200–207`
- **Issue**: `switchMode` clears some fields but leaves the password the user typed for login — that text is then re-used as "new password" on the reset flow.
- **Impact**: Confusing and potentially insecure.
- **Fix**: Clear `password`/`confirmPassword` on every mode switch.

#### F-M6. `NotificationsScreen` marks-all-read silently on every mount
- **File**: `NotificationsScreen.js:46–63`
- **Issue**: If `markAllRead` API errors, the local state still marks read; server/client desync.
- **Fix**: Mark optimistically AFTER server ack, or surface the error.

#### F-M7. Currency prefix inconsistent
- **File**: `OrdersScreen.js:404` uses `Rs. {item.total}` while everywhere else uses `₹`.
- **Fix**: Standardize on `₹`.

#### F-M8. Cart store `addItem` does loose id matching
- **File**: `useCartStore.js` + Home/ProductDetail flows
- **Issue**: Products bypassing `apiMappers` may have a numeric id, while normalized products have a string id. `===` comparison fails to find the existing line → duplicate cart entries with different id types.
- **Fix**: Always coerce `String(product.id)` before comparing/inserting.

### Low

#### F-L1. `getQty` excludes combos with `i.type !== 'combo'` — legacy items without `type` field may collide
- **File**: `HomeScreen.js:288–291`
- **Fix**: Treat missing `type` as `'product'` explicitly.

#### F-L2. `CartScreen` "Start Shopping" empty-state navigation leaves Cart in stack
- **File**: `CartScreen.js:135–146`
- **Impact**: Back button returns to empty cart.
- **Fix**: `popToTop()` or `reset` to Home.

#### F-L3. `OrderDetailScreen` Retry button replaces the route instead of refetching
- **File**: `OrderDetailScreen.js:270`
- **Fix**: Call `loadOrder()` directly.

#### F-L4. `useSettingsStore._lastFetched` not updated when `setSettings({upiQrImageUrl})` is called
- **File**: `useSettingsStore.js:5` + `CheckoutScreen.js:107–125`
- **Issue**: Calling `setSettings` doesn't bump `_lastFetched`; TTL logic stays stuck.
- **Fix**: Move `_lastFetched: Date.now()` into `setSettings`, or always call `markFetched()` alongside.

#### F-L5. Offer auto-rotate interval recreated unnecessarily
- **File**: `HomeScreen.js:691`
- **Issue**: Deps `[visibleOffers.length]` resets the carousel interval whenever the list shape changes.
- **Fix**: Use a ref-based timer or stable length value.

---

## adminManager-V1 (Admin Panel)

### Critical

#### A-C1. 401 from any request hard-reloads to /login, losing unsaved form state
- **File**: `src/api/client.js:45–48`
- **Issue**: `window.location.href = '/login'` runs on every 401.
- **Impact**: Admin mid-edit of product/combo/settings loses all unsaved changes without warning when token expires.
- **Fix**: Use React Router navigation + a "session expired" modal; preserve form state via context or sessionStorage.

#### A-C2. Bulk operations swallow per-item failures (Promise.all)
- **File**: `src/pages/Products.jsx:106–132`, `Combos.jsx:101–127`
- **Issue**: `Promise.all` rejects on the first failure; successful items are not reported. Admin sees only `GENERIC_ERROR`.
- **Impact**: Bulk delete of 20 items partially succeeds; admin can't tell which still exist. Inventory chaos.
- **Fix**: `Promise.allSettled`, then show a list of succeeded/failed ids with reasons.

#### A-C3. Order status `<select>` race with concurrent admins / realtime updates
- **File**: `src/pages/Orders.jsx:236–270`
- **Issue**: If realtime updates `selectedOrder.status` while the dropdown is open, admin can submit a PATCH for a status that's already changed underneath.
- **Impact**: One admin's "Delivered" silently overrides another admin's "Cancelled".
- **Fix**: Use a pendingStatus state, detect `updated_at` drift, or use If-Match/optimistic locking on the API.

#### A-C4. Categories `toggleActive` PUTs without `description` → wipes saved description
- **File**: `src/pages/Categories.jsx:51–68`
- **Issue**: Only name/slug/type/imageId/active/displayOrder are sent. Backend uses PUT semantics.
- **Impact**: Toggling active state silently erases the category description.
- **Fix**: Send the complete category object, or move backend to PATCH semantics.

### High

#### A-H1. Settings save merges response over DEFAULT_SETTINGS, blanking fields the backend didn't echo
- **File**: `src/pages/Settings.jsx:128–131`
- **Issue**: `setSettings({ ...DEFAULT_SETTINGS, ...response.data })`. If response omits a field (e.g. `whatsapp_number`), the UI shows blank.
- **Impact**: Admin saves, then watches fields revert to empty; may save again and overwrite real data with blanks.
- **Fix**: Merge over current state instead: `{ ...settings, ...response.data }`.

#### A-H2. `below_threshold_delivery_charge` missing from DEFAULT_SETTINGS but validated on save
- **File**: `Settings.jsx:7–26, :102, :213`
- **Issue**: Validation iterates over the field; if backend hasn't returned it yet, `Number(undefined)` is `NaN` and validation fails.
- **Impact**: Save button never works on a fresh install.
- **Fix**: Add `below_threshold_delivery_charge: 20` (or 0) to DEFAULT_SETTINGS.

#### A-H3. Settings night-charge time validation missing
- **File**: `Settings.jsx:239–245`
- **Issue**: Admin can set `night_charge > 0` while leaving start/end blank; or set inverted times without warning. Backend overnight-wrap is implicit.
- **Impact**: Pricing silently off — customers either always charged or never charged at night.
- **Fix**: Require both times when `night_charge > 0`; show a hint about overnight wrap.

#### A-H4. Orders search input fires a fetch on every keystroke
- **File**: `Orders.jsx:141–143`
- **Issue**: No debounce. `Products.jsx`/`Customers.jsx` debounce; Orders doesn't.
- **Impact**: Network spam, lag while typing.
- **Fix**: `setTimeout` debounce like other lists.

#### A-H5. Image uploads have no client-side size check despite "Max 5MB" label
- **File**: `Images.jsx:35–55`, `Products.jsx:357–382`, `Combos.jsx:343–368`, `Settings.jsx:67–92`, `Categories.jsx:182–207`, `Offers.jsx:161–186`
- **Impact**: Admin watches a 200 MB upload spinner for minutes, then gets `GENERIC_ERROR`.
- **Fix**: Reject `file.size > 5 * 1024 * 1024` immediately with a clear message.

#### A-H6. CSV export of orders escapes only the `note` field
- **File**: `Orders.jsx:301–319`
- **Issue**: Customer name / address with commas or quotes break columns.
- **Fix**: Apply `'"' + String(val).replace(/"/g, '""') + '"'` to every cell.

#### A-H7. Realtime socket caches token equality but never re-authenticates on rotation
- **File**: `src/api/realtimeClient.js:138–141`
- **Issue**: Token auth payload is set once at socket construction; if token rotates, `socket.connect()` keeps the old auth.
- **Fix**: Disconnect + reconnect when token actually changes.

#### A-H8. Realtime `storage` listener never unbound after logout
- **File**: `realtimeClient.js:106–118`
- **Issue**: `storageListenerBound` is only ever set, never unset.
- **Impact**: Logged-out tab silently reconnects realtime when another tab logs in.
- **Fix**: Remove listener inside `disconnectAdminRealtime`.

#### A-H9. `handlePrintInvoice` uses `document.write` on a hidden iframe with a 150 ms setTimeout
- **File**: `Orders.jsx:434–442`
- **Issue**: `document.write` is increasingly blocked / racy; 150 ms timer may fire before layout completes.
- **Impact**: Blank invoice prints, or print dialog never opens.
- **Fix**: Use `iframe.srcdoc` (or a Blob URL) + `iframe.onload` to trigger `print()`.

#### A-H10. Bulk Import has no client size limit + no progress / cancel
- **File**: `BulkImport.jsx:70–91`
- **Impact**: Admin waits minutes on multi-hundred-MB ZIP with no progress.
- **Fix**: Pre-check `file.size`; use XHR `progress` event; allow cancel.

#### A-H11. `OfferProductsPanel` uses raw `alert(err.message)` instead of the standard generic-error
- **File**: `src/components/OfferProductsPanel.jsx:33, 45, 57`
- **Impact**: Admin sees inconsistent error UX; raw backend strings leak.
- **Fix**: Use the same inline error helper as the rest of the app.

#### A-H12. Notifications `handleSend` reads `res.data.recipientCount` without null guard
- **File**: `Notifications.jsx:74–78`
- **Impact**: Successful broadcasts appear to fail when the response shape varies.
- **Fix**: `res?.data?.recipientCount ?? 'all'`.

#### A-H13. `MobileDashboard` `editForm.store_type = 'all'` but `<select>` has no `'all'` option
- **File**: `MobileDashboard.jsx:95, 531–539`
- **Impact**: For legacy sections with store_type=null, the select silently snaps to the first option; admin can save the wrong store_type without noticing.
- **Fix**: Add `<option value="all">` or block save until explicitly chosen.

#### A-H14. `MobileDashboard.handleMoveSection` doesn't refresh `display_order` after reorder
- **File**: `MobileDashboard.jsx:283–305`
- **Impact**: In-memory `section.display_order` becomes stale; next mutation may send wrong order.
- **Fix**: Recompute display_order indices on the new array, or refetch.

#### A-H15. Customers Trust/Block/Unblock confirmations inconsistent
- **File**: `Customers.jsx:96–125`
- **Issue**: Only "Block" prompts. Trust / Untrust / Unblock fire immediately.
- **Impact**: Misclick instantly marks a customer trusted or unblocked.
- **Fix**: Confirm all four destructive/sensitive transitions consistently.

#### A-H16. No global ErrorBoundary
- **File**: `src/App.jsx`
- **Issue**: A render error inside any page produces a blank screen with no logout/escape.
- **Fix**: Wrap routes in a React ErrorBoundary that shows a recovery UI.

### Medium

#### A-M1. `MobileDashboard.handleAddItem` can double-fire on rapid clicks
- **File**: `MobileDashboard.jsx:307–343`
- **Impact**: Duplicate section_items if backend doesn't dedupe.
- **Fix**: Disable each candidate's button while a request is in flight.

#### A-M2. `MobileDashboard` candidates list races with selectedSection load
- **File**: `MobileDashboard.jsx:60–67, 693–696`
- **Impact**: Already-attached items briefly appear as candidates on first render.
- **Fix**: Wait until items are loaded before filtering candidates.

#### A-M3. Products mode toggle resets `category_id` but keeps `available/featured` filters
- **File**: `Products.jsx:163, 170`
- **Impact**: Confusing carry-over.
- **Fix**: Reset all secondary filters on mode change.

#### A-M4. Customers `handlePendingResetClick` only opens the first pending request
- **File**: `Customers.jsx:81–85`
- **Impact**: Other pending resets invisible from the pill; admin may miss them.
- **Fix**: Show a dropdown of all pending requests.

#### A-M5. Offers `toggleActive` sends only `{ active }` (brittle to PATCH→PUT API change)
- **File**: `Offers.jsx:52–60`
- **Fix**: Send full offer payload or assert PATCH semantics in the API client.

#### A-M6. Currency formatting inconsistent across pages
- **File**: `Reports.jsx:115` uses `toLocaleString()`, `Dashboard.jsx:139` doesn't.
- **Fix**: Standardize a `formatRupee()` helper.

#### A-M7. Reports CSV export does no escaping
- **File**: `Reports.jsx:64–87`
- **Impact**: Any value with `,` or `"` breaks columns.
- **Fix**: Apply the same escape helper as Orders CSV.

#### A-M8. AuditLogs Older/Newer button has no loading indicator after first load
- **File**: `AuditLogs.jsx:73–77`
- **Impact**: Table appears frozen on page change.
- **Fix**: Show a refreshing bar like Orders does.

#### A-M9. Login page: no rate-limit / 429 messaging
- **File**: `Login.jsx:14–32`
- **Impact**: Repeated failed logins give no indication of lockout window.
- **Fix**: Detect 429 in error message; show "Please wait Ns".

### Low

#### A-L1. `Customers.handleReviewPasswordReset` uses blocking `alert()`
- **File**: `Customers.jsx:145`
- **Fix**: Inline message like the rest of the app.

#### A-L2. Browser tab title is the same on every admin route
- **Fix**: Use a `useEffect(() => { document.title = ... })` per page, or a small wrapper.

#### A-L3. `getOrderStatusLabel` falls back to raw status string
- **File**: `Orders.jsx:24, 55`
- **Impact**: If backend adds a new status, badge CSS class won't match.

#### A-L4. Products `params` cleanup uses `!params[k] && params[k] !== false`
- **File**: `Products.jsx:62`
- **Issue**: String `'0'` is truthy (kept), number `0` is dropped — fine today, brittle if types change.
- **Fix**: Compare explicitly to `''`/`undefined`/`null`.

---

## Suggested triage order

1. **F-C2, F-C3** — money/data-loss in checkout flow.
2. **F-C1, F-C4** — broken navigation paths in core flows.
3. **F-C5, F-H5** — cart cross-contamination + missing persist migration.
4. **A-C2, A-C4** — bulk operations and category description loss.
5. **A-C1** — 401 wipes admin form state.
6. **A-C3** — order status race condition.
7. **A-H1, A-H2** — settings save reliability.
8. **A-H5, A-H10** — image / bulk import UX (slow uploads).
9. The rest can be batched into a polish PR.
