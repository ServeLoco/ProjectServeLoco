# Frontend Live Order Updates Plan

Branch: `plan/frontend-live-order-updates`  
Scope: Frontend integration plan only. No implementation in this branch.

## Current Frontend Reality

This plan is based on the actual `Frontend-V1` codebase.

Relevant existing patterns:
- Expo React Native app.
- REST API calls are centralized through `src/api/httpClient.js`.
- API base URL is managed by `src/api/config.js`.
- Customer auth is stored in Zustand via `src/stores/useAuthStore.js`.
- `App.js` already registers the customer token provider for API calls.
- API and hooks use barrel exports through `src/api/index.js` and `src/hooks/index.js`.
- Screens currently refetch on focus/pull-to-refresh instead of sharing an order store.
- Customer order list state lives inside `OrdersScreen`.
- Customer order detail state lives inside `OrderDetailScreen`.
- Notification badge count currently lives inside `HomeScreen`.
- Notification list state currently lives inside `NotificationsScreen`.
- `adminManager-V1` is a separate Vite/React app with its own auth/API layer.

Important conclusion: the first frontend pass should add a small realtime service and screen subscriptions, without UI changes and without replacing REST fetches.

Scope correction:
- This plan is for the customer mobile app: `Frontend-V1`.
- Admin dashboard realtime should be a separate plan/pass for `adminManager-V1`.
- The backend already emits admin events, but this plan should not mix both frontend apps in one implementation.

## Backend Contract To Use

The backend realtime pass created Socket.IO auth and customer/admin rooms.

Customer connects to backend root, not `/api`:

```js
io(API_ROOT, {
  auth: { token: customerJwt },
  transports: ['websocket']
})
```

If REST base URL is:

```txt
http://192.168.1.5:3000/api
```

Socket URL should be:

```txt
http://192.168.1.5:3000
```

Customer events:

```txt
order.created
order.cancelled
order.status.updated
order.payment.updated
order.updated
notification.created
notification.unread_count.updated
```

Payloads are intentionally small. REST remains source of truth.

Backend emits multiple events for the same logical change:
- order creation emits `order.created` and `order.updated`
- status changes emit `order.status.updated` and `order.updated`
- cancellation emits `order.cancelled`, `order.status.updated`, and `order.updated`

Frontend must de-duplicate these events before triggering refetches.

## Non-Negotiable Rule

Realtime events are hints, not the source of truth.

Frontend must still refetch:
- when opening order list/detail screens
- on screen focus
- on pull-to-refresh
- after socket reconnect
- after app returns to foreground

No UI changes are required for this pass.

## Proposed Frontend Design

### 1. Dependency

Add to `Frontend-V1/package.json`:

```bash
npm install socket.io-client
```

Use the same major version as backend Socket.IO.

Because this is an Expo app, run the install from `Frontend-V1` and verify Metro still starts cleanly.

### 2. Realtime URL Helper

Create:

`Frontend-V1/src/api/realtimeConfig.js`

Responsibilities:
- import `getApiBaseUrl`
- derive the socket origin by removing trailing `/api`
- preserve local IP/mobile behavior from current API config

Suggested API:

```js
getRealtimeBaseUrl()
```

Example behavior:

```txt
http://10.0.2.2:3000/api -> http://10.0.2.2:3000
http://192.168.1.5:3000/api -> http://192.168.1.5:3000
http://localhost:3000/api -> http://localhost:3000
```

### 3. Realtime Client Service

Create:

`Frontend-V1/src/api/realtimeClient.js`

Responsibilities:
- own the singleton Socket.IO client
- connect only when a customer token exists
- disconnect on logout
- expose subscribe/unsubscribe helpers
- avoid direct Socket.IO imports in screens
- keep errors non-blocking

Suggested exports:

```js
connectCustomerRealtime(token)
disconnectCustomerRealtime()
subscribeRealtime(eventName, handler)
getRealtimeConnectionState()
```

Recommended behavior:
- If already connected with the same token, do nothing.
- If token changes, disconnect and reconnect.
- Use `forceNew: true` only if needed during reconnect bugs; default singleton is preferred.
- Use `transports: ['websocket', 'polling']` unless websocket-only is proven reliable on Expo devices.
- Log connect errors only in `__DEV__`.
- Export the new realtime helpers from `src/api/index.js` only if consumers need barrel imports.
- Do not call `/api/realtime/health` from the customer app because that route is admin-only.

### 4. App-Level Lifecycle Hook

Create:

`Frontend-V1/src/hooks/useCustomerRealtime.js`

Responsibilities:
- read `token`, `isAuthenticated`, `hasHydrated` from `useAuthStore`
- connect after auth hydration and login
- disconnect after logout
- listen to app foreground using `AppState`
- request a soft refetch signal after reconnect/foreground

