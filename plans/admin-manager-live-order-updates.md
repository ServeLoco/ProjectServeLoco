# Admin Manager Live Order Updates Plan

Branch: `plan/admin-manager-live-order-updates`  
Scope: Admin manager integration plan only. No implementation in this branch.

## Current Admin Manager Reality

This plan is based on the actual `adminManager-V1` codebase.

Relevant existing patterns:
- Vite React app.
- ESM modules.
- REST API calls go through `src/api/client.js`.
- API origin is already exported as `API_ORIGIN`.
- Admin token is stored in `localStorage` through `src/utils/storage.js`.
- Auth lifecycle lives in `src/components/AuthProvider.jsx`.
- Orders state is local to `src/pages/Orders.jsx`.
- Dashboard state is local to `src/pages/Dashboard.jsx`.
- Admin order status and payment updates already call REST, then refresh the order list.
- There is no global state manager.
- `apiClient` clears the admin token and redirects on REST `401`.
- `ProtectedRoute` uses only AuthProvider state, not direct token state.

Important conclusion: add realtime as a small app-level service and page-level subscriptions. Do not introduce a global store in the first pass.

## Backend Contract To Use

Backend emits these admin events:

```txt
admin.order.created
admin.order.updated
```

Socket connection should use the existing admin JWT:

```js
io(API_ORIGIN, {
  auth: { token: adminJwt }
})
```

The backend authenticates sockets with the same token role used by REST admin APIs.

Payload shape is small:

```json
{
  "orderId": 12,
  "orderNumber": "OD-20260529-0004",
  "customerId": 5,
  "status": "Preparing",
  "paymentStatus": "Pending",
  "total": "40.00",
  "updatedAt": "2026-05-29T17:56:08.000Z"
}
```

REST remains the source of truth.

Backend event limits:
- `admin.order.created` does not include customer name, phone, address, items, payment method, or created date.
- `admin.order.updated` does not include enough detail to fully render the drawer.
- Therefore the admin UI should patch visible status/payment quickly, then use debounced REST refetches for full rows/details.

## Why Admin Needs This

Customer app receives live status updates, but admins also need live admin-side changes:
- new customer order should appear in the admin order list without manual refresh
- dashboard latest orders and metrics should update when new orders arrive
- if multiple admins are open, one admin's status/payment action should update the other admin's screen
- selected order drawer should stay in sync if an order changes while it is open

## Non-Negotiable Rule

Realtime is a hint layer. REST remains authoritative.

Admin manager should still refetch:
- when opening Orders page
- when changing filters
- when opening an order drawer
- after admin status/payment actions
- after reconnect
- when browser tab becomes visible again

## Proposed Admin Manager Design

### 1. Dependency

Add to `adminManager-V1/package.json`:

```bash
npm install socket.io-client
```

Use the same major version as backend Socket.IO.

### 2. Realtime Client Service

Create:

`adminManager-V1/src/api/realtimeClient.js`

Responsibilities:
- import `io` from `socket.io-client`
- import `API_ORIGIN` from `src/api/client.js`
- import `storage` to read admin token
- own a singleton socket
- connect only when admin token exists
- disconnect on logout
- listen for backend admin events
- expose subscribe/unsubscribe helpers
- listen for browser tab visibility only once
- avoid duplicate sockets after hot reload or repeated login

Suggested exports:

```js
connectAdminRealtime()
disconnectAdminRealtime()
subscribeAdminOrderEvents(handler)
subscribeRealtimeLifecycle(handler)
getRealtimeConnectionState()
```

Recommended Socket.IO options:

```js
io(API_ORIGIN, {
  auth: { token },
  reconnection: true,
  transports: ['websocket', 'polling']
})
```

Do not call customer events in admin manager.

Service lifecycle details:
- `connectAdminRealtime()` should no-op if already connected with the current token.
- if the token changes, disconnect and reconnect.
- `disconnectAdminRealtime()` should remove all socket listeners before disconnecting.
- page subscriptions should be independent of socket connection timing.
- development logging is fine; production should stay quiet.

### 3. Auth Lifecycle Integration

Update:

`adminManager-V1/src/components/AuthProvider.jsx`

Plan:
- after token is validated in `initAuth`, call `connectAdminRealtime()`
- after successful login, call `connectAdminRealtime()`
- on logout, call `disconnectAdminRealtime()`
- if `AuthApi.me()` fails and token is cleared, disconnect too

Important:
- The realtime service should read the token from `storage.getToken()`.
- AuthProvider should not pass tokens around if current local pattern avoids that.
- `apiClient` can clear token on `401` outside AuthProvider. Because it currently redirects to `/login`, page reload should naturally kill the socket, but the realtime plan should still expose an explicit `disconnectAdminRealtime()` for any future no-reload auth handling.
- Listen to browser `storage` events so logout/login in another tab can disconnect/reconnect this tab.

