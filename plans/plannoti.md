# Notifications System Tasks

## Goal
Build a real notification system for ServeLoco.

The dashboard bell in the mobile app should show real notifications instead of mock data. Notifications should be created automatically for important order events like order placed, accepted/preparing, out for delivery, delivered, cancelled, and payment changes. When a customer opens the notifications screen, unread notifications should automatically become seen/read.

Admin Manager should also allow admins to send notifications to everyone, or selected customers if needed later.

The implementation must keep Backend-V1 as the source of truth. The mobile app and admin web should only read/write through APIs.

---

## 1. Current System Review

### Goal
Understand the current notification UI and related order/admin flows before coding.

### Files likely checked
- `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js`
- `Frontend-V1/src/screens/customer/NotificationsScreen/NotificationsScreen.js`
- `Frontend-V1/src/navigation/CustomerNavigator.js`
- `Frontend-V1/src/api/index.js`
- `Frontend-V1/src/api/ordersApi.js`
- `Backend-V1/src/controllers/orderController.js`
- `Backend-V1/src/controllers/adminController.js`
- `Backend-V1/src/routes/orderRoutes.js`
- `Backend-V1/src/routes/adminRoutes.js`
- `Backend-V1/src/db/migrate.js`
- `adminManager-V1/src/App.jsx`
- `adminManager-V1/src/api/index.js`
- `adminManager-V1/src/components/Sidebar.jsx`

### Current known state
- [ ] Mobile home dashboard has a notification bell.
- [ ] Bell navigates to `Notifications` screen.
- [ ] `NotificationsScreen` currently uses `MOCK_NOTIFICATIONS`.
- [ ] Opening notification screen currently marks mock notifications as read locally only.
- [ ] Backend has no notification table/API yet.
- [ ] Admin Manager has no notifications page yet.
- [ ] Order creation and admin order status updates already exist and can trigger notifications.

### Subtasks
- [ ] Confirm bell route opens `NotificationsScreen`.
- [ ] Confirm customer auth token is available for notification API calls.
- [ ] Confirm admin token is available in Admin Manager API client.
- [ ] Confirm order status values used by backend:
  - [ ] `Pending`
  - [ ] `Preparing`
  - [ ] `Out for Delivery`
  - [ ] `Delivered`
  - [ ] `Cancelled`
- [ ] Confirm payment status values used by backend:
  - [ ] `Pending`
  - [ ] `Paid`
  - [ ] `Failed`
  - [ ] `Refunded`
- [ ] Confirm all order status changes go through admin API.
- [ ] Confirm order cancellation goes through customer API.

### Things to avoid
- [ ] Do not keep using mock notifications after backend API exists.
- [ ] Do not make notification state only local on the phone.
- [ ] Do not add admin notification controls inside the customer app.
- [ ] Do not block order placement if notification creation fails.

### Testing checklist
- [ ] Mobile bell still opens notifications page.
- [ ] Existing order placement still works before notification changes.
- [ ] Existing admin order status update still works before notification changes.

---

## 2. Notification Data Model

### Goal
Add persistent notification storage in Backend-V1.

### Suggested table: `notifications`
Each row is one notification visible to one user.

### Fields
- `id`
- `user_id`
- `title`
- `body`
- `type`
- `source_type`
- `source_id`
- `event_key`
- `batch_id`
- `action_type`
- `action_payload`
- `read_at`
- `seen_at`
- `created_by_admin_id`
- `created_at`
- `updated_at`
- `deleted_at`

### Field meaning
- `user_id`: customer who receives this notification.
- `title`: short notification heading.
- `body`: message text.
- `type`: UI/semantic type such as `order`, `success`, `warning`, `offer`, `info`, `admin`.
- `source_type`: optional origin such as `order`, `payment`, `broadcast`, `offer`, `system`.
- `source_id`: optional related id such as order id.
- `event_key`: stable event key for duplicate prevention, such as `order_placed` or `status_delivered`.
- `batch_id`: optional id that groups many user rows from one admin broadcast.
- `action_type`: optional client action such as `open_order`, `open_offer`, or `none`.
- `action_payload`: optional JSON string for navigation data, such as `{ "orderId": 12 }`.
- `read_at`: when customer opened/read notifications.
- `seen_at`: when customer has seen it in notification list. If using only one state, `read_at` is enough.
- `created_by_admin_id`: admin id for manual broadcasts.
- `deleted_at`: soft delete for customer clearing notification.

