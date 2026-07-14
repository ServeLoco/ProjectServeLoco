# Order lifecycle — place → delivery / cancel (all cases)

**Source of truth:** current code on branch `feat/mapboxTracking` (as of 2026-07-14; updated same day for the shop-confirm → auto-`Preparing` change, see §3.3/§6.3/§9).  
**Primary modules:**

| Area | Path |
|------|------|
| Place / customer cancel | `apps/api/src/controllers/orderController.js` |
| Platform auto-accept | `apps/api/src/realtime/orderAutoAccept.js` |
| Admin status | `apps/api/src/controllers/adminController.js` |
| Shop confirm/reject/ready | `apps/api/src/controllers/shopOwnerController.js` |
| All-shops-reject auto-cancel | `apps/api/src/utils/shops.js` → `maybeAutoCancelOrderWhenAllShopsRejected` |
| Rider assignment engine | `apps/api/src/services/riderAssignment.js` |
| Rider eligibility | `apps/api/src/utils/riders.js` |
| Rider HTTP | `apps/api/src/controllers/riderController.js` |
| Offer sweeper | `apps/api/src/realtime/riderOfferSweeper.js` |
| Admin mobile new-order popup | `apps/customer-app/src/screens/admin/AdminNewOrderPopup.js` |
| Admin mobile cancel-request popup | `apps/customer-app/src/screens/admin/AdminCancelRequestPopup.js` |
| Rider UI | `apps/customer-app/src/screens/rider/*` |

---

## 1. Status enums (database)

### `orders.status` (forward lifecycle)

```
Pending → Accepted → Preparing → Out for Delivery → Delivered
                  ↘ Cancelled (from several points — see §6)
```

| Status | Meaning |
|--------|---------|
| `Pending` | Just placed; waiting platform accept |
| `Accepted` | Platform accepted (admin or auto); shops notified |
| `Preparing` | Admin (or flow) marked preparing; shops may still confirm |
| `Out for Delivery` | En route to customer |
| `Delivered` | Terminal success (`delivered_at` stamped) |
| `Cancelled` | Terminal failure |

Status updates use **compare-and-set**; concurrent change → **409 `CONCURRENCY_CONFLICT`**.

### `orders.payment_status`

`Pending` | `Paid` | `Failed` | `Refunded`

On cancel: **UPI → `Refunded`**, otherwise → **`Failed`** (customer cancel, admin cancel, all-shops auto-cancel).

### `orders.rider_assignment_status`

| Value | Meaning |
|-------|---------|
| `none` | Assignment not started |
| `searching` | Engine picking / between offers / **waiting for riders to come online** (10-min window) |
| `offered` | Exactly one pending offer exists |
| `assigned` | Rider accepted (`rider_id` set) |
| `failed` | Search window ended with no assignment — **order is NOT auto-cancelled** |

Also: `orders.rider_search_started_at` is stamped once when assignment first enters `searching` (all shops confirmed or house-only Accepted). It is the clock for the 10-minute wait.

### Shop line flags (`order_items`)

| Column | Meaning |
|--------|---------|
| `shop_confirmed_at` | Shop accepted its lines |
| `shop_rejected_at` | Shop rejected its lines |
| `shop_ready_at` | Shop marked ready for pickup |

Shop actions do **not** change `orders.status` (except all-shops reject → auto-cancel).

### Offer row (`rider_order_offers.status`)

`pending` → `accepted` | `rejected` | `expired` | `cancelled`

---

## 2. Happy path (end-to-end)