Storage-event behavior:
- if `admin_token` is removed in another tab, disconnect socket
- if `admin_token` changes in another tab and current AuthProvider still has a user, reconnect socket
- do not mutate AuthProvider user from the realtime service; keep ownership in AuthProvider

### 4. Event De-Dupe And Coalescing

Backend can emit several admin events from related actions.

Rules:
- normalize order IDs with `String(orderId)`
- build event key from `orderId + status + paymentStatus + updatedAt`
- ignore the same event key for 500ms
- debounce page refetches for 300-500ms
- hold latest `filters`, `pagination.page`, and `selectedOrder` in refs where subscriptions need current values

This avoids:
- duplicate list fetches after one status update
- selected drawer flickering after admin's own update
- dashboard double-refreshing
- stale closure bugs where a realtime handler fetches an old page or old filters

Create helper:

`adminManager-V1/src/utils/realtimeOrder.js`

Suggested exports:

```js
getRealtimeOrderId(payload)
getRealtimeOrderKey(eventName, payload)
mergeAdminOrderPatch(order, payload)
isRecentRealtimeEvent(cacheRef, key)
```

Patch helper should:
- preserve existing row/detail fields
- update `status`
- update `payment_status`
- update `paymentStatus`
- update `total` if provided
- update `updated_at` if provided
- never overwrite full fields with `undefined`
- preserve both backend snake_case and any local camelCase fields if both exist
- set terminal-state derived behavior from `status` only through existing render logic, not a new UI flag

## Page Integration Plan

### Orders Page

File:

`adminManager-V1/src/pages/Orders.jsx`

Current behavior:
- local `orders`
- local `filters`
- local `selectedOrder`
- `fetchOrders(page)`
- status/payment REST action updates selected order, then refetches current page

Plan:
- subscribe to `admin.order.created` and `admin.order.updated`.
- on `admin.order.created`:
  - if no filters or current filters could include it, refetch page 1
  - if filters are active, refetch current page because new order may or may not match
  - do not insert the partial payload directly because table needs customer fields/date/payment method
- on `admin.order.updated`:
  - patch matching row in `orders`
  - patch `selectedOrder` if drawer is open for that order
  - if active status/payment filters may hide/show the row, debounce `fetchOrders(pagination.page)`
  - if a patched row no longer matches the active status/payment filters, prefer refetch over local removal in v1
- after reconnect or tab visibility restore:
  - debounce `fetchOrders(pagination.page)`
  - if drawer is open, refetch selected order detail with `OrdersApi.get(id)`
- use refs for `filters`, `pagination.page`, and `selectedOrder` inside subscriptions to avoid stale values

Careful status update behavior:
- keep existing confirm dialogs
- keep existing forward-only backend validation
- after admin changes status/payment, keep existing REST call and local selected update
- allow the socket echo to arrive but de-dupe/coalesce so it does not trigger duplicate refresh storms
- if REST rejects a status move, leave UI unchanged or refetch selected order; do not optimistically keep rejected values
- status dropdown should keep using backend enum values exactly:

```txt
Pending, Accepted, Preparing, Out for Delivery, Delivered, Cancelled
```

- do not add alternate spellings such as `Prepared`, `OutForDelivery`, or `Canceled`

Drawer sync:
- If selected drawer order receives a realtime update:
  - patch status/payment immediately
  - optionally call `OrdersApi.get(selectedOrder.id)` after debounce to refresh items/detail
  - if status becomes `Delivered` or `Cancelled`, existing terminal-state disabled controls should update automatically
- if drawer order becomes terminal because of realtime, status/payment selects should become disabled through existing `isTerminalState`
- if `OrdersApi.get(id)` returns 404 after a future delete/archive feature, close drawer and refetch list

No UI change required.

Optional but useful later:
- add a subtle "New order received" toast or badge. Out of scope for first pass unless requested.

### Dashboard Page

File:

`adminManager-V1/src/pages/Dashboard.jsx`

Current behavior:
- `fetchDashboardData()` runs once on mount
- latest orders and metrics come from `/api/admin/dashboard`

Plan:
- subscribe to `admin.order.created` and `admin.order.updated`.
- on any admin order event:
  - debounce `fetchDashboardData()`
- on reconnect or tab visible:
  - debounce `fetchDashboardData()`
- use `useCallback` or a ref-backed fetch function so lifecycle handlers do not hold stale state
- include all status labels in dashboard display mapping for consistency:

```txt
Pending -> Order Placed
Accepted -> Accepted
Preparing -> Preparing/Packing
Out for Delivery -> Out for Delivery
Delivered -> Delivered
Cancelled -> Cancelled
```