### Suggested indexes
- `INDEX idx_notifications_user_created (user_id, created_at)`
- `INDEX idx_notifications_user_read (user_id, read_at)`
- `INDEX idx_notifications_source (source_type, source_id)`
- `INDEX idx_notifications_batch (batch_id)`
- `INDEX idx_notifications_deleted (deleted_at)`
- Optional unique index for order event dedupe:
  - `UNIQUE KEY uniq_notification_event (user_id, source_type, source_id, event_key)`

### Suggested table: `notification_batches`
Use this for admin broadcasts so Admin Manager can show one row per broadcast instead of thousands of per-user notification rows.

### Fields
- `id`
- `title`
- `body`
- `type`
- `target`
- `recipient_count`
- `created_by_admin_id`
- `created_at`
- `deleted_at`

### Batch table subtasks
- [ ] Add `notification_batches` table in migration.
- [ ] Link broadcast notification rows to `notification_batches.id`.
- [ ] Use batch rows for admin recent broadcast list.
- [ ] Keep per-user rows for read/unread state.

### Subtasks
- [ ] Add migration in `Backend-V1/src/db/migrate.js`.
- [ ] Create `notifications` table if missing.
- [ ] Keep nullable fields nullable for flexibility.
- [ ] Use soft delete with `deleted_at`.
- [ ] Add indexes for user list and unread count performance.
- [ ] Add `event_key` and dedupe index for order-event notifications.
- [ ] Add `batch_id` support for admin broadcast grouping.
- [ ] Add optional `action_type` and `action_payload` for future deep links.
- [ ] Decide whether `seen_at` and `read_at` both are needed.
- [ ] If only one state is required, use `read_at` and omit `seen_at`.

### Things to avoid
- [ ] Do not store one broadcast row with no per-user state if read/unread is per user.
- [ ] Do not list per-user broadcast rows directly in Admin Manager recent broadcast page.
- [ ] Do not hard delete user notifications by default.
- [ ] Do not make `source_id` required because admin broadcasts may not have one.

### Testing checklist
- [ ] Migration can run multiple times safely.
- [ ] Existing database data remains intact.
- [ ] New table appears in MySQL.
- [ ] Indexes exist.

---

## 3. Backend Notification Utility

### Goal
Create one reusable backend notification helper used by order controllers and admin controllers.

### Files likely added
- `Backend-V1/src/utils/notificationService.js`

### Required helper functions
- `createNotification({ userId, title, body, type, sourceType, sourceId, createdByAdminId })`
- `createManyNotifications(notifications)`
- `createOrderNotification({ userId, order, event })`
- `createBroadcastNotification({ title, body, type, createdByAdminId, targetUserIds })`
- `getUnreadCount(userId)`
- `markAllRead(userId)`
- `softDeleteNotification(userId, notificationId)`
- `createNotificationBatch({ title, body, type, target, recipientCount, createdByAdminId })`

### Order notification templates
- Order placed:
  - Title: `Order placed`
  - Body: `Your order #{orderNumber} has been placed successfully.`
  - Type: `order`
- Order accepted/preparing:
  - Title: `Order accepted`
  - Body: `Your order #{orderNumber} is being prepared.`
  - Type: `info`
- Out for delivery:
  - Title: `Out for delivery`
  - Body: `Your order #{orderNumber} is on the way.`
  - Type: `warning`
- Delivered:
  - Title: `Order delivered`
  - Body: `Your order #{orderNumber} has been delivered.`
  - Type: `success`
- Cancelled:
  - Title: `Order cancelled`
  - Body: `Your order #{orderNumber} was cancelled.`
  - Type: `warning`
- Payment paid:
  - Title: `Payment received`
  - Body: `Payment for order #{orderNumber} has been marked paid.`
  - Type: `success`
- Payment failed:
  - Title: `Payment failed`
  - Body: `Payment for order #{orderNumber} failed. Please contact support.`
  - Type: `warning`
- Payment refunded:
  - Title: `Payment refunded`
  - Body: `Payment for order #{orderNumber} has been refunded.`
  - Type: `info`