```
Customer places order
        │
        ▼
 status = Pending
 rider_assignment_status = none
 payment_status = Pending
        │
        ├─ Admin Accept (or jump to Preparing)
        └─ Auto-accept after 120s (still Pending)
        │
        ▼
 status = Accepted (or Preparing)
 Shops notified if order has shop items
        │
   ┌────┴────────────────────────────┐
   │                                 │
 HOUSE-ONLY                      HAS SHOP ITEMS
 (no shop_id lines)              (one or more shops)
   │                                 │
   ▼                                 ▼
 startAssignment()            Each shop: Confirm / Reject / Ready
 immediately on accept        Confirm timestamps on order_items
   │                                 │
   │                          ALL shops confirmed?
   │                                 │ yes
   │                                 ▼
   └──────────────► startAssignment()
                    │
                    ▼
           rider_assignment_status = searching
           stamp rider_search_started_at
                    │
          ┌─────────┴──────────┐
          │                    │
     eligible rider(s)    none online yet
          │                    │
          ▼                    ▼
       offered            wait up to 10 min
       5 min timer        re-scan ~every 30s
          │               (sweeper ~5s)
          │                    │
          │              rider becomes active?
          │               yes → offered
          │               no after 10 min → failed
          │                    (admin popup; order open)
          ▼
           Rider ACCEPTS
           rider_id set · status = assigned
           Customer + shops notified
                    │
                    ▼
           Rider: Mark picked up
           (rider_picked_up_at)
                    │
                    ▼
           Rider/Admin: Out for Delivery
                    │
                    ▼
           Rider/Admin: Delivered
           (delivered_at) · TERMINAL SUCCESS
```

---

## 3. Phase-by-phase detail

### 3.1 Customer places order

**Code:** `createOrder` in `orderController.js`

| Field | Initial value |
|-------|----------------|
| `status` | `Pending` |
| `payment_status` | `Pending` |
| `rider_id` | `NULL` |
| `rider_assignment_status` | `none` (default) |

**Side effects:**

1. Customer notification: `order_placed`
2. Realtime: order created → admins (`admin.order.created`) + inbox `NEW_ORDER`
3. Mobile admin **New Order** popup queue
4. **Auto-accept timer** scheduled: **120 seconds** (`orderAutoAccept.AUTO_ACCEPT_MS`)

**Gates before place (typical):** delivery available, shop open, cart/coupon validation, etc. (not re-listed here).

---

### 3.2 Platform accept

Two equivalent triggers:

| Trigger | When | Code |
|---------|------|------|
| **Admin** | PATCH order status → `Accepted` or `Preparing` while was `Pending` | `adminController` |
| **Auto-accept** | Still `Pending` after 120s | `orderAutoAccept.schedule` |

On leave-`Pending` → `Accepted` / `Preparing`:

1. Customer notify: `status_accepted` (and status events as applicable)
2. `notifyShopsForOrder` — shop owners get socket + push for their lines
3. **House-only** (no `order_items.shop_id`):  
   `startAssignmentIfHouseOnly(orderId)` → rider engine starts **immediately**
4. **With shops:** assignment does **not** start yet

**Boot rehydrate:** API startup auto-accepts old `Pending` orders older than 120s (`rehydratePendingOrders`). Live house-only start runs on the live timer path; rehydrate notifies customer similarly.

---

### 3.3 Shops (if any)

**Confirm** — `PATCH .../confirm`  
- Sets `shop_confirmed_at` on this shop’s lines (idempotent)  
- Emits `admin.order.shop_confirmed`  
- **If `orders.status` is still `Accepted`, the FIRST shop confirm (any shop, not all)
  compare-and-sets it to `Preparing`** and emits `status_preparing` to the customer
  (`shopOwnerController.confirmMyOrder`). Re-confirming after that, or confirms from
  other shops on the same order, are no-ops on `orders.status` (already `Preparing`).
- Calls `maybeStartRiderAssignment(orderId)`  
  - Starts only when **every shop** on the order has **all** its lines confirmed  
  - If any shop fully rejected → no start (`shop_rejected`)  
  - If any shop still incomplete → `waiting_shops`
  - **Independent of the status transition above** — rider assignment still waits
    for ALL shops even though the customer already sees "Preparing" after the first.

**Reject** — `PATCH .../reject`  
- Sets `shop_rejected_at`  
- Admin inbox: `SHOP_REJECTED`  
- If **every** shop has fully rejected all its lines → **auto-cancel order**  
  (`maybeAutoCancelOrderWhenAllShopsRejected`)