Mount it in:

`Frontend-V1/App.js`

Why `App.js`:
- It already wires token provider.
- It is above navigation.
- It prevents each screen from creating its own socket connection.

### 5. Lightweight Event Bus For Screens

Create one tiny internal event layer, either inside `realtimeClient.js` or a separate file:

`Frontend-V1/src/api/realtimeEvents.js`

Reason:
- Screens need to subscribe to domain events.
- We do not need a global order store yet.
- This matches the existing screen-local state pattern.

Suggested API:

```js
subscribeOrderEvents(handler)
subscribeNotificationEvents(handler)
subscribeRealtimeLifecycle(handler)
```

The client service listens to raw socket events once and re-emits normalized local events.

Required de-dupe behavior:
- Normalize event IDs to strings: `String(orderId)`.
- Track recent order event keys for a short window, for example `orderId + status + paymentStatus + updatedAt`.
- Coalesce refetch requests for 300-500ms so `order.status.updated` and `order.updated` do not cause duplicate REST calls.
- Screens should unsubscribe on unmount.

## Screen Integration Plan

### Orders Screen

File:

`Frontend-V1/src/screens/customer/OrdersScreen/OrdersScreen.js`

Current pattern:
- local `orders` state
- `fetchOrders(refresh)`
- refetch on focus/filter change

Plan:
- Subscribe while screen is mounted.
- On `order.created`:
  - call existing `fetchOrders(false)` because a small event payload is not enough to render a full card.
- On `order.updated`, `order.status.updated`, `order.payment.updated`, `order.cancelled`:
  - if order exists in current `orders`, patch `status`, `paymentStatus`, `canCancel`, `date`
  - if current filter hides/shows the order, call `fetchOrders(false)` to avoid wrong filtered list
- On reconnect/foreground:
  - if screen is focused, call `fetchOrders(false)`
- Compare IDs as strings because local `normalizeOrder` stores `id` as a string.
- Use a debounced `fetchOrders` wrapper to prevent duplicate calls from paired backend events.

No new visual states.

### Order Detail Screen

File:

`Frontend-V1/src/screens/customer/OrderDetailScreen/OrderDetailScreen.js`

Current pattern:
- local `order` state
- `loadOrder(refresh)`

Plan:
- Subscribe while screen is mounted.
- If event `orderId` matches current route `orderId`:
  - immediately patch `status` and/or `paymentStatus`
  - then call `loadOrder(true)` quietly to fetch full details
- On `order.cancelled`, set `canCancel: false` immediately.
- On reconnect/foreground:
  - call `loadOrder(true)` if still mounted.
- Compare `String(event.orderId)` with `String(orderId)`.
- Debounce `loadOrder(true)` for paired status/generic events.

No UI changes. Existing timeline will update from state.

### Home Screen Notification Badge

File:

`Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js`

Current pattern:
- local `unreadCount`
- `notificationsApi.getUnreadCount()` on load/focus

Plan:
- Subscribe to `notification.unread_count.updated`.
- Set local `unreadCount` from payload.
- On `notification.created`, optionally increment local count only if unread count event is missing.
- Keep existing focus refetch as fallback.
- If Home is not mounted when the event arrives, focus refetch still covers the badge.

No UI changes.

### Notifications Screen

File:

`Frontend-V1/src/screens/customer/NotificationsScreen/NotificationsScreen.js`

Current pattern:
- local `notifications` state
- fetch list on mount
- mark all read automatically if unread exists

Plan:
- Subscribe to `notification.created` while mounted.
- Prepend normalized notification to local list if not already present.
- Because this screen currently auto-marks all as read after fetch, do not auto-mark live notifications read unless the user triggers existing read flow or we intentionally keep current behavior.
- Recommendation for first pass:
  - prepend as unread
  - leave mark-all behavior unchanged for manual/header action and existing fetch path
- If keeping the existing auto-mark-on-fetch behavior, update local state after `markAllRead()` so the displayed read state matches the backend.

No UI changes.

## Normalization

Use existing mappers in:

`Frontend-V1/src/utils/apiMappers.js`

Needed adjustment:
- Export or reuse the existing notification normalizer through `mapNotification`.
- `normalizeOrder` already handles `orderId`, `orderNumber`, `status`, `paymentStatus`, and totals.

For realtime order patches, do not require full normalization if payload is partial. Use a small helper:

```js
mergeOrderRealtimePatch(existingOrder, event)
```

It should:
- preserve existing card/detail fields
- update `status`
- update `paymentStatus`
- set `canCancel` false for non-`Pending` statuses
- update `date` from `updatedAt` if present
- keep `orderNumber`/`order_number` untouched if the partial event does not include both shapes
- avoid overwriting full order fields with `undefined`