### Subtasks
- [ ] Build helper using MySQL `pool`.
- [ ] Support passing a transaction connection from order creation/update.
- [ ] Accept `eventKey`, `batchId`, `actionType`, and `actionPayload`.
- [ ] Make notification creation failure non-blocking where appropriate.
- [ ] Log notification errors server-side without crashing order flow.
- [ ] Normalize order status names before matching templates.
- [ ] Avoid duplicate notifications for same `source_type`, `source_id`, and event if controller retries.
- [ ] Add optional idempotency key if needed:
  - [ ] `event_key`
  - [ ] unique index on `(user_id, source_type, source_id, event_key)`

### Things to avoid
- [ ] Do not duplicate notification insert SQL in every controller.
- [ ] Do not send the same notification twice for one status update.
- [ ] Do not expose admin-only notification data to customers.
- [ ] Do not create notification rows for users that do not exist.

### Testing checklist
- [ ] Helper creates notification.
- [ ] Helper creates many notifications.
- [ ] Helper handles missing optional fields.
- [ ] Duplicate prevention works if implemented.
- [ ] Notification failure does not break order placement.

---

## 4. Customer Notification APIs

### Goal
Give mobile app APIs to list, count, mark read, and delete notifications.

### Suggested files
- `Backend-V1/src/controllers/notificationController.js`
- `Backend-V1/src/routes/notificationRoutes.js`
- `Backend-V1/src/app.js`

### Routes
- `GET /api/notifications`
- `GET /api/notifications/unread-count`
- `PATCH /api/notifications/read-all`
- `PATCH /api/notifications/:id/read`
- `DELETE /api/notifications/:id`

### Auth
- All customer notification routes require `requireCustomer`.

### `GET /api/notifications` query params
- `page`
- `limit`
- `unreadOnly`

### `GET /api/notifications` response
- `data`: notification list
- `pagination`
- `unreadCount`

### Notification response fields
- `id`
- `title`
- `body`
- `type`
- `sourceType`
- `sourceId`
- `actionType`
- `actionPayload`
- `read`
- `readAt`
- `createdAt`
- `timeAgo` if backend already has helper, otherwise compute on frontend

### Mark-as-read behavior
- Opening notification screen should call `PATCH /api/notifications/read-all`.
- If using `seen_at`, opening should set `seen_at`; reading detail can set `read_at`.
- If using only `read_at`, opening screen marks all as read.

### Subtasks
- [ ] Add notification routes to `app.js` under `/api/notifications`.
- [ ] Implement list API with pagination.
- [ ] Exclude rows where `deleted_at IS NOT NULL`.
- [ ] Ensure customer can only access their own notifications.
- [ ] Implement unread count API.
- [ ] Implement mark all read API.
- [ ] Implement mark single read API.
- [ ] Implement soft delete API.
- [ ] Return consistent API response shape matching existing frontend mappers.
- [ ] Return latest first using `created_at DESC`.
- [ ] Include `unreadCount` in list response to avoid an extra request after opening screen.
- [ ] Hide batch/admin metadata that the customer does not need.

### Things to avoid
- [ ] Do not let a user read/delete another user notification.
- [ ] Do not return admin internal ids unless needed.
- [ ] Do not require a notification detail screen for this phase.
- [ ] Do not mark deleted notifications as read.

### Testing checklist
- [ ] List returns only current customer notifications.
- [ ] Unread count is correct.
- [ ] Mark all read updates unread count to zero.
- [ ] Delete hides notification but does not hard delete.
- [ ] Pagination works.
- [ ] Unauthorized users receive `401`.

---

## 5. Automatic Order Notifications

### Goal
Create notifications when important order events happen.

### Backend files likely changed
- `Backend-V1/src/controllers/orderController.js`
- `Backend-V1/src/controllers/adminController.js`
- `Backend-V1/src/utils/notificationService.js`

### Trigger points
- Customer places order.
- Admin changes order status.
- Customer cancels order.
- Admin changes payment status.

### Subtasks
- [ ] On successful order creation, create `Order placed` notification for customer.
- [ ] Use `action_type = open_order` and `action_payload = { orderId }` for order notifications.
- [ ] On customer cancel, create `Order cancelled` notification.
- [ ] On admin status update:
  - [ ] Load current order before update.
  - [ ] Compare old status and new status.
  - [ ] Only create notification if status actually changed.
  - [ ] Create matching notification for customer.