**Ready** — `PATCH .../ready`  
- Sets `shop_ready_at` (requires prior confirm)  
- Informational only — **does not** start rider assignment

**Multi-shop examples:**

| Situation | Rider assignment |
|-----------|------------------|
| Shop A confirmed, Shop B not yet | Waiting |
| All shops confirmed | Starts |
| Shop A rejects all its lines, Shop B still open | No auto-cancel yet; assignment won’t start while any shop unconfirmed/rejected |
| All shops fully reject | Order **auto-cancelled** |

---

### 3.4 Rider assignment engine

**Code:** `riderAssignment.js`  
**Config defaults** (`env.js`):

| Setting | Default |
|---------|---------|
| Offer timeout | **300s (5 min)** `RIDER_OFFER_TIMEOUT_SEC` |
| Search window (wait for riders) | **600s (10 min)** `RIDER_SEARCH_WINDOW_SEC` |
| Search re-scan interval (product) | **30s** `RIDER_SEARCH_SCAN_SEC` |
| Heartbeat freshness | **90s** `RIDER_HEARTBEAT_TTL_SEC` |
| Sweeper interval | **5s** `RIDER_SWEEPER_MS` (actual re-scan cadence ≤ product 30s) |
| “Today” for least-orders | `+05:30` `RIDER_TODAY_TZ` |

#### Who is eligible?

ALL of:

1. `riders.active = 1`
2. `riders.is_online = 1`
3. `last_heartbeat_at` within 90s
4. No **other pending offer** for this rider (any order)
5. Not already in `rider_order_offers` for **this order** (any status — reject/timeout/cancel forever for that order)

**Multi-order allowed:** having other open assignments does **not** block eligibility or accept.

#### Who is chosen?

Among eligible:

1. Least **completed deliveries today** (`status = Delivered`, day boundary in `RIDER_TODAY_TZ`)
2. Tie → **random**

Exactly **one** rider offered at a time (one pending offer per order).

#### Offer lifecycle

| Event | Offer status | Next |
|-------|--------------|------|
| Create | `pending`, `expires_at = NOW()+300s` | Order → `offered`; socket `rider.offer.created` + Expo push |
| Accept | `accepted` | Order `rider_id`, `assigned`, `rider_assigned_at` |
| Reject (manual) | `rejected` (`manual`) | Rider excluded; `continueAssignment` |
| Timeout | `expired` (`timeout`) | Same as reject chain; `rider.offer.expired` |
| External cancel | `cancelled` (`admin`) | `rider.offer.revoked` |

**Reject / timeout / empty eligible pool:**

1. Try next eligible (excluding all prior offer riders for this order)
2. If none **and** still inside the 10-min search window → stay `searching` (wait; sweeper re-scans)
3. If none **and** search window expired → **`failAssignment`** (see §3.5) — **does not cancel order**

#### Wait-for-riders window (no instant fail)

After all shops confirm (or house-only Accepted), if **zero eligible riders** (all offline / none active):

| Step | Behavior |
|------|----------|
| Enter search | `rider_assignment_status = searching`, stamp `rider_search_started_at` (once) |
| Instant fail? | **No** — do not call `failAssignment` yet |
| Re-scan | Sweeper (~every 5s) runs `recoverStuckAssignments` → `continueAssignment` |
| Rider comes online | If eligible (active + online + fresh heartbeat + not already offered this order) → create offer, normal flow |
| After 10 min still empty | `failAssignment` → admin cancel-request popup (order still not auto-cancelled) |

Same wait applies mid-chain: if every offered rider rejected/timed out and no other online riders remain, engine waits until the **original** 10-min window from `rider_search_started_at` ends before failing.

**Offline mid-offer:** offer stays pending until accept / reject / timeout. Going offline does **not** auto-reject.

**Accept edge cases:**