## Logout Behavior

When `useAuthStore.logout()` runs:
- auth token becomes null
- `useCustomerRealtime` disconnects socket
- no cart changes are needed
- no screen UI changes are needed

## Reconnect Behavior

Socket reconnects can mean events were missed.

On reconnect:
- emit local lifecycle event: `reconnected`
- active `OrdersScreen` refetches orders
- active `OrderDetailScreen` refetches current order
- `HomeScreen` refetches unread count

On app foreground:
- do the same soft refetch behavior.

Add a tiny debounce per screen so foreground + reconnect at the same moment does not double-fetch.

## Error Handling

Rules:
- Socket connection failure must not block login or screen rendering.
- Never show an error banner/toast for socket failure in v1.
- In `__DEV__`, log concise connection errors.
- REST screen errors stay as-is.

## Testing Plan

Manual flow:
1. Start backend on port 3000.
2. Start Expo app.
3. Login as customer.
4. Confirm socket connects in backend logs/dev console.
5. Place an order.
6. Open customer `Orders` screen.
7. From admin/backend API, change order status to `Accepted`.
8. Confirm customer order list updates without pull-to-refresh.
9. Open `OrderDetail`.
10. Change status to `Preparing`, then `Out for Delivery`.
11. Confirm timeline updates.
12. Mark payment `Paid`.
13. Confirm payment status updates on detail after refetch.
14. Confirm Home notification badge updates.
15. Open Notifications and confirm new notification appears.
16. Logout and confirm socket disconnects.
17. Login again and confirm socket reconnects.
18. Change one status and verify only one order-list refetch/detail refetch happens despite paired backend events.
19. Toggle phone network or restart backend and confirm reconnect refetch works.
20. Confirm customer app never calls `/api/realtime/health`.

Automated checks:
- Run frontend lint.
- Add small unit tests only if existing Jest setup supports mocking socket client cleanly.

## Implementation Phases

### Phase 1: Infrastructure

Files:
- `src/api/realtimeConfig.js`
- `src/api/realtimeClient.js`
- `src/hooks/useCustomerRealtime.js`
- `App.js`
- `package.json`
- `src/api/index.js` if using barrel exports
- `src/hooks/index.js` if using barrel exports

Acceptance:
- customer socket connects after login
- socket disconnects on logout
- duplicate backend events are coalesced
- no UI changes

### Phase 2: Order Screens

Files:
- `OrdersScreen.js`
- `OrderDetailScreen.js`

Acceptance:
- order status updates live
- detail screen refetches when matching order event arrives
- existing pull-to-refresh still works

### Phase 3: Notifications

Files:
- `HomeScreen.js`
- `NotificationsScreen.js`

Acceptance:
- unread badge updates live
- notifications list can prepend new notification
- existing notification APIs still work

### Phase 4: Verification

Acceptance:
- frontend lint passes for touched files
- manual full order flow works
- logout/login reconnect behavior works

## Out Of Scope For This FE Pass

- UI redesign
- new connection status indicators
- admin manager realtime integration
- push notifications
- background notifications while app is killed
- replacing REST fetches with a global order store

## Admin Manager Follow-Up

The backend already emits:

```txt
admin.order.created
admin.order.updated
```

Those are useful for `adminManager-V1`, especially:
- `Orders.jsx`
- `Dashboard.jsx`

But `adminManager-V1` is a separate Vite app with:
- separate package.json
- separate API client at `adminManager-V1/src/api/client.js`
- admin token in `localStorage`
- separate auth provider

Recommendation:
- Keep customer realtime implementation in `Frontend-V1` first.
- Create a separate admin-manager plan/branch after customer realtime works.
- Admin manager can also call `/api/realtime/health` if we want an admin debug view.

This avoids mixing Expo mobile lifecycle concerns with browser admin dashboard lifecycle concerns.

## What This Review Added

The first version missed:
- backend emits duplicate paired events, so the FE needs de-dupe/coalescing
- IDs must be compared as strings because frontend order IDs are normalized to strings
- barrel exports may need updates
- customer app should not call admin-only `/api/realtime/health`
- Notifications screen local read state should match backend after auto-marking read
- `adminManager-V1` realtime is a real follow-up, but should not be folded into this customer FE pass

## Final Recommendation

Implement realtime as a quiet app-level service:

1. Add `socket.io-client`.
2. Connect from `App.js` through a `useCustomerRealtime` hook.
3. Keep socket details out of screens.
4. Let screens subscribe to normalized domain events.
5. Patch visible data immediately, then rely on existing REST fetches for truth.
6. Do not change UI in this pass.
