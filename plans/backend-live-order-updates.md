# Backend Live Order Updates Plan

Branch: `plan/backend-live-order-updates`  
Scope: Backend architecture plan only. No implementation in this branch.

## Current Codebase Reality

This plan has been adjusted against the actual backend codebase.

Relevant existing patterns:
- CommonJS modules, Express controllers, `asyncHandler`, and direct `mysql2/promise` queries.
- Auth is JWT-based through `src/utils/auth.js`.
- REST auth middleware already verifies `customer` and `admin` roles in `src/middleware/authMiddleware.js`.
- Order updates already create persistent notification rows through `src/utils/notificationService.js`.
- Notification tables already exist in `src/db/migrate.js`: `notifications` and `notification_batches`.
- Customer notification APIs already exist at `/api/notifications`.
- Admin notification APIs already exist at `/api/admin/notifications`.
- Admin order status values are currently:

```txt
Pending, Accepted, Preparing, Out for Delivery, Delivered, Cancelled
```

Important conclusion: WebSockets should be a live delivery layer around the existing order and notification system. We should not create a separate event database/table for v1 unless we later need replay guarantees.

## Problem

Customer order screens currently depend on manual refetch or pull-to-refresh. When an admin changes order status or payment status, the backend updates MySQL and creates notification rows, but the customer app does not hear about that change instantly.

We need a backend live-update layer that can notify connected clients after important order/notification writes.

## Recommended Direction

Use Socket.IO for backend live updates.

Reasoning:
- Fits the future shape of this app better than polling: live order status, admin dashboard refresh, customer notifications, and later delivery updates.
- Socket.IO handles reconnects, rooms, and browser/mobile client quirks better than raw WebSocket.
- The existing REST APIs remain the source of truth, which keeps risk contained.

## Non-Negotiable Architecture Rule

REST is authoritative. Socket events are hints and fast patches.

Frontend must still refetch:
- when opening order list/detail screens
- on socket reconnect
- after app foreground
- after missed/stale events

## Backend Goals

1. Authenticate socket connections with existing JWT logic.
2. Join customer sockets to `customer:{customerId}`.
3. Join admin sockets to `admin`.
4. Emit order events after customer order creation, cancellation, admin status update, and admin payment update.
5. Emit notification events when notification rows are created.
6. Keep existing REST behavior unchanged.
7. Make realtime helper failures non-blocking.
8. Add tests around auth, rooms, and event emission.

## Out Of Scope For First Backend Pass

- Frontend socket client implementation.
- Delivery partner GPS.
- Push notifications through FCM/APNs.
- Realtime chat/support.
- Durable event replay.
- Replacing REST order APIs.

## Proposed Backend Design

### Dependency

Add:

```bash
npm install socket.io
```

Dev/test may also need:

```bash
npm install --save-dev socket.io-client
```

Only add `socket.io-client` if backend integration tests connect as a real socket client.

### New Module

Create:

`Backend-V1/src/realtime/socket.js`

Responsibilities:
- Initialize Socket.IO from the existing HTTP server.
- Configure CORS using the same origin values as Express.
- Authenticate handshake tokens using `verifyToken`.
- Join role-specific rooms.
- Export fail-soft emit helpers.
- Expose minimal diagnostics for tests/health.

Suggested exports:

```js
initRealtime(server)
closeRealtime()
emitToCustomer(customerId, eventName, payload)
emitToAdmins(eventName, payload)
getRealtimeStatus()
```

Fail-soft emit behavior:
- If Socket.IO is not initialized, return `false`.
- If emit throws, catch, log, return `false`.
- Never throw from emit helpers into controllers.

### Server Bootstrap

Update:

`Backend-V1/src/server.js`

Current pattern:

```js
server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
```

Plan:
- Import `initRealtime` and `closeRealtime`.
- Call `initRealtime(server)` after `app.listen`.
- Call `closeRealtime()` in shutdown before or with DB cleanup.

Keep startup order:
1. `db.initDB()`
2. `app.listen(...)`
3. `initRealtime(server)`

### Socket Authentication

Client connects with:

```js
io(API_ROOT, {
  auth: { token }
})
```

Backend auth:
- Use `verifyToken` from `src/utils/auth.js`.
- Accept only roles `customer` and `admin`.
- Derive identity from `payload.sub || payload.id`.
- Do not trust customer/admin IDs passed by the client.

Handshake rejection:
- missing token -> reject
- invalid/expired token -> reject
- unknown role -> reject

Recommended Socket.IO error messages:

```txt
AUTH_TOKEN_MISSING
AUTH_TOKEN_INVALID
FORBIDDEN_ROLE
```

### Room Model

Customer:

```txt
customer:{customerId}
```

Admin:

```txt
admin
```

Do not implement order-specific rooms in v1. Customer room is enough because order ownership is already enforced by REST and customer ID.

### Event Naming

Use stable namespaced events.

Customer-facing:

```txt
order.created
order.cancelled
order.status.updated
order.payment.updated
order.updated
notification.created
notification.unread_count.updated
```