Why refetch instead of patching:
- dashboard metrics include totals, pending counts, latest order ordering, and top products
- backend payload is intentionally small
- REST endpoint already returns the correct aggregate view

No UI change required.

## Browser Lifecycle

Realtime service should listen to:

```js
document.visibilitychange
window.storage
```

When document becomes visible:
- emit local lifecycle event: `visible`
- Orders page refetches active page
- Dashboard refetches metrics

When `admin_token` changes in another browser tab:
- reconnect if a new token exists
- disconnect if token is removed

This covers missed events while the browser tab was suspended.

## Error Handling

Rules:
- socket failures must not log out the admin
- socket failures must not block REST screens
- connect errors should log only in development
- REST 401 behavior stays in `api/client.js`
- if REST 401 clears token, AuthProvider should disconnect realtime
- avoid alerting admins on socket disconnects; the manual Refresh button remains the visible fallback
- if socket payload is malformed, ignore it and wait for the next REST refresh

## Testing Plan

Manual flow:
1. Start backend on port 3000.
2. Start `adminManager-V1`.
3. Login admin.
4. Open Orders page.
5. Place an order from customer app.
6. Confirm Orders page refreshes and newest order appears.
7. Open Dashboard.
8. Place another order and confirm dashboard latest orders/metrics refresh.
9. Open same admin panel in two browser tabs.
10. In tab A, accept an order.
11. Confirm tab B updates status without manual refresh.
12. In tab B, change payment to `Paid`.
13. Confirm tab A updates payment.
14. Open order drawer and update status from another tab/API.
15. Confirm drawer status and disabled terminal controls update.
16. Restart backend and confirm reconnect triggers a refresh.
17. Hide/show browser tab and confirm visible-tab refresh works.
18. Apply a status filter, change a visible order so it no longer matches, and confirm list refreshes correctly.
19. Try an invalid backward status transition and confirm UI does not keep the rejected status.
20. Logout in one browser tab and confirm another tab disconnects or navigates away cleanly.
21. Confirm no duplicate sockets are opened after login, route changes, or Vite hot reload.

Automated checks:
- run `npm run lint` in `adminManager-V1`
- optional unit tests for helper functions in `src/utils/realtimeOrder.js`

## Implementation Phases

### Phase 1: Infrastructure

Files:
- `adminManager-V1/package.json`
- `adminManager-V1/src/api/realtimeClient.js`
- `adminManager-V1/src/utils/realtimeOrder.js`
- `adminManager-V1/src/components/AuthProvider.jsx`

Acceptance:
- socket connects after admin login
- socket disconnects on logout/token clear
- cross-tab token removal disconnects socket
- repeated login/init does not create duplicate sockets
- no page UI changes

### Phase 2: Orders Page

Files:
- `adminManager-V1/src/pages/Orders.jsx`

Acceptance:
- new orders refresh the list
- status/payment updates patch visible rows
- selected drawer stays in sync
- active filters do not show stale/wrong rows after updates
- admin's own status/payment update does not cause duplicate refresh loops
- rejected REST status/payment updates do not leave stale optimistic UI behind

### Phase 3: Dashboard Page

Files:
- `adminManager-V1/src/pages/Dashboard.jsx`

Acceptance:
- latest orders and metrics refresh after order create/update
- reconnect/visible-tab refresh works

### Phase 4: Verification

Acceptance:
- `npm run lint` passes or only pre-existing warnings remain
- manual two-tab order flow works
- customer app and admin app both receive expected events from same backend

## Out Of Scope For This Pass

- UI redesign
- visible socket status indicator
- toast notifications
- sound alerts for new orders
- customer mobile realtime changes
- backend realtime changes
- push notifications
- replacing REST with global order state
- changing backend status enum/progression rules
- changing admin drawer layout or controls

## What This Review Added

The first admin plan missed:
- `apiClient` can clear tokens outside AuthProvider on `401`
- cross-tab login/logout should be handled through `storage` events
- realtime subscriptions can capture stale filters/page/selected order unless refs are used
- backend admin payload is too small for full row/drawer rendering, so REST refetch is mandatory for those details
- rejected status/payment REST calls need rollback/refetch behavior
- dashboard status labels should include all backend statuses
- duplicate socket creation after repeated login/init/hot reload must be avoided

## Final Recommendation

Implement admin manager realtime as a quiet background layer:

1. Add `socket.io-client`.
2. Connect/disconnect through `AuthProvider`.
3. Keep Socket.IO details inside an API service.
4. Let Orders and Dashboard subscribe to admin order events.
5. Patch visible order status/payment immediately.
6. Use debounced REST refetches for new orders, filters, drawer details, dashboard aggregates, reconnect, and tab visibility.
7. Do not change UI in the first admin-manager pass.