- [ ] On admin payment update:
  - [ ] Load current payment status before update.
  - [ ] Compare old and new payment status.
  - [ ] Create matching payment notification only if changed.
- [ ] Use order number in notification body.
- [ ] Fallback to order id if order number is missing.
- [ ] Use order id as `source_id`.
- [ ] Use `source_type = order`.
- [ ] Add event key such as:
  - [ ] `order_placed`
  - [ ] `status_preparing`
  - [ ] `status_out_for_delivery`
  - [ ] `status_delivered`
  - [ ] `status_cancelled`
  - [ ] `payment_paid`
  - [ ] `payment_failed`
  - [ ] `payment_refunded`

### Things to avoid
- [ ] Do not create status notification when admin saves same status.
- [ ] Do not create duplicate delivered notifications on repeated delivered update.
- [ ] Do not create order placed notification before order transaction commits.
- [ ] Do not rollback order if notification insert fails after order commit.
- [ ] Do not notify customer if admin attempted update but backend validation rejected it.
- [ ] Do not notify on internal/order note changes unless explicitly added later.

### Testing checklist
- [ ] Order placement creates notification.
- [ ] Admin preparing update creates notification.
- [ ] Admin out-for-delivery update creates notification.
- [ ] Admin delivered update creates notification.
- [ ] Customer cancellation creates notification.
- [ ] Admin payment paid update creates notification.
- [ ] Updating to the same status creates no duplicate.
- [ ] Customer sees notification in mobile app.

---

## 6. Admin Broadcast Notifications

### Goal
Allow admin to send manual notifications to customers from Admin Manager web.

### Backend routes
- `GET /api/admin/notifications`
- `POST /api/admin/notifications`
- `GET /api/admin/notifications/:id`
- `DELETE /api/admin/notifications/:id`

### Admin list behavior
- `GET /api/admin/notifications` should list `notification_batches`, not every per-user row.
- Admin detail can show:
  - Broadcast title/body/type
  - Target
  - Recipient count
  - Created by
  - Created date
  - Optional read count if easy to calculate

### Broadcast target options
Phase 1:
- Everyone active customer

Phase 2 optional:
- Trusted customers only
- Customers with orders
- Customers by phone search
- Single selected customer
- Customers who have not ordered recently

### `POST /api/admin/notifications` body
- `title`
- `body`
- `type`
- `target`
- `customerIds` optional

### Valid `type`
- `info`
- `offer`
- `warning`
- `success`
- `admin`

### Subtasks
- [ ] Add admin notification controller functions.
- [ ] Add validation in `adminRoutes.js`.
- [ ] Require admin auth for all admin notification APIs.
- [ ] Add `auditLog` to notification send/delete routes.
- [ ] Add rate limit for sending notifications if needed.
- [ ] For everyone target, fetch all active unblocked users.
- [ ] Create one `notification_batches` row.
- [ ] Insert one notification row per target user with the same `batch_id`.
- [ ] Batch inserts in chunks, suggested 500 users per insert.
- [ ] Use a transaction for batch row plus notification rows.
- [ ] Return recipient count in response.
- [ ] Add list API so admin can see previous broadcasts.
- [ ] Add delete/hide broadcast API if admin sent mistake.
- [ ] Delete/hide broadcast should soft-delete batch and related unread/read rows from customer view.

### Things to avoid
- [ ] Do not send to blocked users unless explicitly needed.
- [ ] Do not allow empty title/body.
- [ ] Do not allow extremely long notification body.
- [ ] Do not block admin UI for too long if customer count grows; batch inserts.
- [ ] Do not expose customer private data in broadcast list.
- [ ] Do not create a batch if there are zero recipients.
- [ ] Do not send broadcast twice on browser retry without a new submit action if idempotency key is added.

### Testing checklist
- [ ] Admin can send notification to everyone.
- [ ] Blocked customers do not receive broadcast.
- [ ] Recipient count is accurate.
- [ ] Customer mobile app receives broadcast.
- [ ] Admin broadcast appears in admin list.
- [ ] Admin route rejects invalid body.

---

## 7. Admin Manager UI

### Goal
Add a professional admin page to send and review notifications.

### Files likely changed
- `adminManager-V1/src/api/index.js`
- `adminManager-V1/src/App.jsx`
- `adminManager-V1/src/components/Sidebar.jsx`
- `adminManager-V1/src/pages/Notifications.jsx`
- `adminManager-V1/src/pages/Notifications.css`