Admin-facing:

```txt
admin.order.created
admin.order.updated
admin.notification.created
```

Rationale:
- Specific events are easy for targeted UI updates.
- `order.updated` is a generic catch-all for frontend code that wants one subscription.
- Notification events align with existing `notifications` table/API.

### Order Event Payload Shape

Keep payload small and non-sensitive.

```json
{
  "orderId": 9,
  "orderNumber": "OD-20260529-0001",
  "customerId": 5,
  "status": "Out for Delivery",
  "paymentStatus": "Pending",
  "updatedAt": "2026-05-29T12:52:40.000Z"
}
```

Do not include by default:
- address
- phone
- latitude/longitude
- map URL

Frontend can refetch order detail if it needs those fields.

### Notification Event Payload Shape

When a notification row is created:

```json
{
  "id": 123,
  "title": "Out for delivery",
  "body": "Your order #OD-20260529-0001 is on the way.",
  "type": "warning",
  "sourceType": "order",
  "sourceId": 9,
  "actionType": "open_order",
  "actionPayload": { "orderId": 9 },
  "createdAt": "2026-05-29T12:52:40.000Z"
}
```

Unread count update:

```json
{
  "unreadCount": 4
}
```

## Integration Points In Existing Code

### 1. Customer Order Creation

File:

`Backend-V1/src/controllers/orderController.js`

Function:

`createOrder`

Current behavior:
- Inserts order and order items in a transaction.
- Commits.
- Calls `notificationService.createOrderNotification({ event: 'order_placed' })` non-blocking.

Plan:
- After commit and after constructing response order object:
  - emit `admin.order.created` to `admin`
  - emit `order.created` to `customer:{userId}`
  - emit `order.updated` to `customer:{userId}`
- When notification creation succeeds, emit `notification.created` and unread count.

Important:
- Do not emit before transaction commit.

### 2. Customer Order Cancellation

File:

`Backend-V1/src/controllers/orderController.js`

Function:

`cancelOrder`

Current behavior:
- Updates order status to `Cancelled`.
- Creates `status_cancelled` notification.

Plan:
- Fetch updated order after update.
- Emit:
  - `order.cancelled`
  - `order.status.updated`
  - `order.updated`
  - `admin.order.updated`
- Emit notification event if notification row was created.

### 3. Admin Status Update

File:

`Backend-V1/src/controllers/adminController.js`

Function:

`updateOrderStatus`

Current behavior:
- Validates against `ORDER_STATUS_VALUES`.
- Enforces forward-only progression.
- Updates order.
- Creates status notification if status changed.

Plan:
- After fetching `updatedOrder`, and only if `currentStatus !== status`:
  - emit `order.status.updated` to `customer:{updatedOrder.customer_id}`
  - emit `order.updated` to same customer room
  - emit `admin.order.updated` to admin room
- If notification creation succeeds, emit `notification.created`.

Status-to-notification event mapping must match existing service:

```txt
Accepted -> status_accepted
Preparing -> status_preparing
Out for Delivery -> status_out_for_delivery
Delivered -> status_delivered
Cancelled -> status_cancelled
```

### 4. Admin Payment Update

File:

`Backend-V1/src/controllers/adminController.js`

Function:

`updateOrderPayment`

Current behavior:
- Validates payment status.
- Blocks cancelled orders.
- Updates order.
- Creates payment notification if payment status changed.

Plan:
- After fetching `updatedOrder`, and only if payment status changed:
  - emit `order.payment.updated`
  - emit `order.updated`
  - emit `admin.order.updated`
- If notification creation succeeds, emit `notification.created`.

Payment-to-notification event mapping must match existing service:

```txt
Paid -> payment_paid
Failed -> payment_failed
Refunded -> payment_refunded
```

### 5. Broadcast/Admin Notifications

Files:

`Backend-V1/src/controllers/adminController.js`  
`Backend-V1/src/utils/notificationService.js`

Current behavior:
- Admin can create broadcast notifications through `createAdminNotification`.
- `notificationService.createBroadcastNotification` writes notification rows in chunks.

Plan for v1:
- Do not emit one socket event per recipient inside large loops unless the recipient count is small.
- For broadcast notifications, either:
  - emit `notification.unread_count.updated` to connected customers only after batch creation, or
  - skip realtime broadcast in v1 and rely on notification polling/focus refresh.

Recommendation:
- v1 should emit order-related notifications live.
- Broadcast realtime can be a Phase 2 feature to avoid accidental fan-out spikes.

## Should We Add `order_events`?

Not in v1.

Reason:
- The codebase already persists user-facing events in `notifications`.
- The `orders` table remains source of truth.
- `audit_logs` already exist for admin audit in MongoDB.

Add `order_events` later only if we need:
- guaranteed delivery/replay
- analytics/event sourcing
- debugging missed realtime events at scale

## Suggested Realtime Helper Layer

Create small helper functions rather than importing Socket.IO directly into controllers.

Possible file:

`Backend-V1/src/realtime/orderEvents.js`

Exports:

```js
emitOrderCreated(order)
emitOrderStatusUpdated(order)
emitOrderPaymentUpdated(order)
emitOrderCancelled(order)
emitNotificationCreated(userId, notification)
```

This keeps controllers readable and matches the existing `notificationService` style.

Recommended internal payload normalizer:

```js
toOrderEventPayload(order)
```

So every event uses the same `orderId`, `orderNumber`, `status`, `paymentStatus`, `updatedAt` shape.

## Config And CORS

Current backend uses:

`config.CORS_ORIGIN`

Socket.IO CORS should use the same setting.

If current CORS parsing is too narrow for mobile local IP testing, document expected local env:

```env
CORS_ORIGIN=*
```

No new env is required for v1 unless we want a kill switch:

```env
REALTIME_ENABLED=true
```

Recommendation:
- Add `REALTIME_ENABLED` only if we want to deploy with sockets disabled by default.
- For local/dev, default enabled is fine.

## Error Handling Rules

1. Realtime emit failure must not fail REST responses.
2. Realtime auth failure must not crash the server.
3. Realtime module should log with concise messages, similar to existing DB connection logs.
4. Controller tests should not require Socket.IO unless testing realtime specifically.

## Test Plan

### Unit/Integration Tests

Suggested file:

`Backend-V1/tests/realtime.test.js`

Test cases:
- missing socket token is rejected
- invalid socket token is rejected
- customer token connects and joins customer room
- admin token connects and joins admin room
- customer cannot choose another customer room
- admin status update emits `order.status.updated`
- admin payment update emits `order.payment.updated`
- customer order creation emits `admin.order.created`
- customer cancellation emits `order.cancelled`
- notification creation emits `notification.created` for order events

### Existing REST Regression

Run existing backend tests after implementation:

```bash
npm test -- --runInBand
```

Also rerun the API smoke flow:
- create order
- admin status progression
- payment update
- customer order detail remains correct

## Rollout Phases

### Phase 1: Backend Socket Infrastructure

Files:
- `src/realtime/socket.js`
- `src/server.js`
- `package.json`

Acceptance:
- server starts normally
- customer/admin socket auth works
- missing/invalid token rejected
- no REST regression

### Phase 2: Backend Event Helpers

Files:
- `src/realtime/orderEvents.js`

Acceptance:
- payload normalizers produce stable field names
- emit helpers are fail-soft

### Phase 3: Order Controller Integration

Files:
- `src/controllers/orderController.js`
- `src/controllers/adminController.js`

Acceptance:
- order created emits admin + customer events
- status updated emits customer + admin events
- payment updated emits customer + admin events
- cancelled order emits customer + admin events
- events only emit after DB update/commit

### Phase 4: Notification Integration

Files:
- `src/utils/notificationService.js`
- or controller-level wrappers around `notificationService.createOrderNotification`

Acceptance:
- order notifications can trigger `notification.created`
- unread count can be pushed after order notification creation
- broadcast notifications are not fan-out emitted in v1 unless explicitly chosen

### Phase 5: Diagnostics

Optional endpoint:

`GET /api/realtime/health`

Return:

```json
{
  "enabled": true,
  "connectedSockets": 3
}
```

This endpoint can be admin-only or public minimal health. Recommendation: admin-only if it exposes counts.

## Frontend Contract For Later

This backend plan should eventually hand the frontend this contract:

Connection:

```js
io(API_ROOT_WITHOUT_API_SUFFIX, {
  auth: { token: customerJwt },
  transports: ['websocket']
})
```

Customer listens for:

```txt
order.created
order.cancelled
order.status.updated
order.payment.updated
order.updated
notification.created
notification.unread_count.updated
```

Frontend behavior:
- update visible order list/detail when event order ID matches
- refetch active order detail after event if needed
- refetch after reconnect/app focus
- disconnect on logout
- reconnect on login

## What The Original Plan Missed

1. Existing notification persistence already covers many order events.
2. `Accepted` is a valid order status and must be included.
3. Customer cancellation should emit live events too, not only admin status changes.
4. Admin broadcast notifications already exist and need fan-out caution.
5. Notification unread count should be part of realtime, not only order status.
6. Emit helpers should be isolated from controllers in a service-style module matching existing code patterns.
7. Tests should include notification events and cancellation, not only admin status/payment.
8. No v1 `order_events` table is needed because existing `notifications`, `orders`, and `audit_logs` already cover persistence/audit needs.

## Final Recommendation

Backend first, in a separate implementation branch:

1. Add Socket.IO infrastructure.
2. Add realtime order/notification helper modules.
3. Emit from existing order/admin controller points after successful DB writes.
4. Keep notification rows as the persistent event record.
5. Add focused backend realtime tests.
6. Keep REST APIs unchanged.

Then do frontend in a second branch:

1. Connect after customer login.
2. Disconnect on logout.
3. Listen for order and notification events.
4. Update active screens immediately.
5. Keep focus/reconnect refetch as fallback.