| Case | Result |
|------|--------|
| Offer not pending | 409 |
| Wrong rider | 403 |
| Expired at accept time | Mark expired → continue chain → 409 |
| Order already cancelled / delivered / has rider | Cancel offer → 409 |
| Rider already has other jobs | **Allowed** (multi-order) |

**Post-accept cancel by rider:** **disabled**  
API: `CANCEL_NOT_ALLOWED` (400). No cancel button in rider app.

#### Recovery

- **Sweeper** every 5s: expire due offers; `recoverStuckAssignments` for `searching`/`offered` with no pending offer and no rider (crash mid-create **or** waiting for riders)
- Process restart: same sweeper on boot
- Window-open + empty pool → `waiting`; window-closed + empty pool → `failAssignment`

---

### 3.5 Assignment failed (no auto-cancel)

When the **10-min search window expires** with still zero eligible (`No riders available`) or only excluded prior offers (`No rider accepted`):

| Action | Done? |
|--------|-------|
| Set `rider_assignment_status = failed` | Yes |
| Clear `rider_id` if null path | Yes |
| Revoke pending offers | Yes |
| Cancel `orders.status` | **No** |
| Change payment / coupon | **No** |
| Admin inbox | Yes (`RIDER_ZERO_AVAILABLE` or `RIDER_ASSIGNMENT_FAILED`) |
| Socket `admin.order.cancel_request` | Yes → **Admin mobile Cancel Request popup** |
| Socket `admin.order.rider_updated` failed | Yes |
| Notify shops assignment failed | Yes (best-effort) |
| Re-sync delivery_available from online riders | Yes |

**v1:** engine does **not** auto-restart after `failed`. Admin must:

- **Investigate** (dismiss popup) and deliver / fix manually, or  
- **Cancel order** with a typed reason (popup / order detail)

---

### 3.6 After assigned (delivery)

| Actor | Action | Effect |
|-------|--------|--------|
| Rider | Mark picked up | `rider_picked_up_at`; customer/admin events `picked_up` |
| Rider | Out for Delivery | Status advance; soft-sets pickup if missing |
| Rider | Delivered | Terminal; `delivered_at` |
| Rider | Cancel assignment | **Blocked** always |
| Admin | Any status / cancel | Compare-and-set; notify parties |
| Rider | GPS while assigned | Location update API (map); multi-order supported |

Rider status progression allowed: from `Accepted`/`Preparing` → `Out for Delivery` → `Delivered` (forward-only).

---

## 4. All cancel paths

| # | Who | When allowed | Order status after | Payment | Rider offers | Notes |
|---|-----|--------------|--------------------|---------|--------------|-------|
| C1 | **Customer** | Only while `Pending` | `Cancelled` | UPI→Refunded else Failed | N/A (none yet) | Reason optional; default “Cancelled by customer” |
| C2 | **Admin** | Any non-terminal (via status PATCH) | `Cancelled` | Same payment rule | Pending offers revoked; assigned rider push + socket | Manual reason (web/mobile) |
| C3 | **All shops reject** | Order `Accepted` or `Preparing` | `Cancelled` auto | Same | Revoke offers | Reason: `Auto-cancelled: all shops rejected the order`; admin inbox `ORDER_AUTO_CANCELLED` |
| C4 | **Rider assignment fail** | — | **Not cancelled** | Unchanged | Revoked / none | Admin cancel-request popup; admin cancels via C2 if needed |
| C5 | **Rider post-accept cancel** | — | — | — | — | **Not allowed** |

Customer cannot cancel after `Accepted`.

---

## 5. Delivery availability (related gate)

**Not** the same as assignment, but affects new orders:

- Count of riders: `active` + `online` + heartbeat fresh (90s)
- Count **0** → `settings.delivery_available = OFF` (and shop_open coupling)
- Count **≥1** → ON  
- Busy/multi-order does **not** remove a rider from this count

---

## 6. Case matrix (comprehensive)

### 6.1 Placement & platform