### Page layout
- Left nav item: `Notifications`
- Page title: `Notifications`
- Top card: send notification form
- Bottom section: recent sent notifications

### Send form fields
- Title input
- Body textarea
- Type select
- Target select
- Preview card
- Send button

### Form validation
- Title required.
- Body required.
- Title max length, suggested 80.
- Body max length, suggested 240.
- Type required.
- Target required.
- Disable send while saving.
- Confirm before sending to everyone.

### Recent notifications table/card list
- Title
- Body preview
- Type
- Recipient count
- Sent by
- Created date

### Subtasks
- [ ] Add `NotificationsApi` in admin API client.
- [ ] Add route in admin app.
- [ ] Add sidebar nav item.
- [ ] Create notifications page.
- [ ] Build send form.
- [ ] Build preview card.
- [ ] Build recent broadcasts list.
- [ ] Show loading state.
- [ ] Show empty state.
- [ ] Show validation errors clearly.
- [ ] Show success toast/message after send.
- [ ] Refresh recent list after send.

### Things to avoid
- [ ] Do not put admin notification controls in mobile app.
- [ ] Do not require page refresh after sending.
- [ ] Do not send duplicate request on double click.
- [ ] Do not expose raw backend errors without friendly message.

### Testing checklist
- [ ] Admin page loads.
- [ ] Admin can type notification.
- [ ] Preview updates.
- [ ] Validation blocks empty form.
- [ ] Send to everyone works.
- [ ] Success message appears.
- [ ] Recent list updates.
- [ ] Admin build/lint passes.

---

## 8. Mobile API Layer

### Goal
Connect mobile notification UI to backend APIs.

### Files likely changed
- `Frontend-V1/src/api/notificationsApi.js`
- `Frontend-V1/src/api/index.js`
- `Frontend-V1/src/utils/apiMappers.js`
- `Frontend-V1/src/screens/customer/NotificationsScreen/NotificationsScreen.js`
- `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js`

### Mobile API methods
- `notificationsApi.list(params)`
- `notificationsApi.getUnreadCount()`
- `notificationsApi.markAllRead()`
- `notificationsApi.markRead(id)`
- `notificationsApi.delete(id)`

### Suggested mobile state
Use either a small Zustand store or local screen state plus HomeScreen state.

Recommended store:
- `Frontend-V1/src/stores/useNotificationsStore.js`

Store state:
- `items`
- `unreadCount`
- `loading`
- `error`
- `lastFetchedAt`

Store actions:
- `fetchNotifications`
- `fetchUnreadCount`
- `markAllRead`
- `deleteNotification`
- `resetNotificationsOnLogout`

### Normalized notification model
- `id`
- `title`
- `body`
- `type`
- `sourceType`
- `sourceId`
- `actionType`
- `actionPayload`
- `read`
- `createdAt`
- `timeLabel`

### Subtasks
- [ ] Create notifications API module.
- [ ] Export it from API index.
- [ ] Add notification mapper.
- [ ] Replace `MOCK_NOTIFICATIONS` with API data.
- [ ] Load notifications on screen focus.
- [ ] Call `markAllRead` when notifications screen opens successfully.
- [ ] Update local state after mark read.
- [ ] Delete notification through API, then remove from local state.
- [ ] If using notification store, clear it on logout.
- [ ] If unauthenticated, do not call notification APIs.
- [ ] If unauthenticated user taps bell, route to login/auth flow or show a friendly auth prompt.
- [ ] Support notification tap behavior:
  - [ ] If `actionType = open_order`, navigate to `OrderDetail`.
  - [ ] If no action, keep current row non-navigation or simply mark read.
- [ ] Show loading skeleton.
- [ ] Show empty state.
- [ ] Show error/retry state.

### Things to avoid
- [ ] Do not mark all read before list loads if API failed.
- [ ] Do not clear notification locally if delete API failed.
- [ ] Do not keep mock fallback in production.
- [ ] Do not require push notification permissions for this in-app phase.
- [ ] Do not show another user's notifications after logout/login switch.

### Testing checklist
- [ ] Notifications screen loads backend data.
- [ ] Opening screen marks unread as read.
- [ ] Delete hides notification.
- [ ] Empty state appears.
- [ ] Error state appears on API failure.
- [ ] Frontend lint passes.

---

## 9. Mobile Bell Badge And Seen State

### Goal
Make dashboard bell show unread notification state and clear it after opening notifications.

### Current issue
Home bell always shows a small badge/glow even if there are no notifications.

### Desired behavior
- Show badge only when unread count > 0.
- Badge may show count if count is small.
- Badge may show `9+` if count > 9.
- Pulse/glow only when unread count > 0.
- Opening notifications screen marks notifications read.
- Returning to dashboard should hide badge after unread count becomes 0.
- If user is not logged in, do not show unread badge and do not call unread API.

### Files likely changed
- `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js`
- `Frontend-V1/src/screens/customer/NotificationsScreen/NotificationsScreen.js`
- `Frontend-V1/src/api/notificationsApi.js`

### Subtasks
- [ ] Add unread count state on HomeScreen.
- [ ] Fetch unread count when HomeScreen focuses.
- [ ] Fetch unread count after returning from Notifications screen.
- [ ] Fetch unread count after login/profile load if HomeScreen stays mounted.
- [ ] Clear unread count on logout.
- [ ] Only render badge when unread count > 0.
- [ ] Render count text or dot based on design.
- [ ] Stop pulse loop when unread count is 0.
- [ ] Keep bell press navigation unchanged.
- [ ] Refresh unread count after notification mark-all-read.

### Things to avoid
- [ ] Do not animate bell forever when there are no unread notifications.
- [ ] Do not show fake badge.
- [ ] Do not make unread count block dashboard loading.
- [ ] Do not show stale unread count from a previous user.

### Testing checklist
- [ ] No unread notifications means no badge.
- [ ] Unread notifications show badge.
- [ ] Badge hides after opening notifications.
- [ ] Bell still opens notifications.
- [ ] Home dashboard still loads even if unread API fails.

---

## 10. Optional Real Push Notifications

### Goal
Plan future phone push notifications without blocking in-app notifications.

### Important note
This phase is optional. First implement in-app notifications using backend APIs. Push notifications can come after.

### Possible approach
- Use Expo push notifications if app remains Expo.
- Store device push tokens per user.
- Add table `user_push_tokens`.
- Register token after login.
- Send push when notification row is created.

### Subtasks
- [ ] Decide push provider.
- [ ] Add push token registration API.
- [ ] Store device token with user id and platform.
- [ ] Remove token on logout if possible.
- [ ] Send push for order status notifications.
- [ ] Send push for admin broadcasts.
- [ ] Handle push send failure without deleting in-app notification.
- [ ] Add opt-out setting if needed.

### Things to avoid
- [ ] Do not require push permission for in-app notifications.
- [ ] Do not fail order flow if push provider is down.
- [ ] Do not store duplicate tokens forever.

### Testing checklist
- [ ] Device token registers.
- [ ] Push arrives for order status update.
- [ ] Push arrives for admin broadcast.
- [ ] In-app notification still exists even if push fails.

---

## 11. Error Handling And Edge Cases

### Goal
Make notifications reliable and understandable.

### Edge cases
- User has no notifications.
- User has many notifications.
- Notification API fails.
- User is logged out.
- User logs out and another user logs in on same phone.
- Admin sends invalid title/body.
- Admin sends duplicate broadcast accidentally.
- Admin browser retries the same broadcast request.
- Order status updated to same value.
- Order deleted/old order not found.
- Customer deleted or blocked.
- Notification created but push fails.
- Customer opens notifications from multiple devices.
- Customer deletes notification then API refreshes.
- Broadcast send partially fails halfway through.
- MySQL transaction rolls back during broadcast.

### Subtasks
- [ ] Add pagination to mobile list.
- [ ] Add pull-to-refresh if desired.
- [ ] Handle stale notification source ids gracefully.
- [ ] Use soft delete so deleted notifications do not return.
- [ ] Make mark-all-read idempotent.
- [ ] Make delete idempotent or return clear 404.
- [ ] Prevent duplicate order-event notifications.
- [ ] Admin broadcast should show recipient count.
- [ ] Admin broadcast to zero users should be blocked with clear message.
- [ ] Use transaction or chunking strategy so partial broadcast sends are not left inconsistent.
- [ ] Add retry-safe behavior for admin send if an idempotency key is implemented.