| Case | Outcome |
|------|---------|
| Place success | `Pending`, auto-accept 120s, admin popup + inbox |
| Customer cancel while Pending | Cancelled (C1) |
| Customer cancel after Accepted | Rejected by API |
| Admin Accept within 120s | Accepted; shops + house start if applicable; auto timer cancelled |
| Admin Preparing from Pending | Same shop notify + house start |
| No admin action 120s | Auto Accepted |
| API restart with old Pending | Rehydrate auto-accept |

### 6.2 Order composition

| Case | Rider start trigger |
|------|---------------------|
| House-only (all items `shop_id` null) | On platform accept |
| Single shop | When that shop confirms |
| Multi-shop | When **all** shops confirm all lines |
| Mix house + shop lines | Treated as has shops (wait for shop confirms); house lines have null shop |

### 6.3 Shop outcomes

| Case | Outcome |
|------|---------|
| Confirm (first shop on the order, status was `Accepted`) | `orders.status → Preparing` (customer notified); assignment still `Wait` |
| Confirm (partial multi-shop, status already `Preparing`) | Assignment `Wait` |
| Confirm (last shop) | `startAssignment` |
| Reject (not all shops) | Admin inbox; no assignment start if incomplete |
| All shops reject | Auto-cancel (C3) + revoke offers |
| Ready only | No assignment effect |

### 6.4 Rider pool & offers

| Case | Outcome |
|------|---------|
| 0 eligible at start | `failed` + admin cancel_request; order stays open |
| 1 eligible | Offer that rider 5 min |
| N eligible | Least deliveries today; random tie |
| Rider has N active jobs | Still eligible; can accept more |
| Rider has another pending offer | Not eligible until that offer resolves |
| Reject | Never re-offered this order; next rider |
| Timeout 5 min | Same as reject |
| Offline during offer | Offer remains until timeout/action |
| Accept success | Assigned; multi-job OK |
| Accept expired | Continue chain |
| All riders reject/timeout | `failed` + admin popup; order open |
| Same rider re-offer same order | Forbidden (history exclude) |
| Two pending offers same order | Forbidden |
| Rider tries cancel after accept | 400 `CANCEL_NOT_ALLOWED` |
| Crash mid-searching | Sweeper `recoverStuckAssignments` |
| Admin cancels while offer pending | Offer revoked; rider `rider.offer.revoked` |
| Admin cancels while assigned | Rider notified cancelled |

### 6.5 Delivery completion

| Case | Outcome |
|------|---------|
| Pick up → OFD → Delivered | Success path |
| OFD without explicit pick up | Soft-set `rider_picked_up_at` |
| Admin advances status without rider | Allowed via admin PATCH |
| Admin delivers after assignment `failed` | Manual recovery (investigate path) |
| Concurrent status updates | 409 |

### 6.6 Admin mobile UX

| Event | UI |
|-------|-----|
| New order | `AdminNewOrderPopup` — Accept / Cancel / skip queue; 120s countdown readout |
| Assignment failed | `AdminCancelRequestPopup` — **Investigate** (dismiss) or **Cancel order** with reason |
| Inbox types | `new_order`, `shop_rejected`, `rider_zero_available`, `rider_assignment_failed`, `order_auto_cancelled`, … |

---

## 7. Realtime / notification cheat sheet

| Event / channel | Audience | When |
|-----------------|----------|------|
| `admin.order.created` | Admins | Place |
| `admin.order.auto_accepted` | Admins | Auto-accept |
| `admin.order.shop_confirmed` / ready | Admins | Shop actions |
| `order.status.updated` (`status_preparing`) | Customer | First shop confirm on an `Accepted` order |
| `admin.order.cancel_request` | Admins | Rider assignment failed (no cancel) |
| `admin.order.rider_updated` | Admins | assigned / picked_up / failed |
| `admin.notification.created` | Admins | Inbox row |
| Shop order assigned / cancelled / rider_* | Shop owners | Fan-out via `shops.js` |
| `rider.offer.created` / `.expired` / `.revoked` | Offered rider | Offer lifecycle |
| `rider.assignment.updated` | Customer / rider | assigned / picked_up / cancelled |
| Customer push templates | Customer | `order_placed`, status_*, `rider_assigned`, `rider_picked_up`, … |
| Expo push rider | Rider | New offer (5 min copy) |

---

## 8. Sequence diagrams

### 8.1 Shop order — happy path

```
Customer          API              Admin/Auto         Shop(s)           Rider
   |               |                   |                |                 |
   |-- place ----->|                   |                |                 |
   |               |-- Pending --------|                |                 |
   |               |-- schedule 120s ->|                |                 |
   |               |                   |-- Accept ----->|                 |
   |               |-- notify shops ------------------>|                 |
   |               |                   |                |-- confirm all ->|
   |               |-- startAssignment() --------------|                 |
   |               |-- offer (5 min) ----------------------------------->|
   |               |                   |                |                 |-- accept
   |               |-- assigned ------ | -------------- | <--------------|
   |<- rider_assigned                  |                |                 |
   |               |                   |                |                 |-- pick up
   |               |                   |                |                 |-- OFD
   |               |                   |                |                 |-- Delivered
   |<- delivered   |                   |                |                 |
```

### 8.2 Assignment fail → admin decision

```
API assignment exhausts pool
        │
        ▼
 rider_assignment_status = failed
 order.status UNCHANGED
        │
        ├─► admin.order.cancel_request  ──► Mobile Admin popup
        │                                      ├─ Investigate → dismiss, order open
        │                                      └─ Cancel + reason → status Cancelled
        └─► admin inbox notification
```

### 8.3 All shops reject

```
Shop1 reject + Shop2 reject (all shops)
        │
        ▼
 maybeAutoCancelOrderWhenAllShopsRejected
        │
        ▼
 status = Cancelled
 payment Failed/Refunded
 customer + shops + admin notified
 pending rider offers revoked
```

---

## 9. What is intentionally NOT automatic

| Behavior | Policy in current code |
|----------|------------------------|
| Auto-cancel when no rider | **No** — admin must cancel or deliver |
| Rider cancel after accept | **No** |
| Admin manual pick of rider | **No** — engine only |
| Restart assignment after `failed` | **No** (v1) |
| Multi-broadcast same offer to many riders | **No** — one at a time |
| Re-offer same rider after reject/timeout | **No** |
| Shop confirm changing `orders.status` | **Yes, once** — first shop confirm on an `Accepted` order auto-sets `Preparing` (customer-visible without waiting for every shop). Rider assignment start is unaffected — still gated on ALL shops confirming. |

---

## 10. Key timers (quick ref)

| Timer | Duration | Owner |
|-------|----------|-------|
| Platform auto-accept | **120s** | `orderAutoAccept` |
| Rider offer | **300s (5 min)** | `riderAssignment` + DB `expires_at` |
| Rider heartbeat eligible | **90s** | `riders` util |
| Offer sweeper tick | **5s** | `riderOfferSweeper` |

---

## 11. File index for implementers

```
apps/api/src/
  controllers/orderController.js      # place, customer cancel
  controllers/adminController.js      # status, cancel, house start
  controllers/shopOwnerController.js  # confirm/reject/ready
  controllers/riderController.js      # offers, assignments, status
  services/riderAssignment.js         # engine
  utils/riders.js                     # eligibility + least-orders
  utils/shops.js                      # notify + all-reject cancel
  realtime/orderAutoAccept.js
  realtime/riderOfferSweeper.js
  config/env.js                       # timeouts

apps/customer-app/src/
  screens/admin/AdminNewOrderPopup.js
  screens/admin/AdminCancelRequestPopup.js
  screens/rider/RiderDashboardScreen.js
  screens/rider/RiderOfferPopup.js
  screens/rider/RiderOrderScreen.js
```

---

*This document reflects runtime behavior of the codebase as implemented. If code and this file diverge, trust the code and update this file.*