### Things to avoid
- [ ] Do not crash on missing order source.
- [ ] Do not show deleted notification after refresh.
- [ ] Do not spam duplicate notifications.
- [ ] Do not leak previous user's notifications after logout.

### Testing checklist
- [ ] Empty notification list works.
- [ ] Mark read twice works.
- [ ] Delete then refresh keeps item hidden.
- [ ] Same status update does not create duplicate.
- [ ] Broadcast to zero recipients returns validation error.

---

## 12. Backend Tests

### Goal
Verify notification APIs and event creation.

### Suggested test files
- `Backend-V1/tests/notifications.test.js`
- Update order/admin tests if needed.

### Subtasks
- [ ] Test customer cannot access notifications without login.
- [ ] Test customer lists only their notifications.
- [ ] Test one customer cannot read/delete another customer's notification.
- [ ] Test unread count.
- [ ] Test mark all read.
- [ ] Test delete notification.
- [ ] Test order placement creates notification.
- [ ] Test admin order status update creates notification.
- [ ] Test same status update does not duplicate notification.
- [ ] Test admin broadcast creates rows for all active customers.
- [ ] Test admin broadcast creates one batch row.
- [ ] Test admin broadcast list returns batch rows, not per-user rows.
- [ ] Test blocked users are excluded from broadcast.
- [ ] Test invalid admin broadcast is rejected.
- [ ] Test broadcast with zero recipients is rejected.
- [ ] Test order notification includes `action_type = open_order`.

### Testing checklist
- [ ] Backend test suite passes.
- [ ] No existing auth/order/admin tests regress.
- [ ] Notification tests clean up test rows.

---

## 13. Frontend Testing

### Goal
Verify customer and admin notification flows.

### Customer app tests
- [ ] Bell badge appears when unread notifications exist.
- [ ] Bell badge does not appear when unread count is zero.
- [ ] Bell badge does not appear when logged out.
- [ ] Notifications screen lists backend notifications.
- [ ] Opening notifications marks them read.
- [ ] Returning to dashboard hides badge.
- [ ] Delete notification works.
- [ ] Logout clears notification store/unread count.
- [ ] Login as different user does not show previous user notifications.
- [ ] Empty state works.
- [ ] Error retry works.

### Admin Manager tests
- [ ] Notifications nav item appears.
- [ ] Send form validates required fields.
- [ ] Admin can send broadcast to everyone.
- [ ] Recent broadcasts list refreshes.
- [ ] Invalid broadcast shows error.

### Build checks
- [ ] `npm run lint` in `Frontend-V1`
- [ ] `npm run lint` in `adminManager-V1`
- [ ] `npm run build` in `adminManager-V1`

---

## 14. Final Verification

### Goal
Confirm full notification system works end to end.

### Subtasks
- [ ] Start `Backend-V1`.
- [ ] Start `Frontend-V1`.
- [ ] Start `adminManager-V1`.
- [ ] Login as customer.
- [ ] Place order from mobile app.
- [ ] Confirm `Order placed` notification exists.
- [ ] Open notifications screen.
- [ ] Confirm notifications mark read automatically.
- [ ] Confirm dashboard bell badge disappears after read.
- [ ] Login as admin.
- [ ] Change order status to Preparing.
- [ ] Confirm customer receives order status notification.
- [ ] Change order status to Delivered.
- [ ] Confirm customer receives delivered notification.
- [ ] Send admin broadcast to everyone.
- [ ] Confirm customer receives broadcast notification.
- [ ] Delete one notification on customer app.
- [ ] Refresh screen and confirm it stays deleted.
- [ ] Run backend tests.
- [ ] Run frontend lint.
- [ ] Run admin build/lint.
- [ ] Run `graphify update .`.

### Acceptance criteria
- [ ] Notifications are stored in backend database.
- [ ] Admin broadcasts are grouped by batch for admin history.
- [ ] Mobile notification screen no longer uses mock data.
- [ ] Dashboard bell badge reflects unread count.
- [ ] Opening notifications marks them read automatically.
- [ ] Order events create customer notifications.
- [ ] Duplicate order status updates do not create duplicate notifications.
- [ ] Admin can broadcast notification to everyone.
- [ ] Blocked users do not receive admin broadcast.
- [ ] Notification APIs are protected by auth.
- [ ] Logging out clears notification state on mobile.
- [ ] Existing order, dashboard, cart, and profile flows remain working.
