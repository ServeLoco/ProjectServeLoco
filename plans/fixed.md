# ServeLoco Pricing & Checkout Bug Fix Plan

## Problem Summary

Delivery charge and threshold pricing has multiple bugs across admin, backend, and frontend. The core issue: **the correct delivery charge shows on the cart screen, but disappears or becomes wrong after location (GPS/pin) is checked on the checkout screen**.

---

## Phase 1: Backend Bugs

### Task 1.1 — Fix `free_delivery_above` dead code
**File:** `Backend-V1/src/utils/thresholdDelivery.js`
**File:** `Backend-V1/src/controllers/settingsController.js`
**File:** `Backend-V1/src/db/migrate.js`

**Subtasks:**
- [ ] Remove `free_delivery_above` from the allowed fields list in `updateSettings` (it is stored but never read in calculations — `minimum_order_amount` is always used as the threshold)
- [ ] Remove `free_delivery_above` from the `getSettings` fallback defaults (line returning `free_delivery_above: 500`)
- [ ] Remove `free_delivery_above` from admin Settings.jsx payload builder
- [ ] Add DB migration: remove `free_delivery_above` column from `settings` table

**Why:** The field is misleading — admin sets it thinking it controls a second threshold, but it does nothing. Only `minimum_order_amount` is ever used.

---

### Task 1.2 — Fix delivery charge logic when location is provided
**File:** `Backend-V1/src/controllers/cartController.js`
**File:** `Backend-V1/src/utils/thresholdDelivery.js`

**Subtasks:**
- [ ] In `cartController.js`, the `POST /cart/calculate` route currently sets `deliveryWithinRange = true` and `deliveryDistanceKm = null` regardless of whether lat/lng are provided. Verify this is intentional and that location is NOT being used to modify the delivery charge (distance-based pricing is removed). Confirm `calculateThresholdDeliveryCharge` does NOT receive or use location data.
- [ ] Add a log/assertion that lat/lng are received but deliberately not used for distance checks, so this is auditable.
- [ ] Ensure the response always includes `deliveryCharge` and `belowThreshold` regardless of whether coordinates were sent.

**Why:** Currently the backend ignores location for pricing — but the frontend may be sending coordinates expecting a different behavior. Need to make sure the response is consistent whether coordinates are sent or not.

---

### Task 1.3 — Verify `free_delivery_offer_active` precedence logic
**File:** `Backend-V1/src/utils/thresholdDelivery.js`

**Subtasks:**
- [ ] The current logic: `free_delivery_offer_active === true` returns `charge: 0` immediately, skipping threshold check, night charge check, everything. This is correct behavior — confirm it matches admin intent. Document this in a code comment.
- [ ] Add a comment explaining the priority order: `free_delivery_offer_active` > threshold check > night charge

**Why:** The free delivery offer currently overrides ALL charges including night charges. This may or may not be intentional.

---

### Task 1.4 — Clean up legacy distance-based fields and dead code
**Files:**
- `Backend-V1/src/utils/deliveryPricing.js`
- `Backend-V1/src/controllers/orderController.js`
- `Backend-V1/src/db/migrate.js`

**Subtasks:**
- [ ] Add a DEPRECATED comment header to `deliveryPricing.js` explaining it is unused and will be removed
- [ ] Remove `deliveryPricing.js` import from `orderController.js` (currently commented out)
- [ ] Document in `orderController.js` that `latitude`/`longitude` are stored for record only, not for pricing
- [ ] In migrate.js, add a TODO comment noting that `delivery_radius_km`, `delivery_cost_per_km`, `shop_latitude`, `shop_longitude` columns are obsolete but retained for schema stability

**Why:** These fields cause confusion. Cleanup reduces misleading code.

---

### Task 1.5 — Add validation for night charge time fields
**File:** `Backend-V1/src/controllers/settingsController.js`

**Subtasks:**
- [ ] Add validation: if `night_charge_start` and `night_charge_end` are both set, ensure `night_charge > 0` — otherwise the time window has no effect
- [ ] Add comment in the settings UI (admin panel) noting that night charge times accept any start/end time but behave correctly across midnight (e.g., 21:00 to 07:00)

**Why:** Night charge times can be set to daytime hours without a night charge amount being set, leading to confusing behavior.

---

## Phase 2: Admin Panel Bugs

### Task 2.1 — Fix Settings screen to reflect actual behavior
**File:** `adminManager-V1/src/pages/Settings.jsx`

**Subtasks:**
- [ ] Remove `free_delivery_above` field from the Settings UI (input + label + payload builder) — it's dead code
- [ ] Rename/reword `free_delivery_above_minimum_active` toggle label to be clearer: `"Free Delivery for Orders Above Minimum"` with help text: `"When ON, orders at or above the minimum order amount get free delivery. When OFF, standard delivery charge applies."`
- [ ] Add `delivery_available` toggle to the Settings UI — the backend stores this but the admin panel never shows it. Add it with label: `"Delivery Available"` and help text: `"Turn OFF to disable delivery entirely."`
- [ ] Show `below_threshold_delivery_charge` field more prominently — it is the key field for below-threshold orders. Add a descriptive label: `"Delivery Charge (Below Minimum)"` with help text: `"Applied when order is below the minimum order amount."`
- [ ] Show `delivery_charge` field with label: `"Delivery Charge (Above Minimum)"` with help text: `"Applied when order meets minimum, if free delivery above minimum is OFF."`
- [ ] Default `free_delivery_above_minimum_active` to `true` in DEFAULT_SETTINGS (already set) — confirm the DB column also defaults to `true` via migration.

**Why:** The admin UI misleads operators about what each field does. Critical: `delivery_available` toggle exists in DB but is not exposed in the UI.

---

### Task 2.2 — Add delivery availability blocking in admin settings
**File:** `adminManager-V1/src/pages/Settings.jsx`

**Subtasks:**
- [ ] Display the current `delivery_available` status in the settings page header (e.g., a badge: "Delivery: ON" / "Delivery: OFF")
- [ ] When `delivery_available` is OFF, show a warning that customers will not see delivery as an option

**Why:** Admin needs visibility into whether delivery is toggled on/off.

---

## Phase 3: Frontend Bugs

### Task 3.1 — Fix CartScreen not sending coordinates (causes price mismatch)
**File:** `Frontend-V1/src/screens/customer/CartScreen/CartScreen.js`

**Subtasks:**
- [ ] Since location should NOT affect delivery charge in the threshold model, ensure CartScreen correctly shows the same delivery charge as CheckoutScreen by confirming both use the same `calculateCart` backend endpoint logic
- [ ] If CartScreen currently shows FREE delivery and CheckoutScreen shows a charge after location check, identify why — check if backend returns different values based on coordinates. **The backend currently ignores coordinates for threshold pricing, so this should NOT happen.**
- [ ] Verify: add console.log in CartScreen to compare bill from CartScreen vs what CheckoutScreen would return. Investigate if there's any code path where location modifies the price.

**Why:** User sees different prices in cart vs checkout — this breaks trust.

---

### Task 3.2 — Fix inconsistent delivery charge label text
**Files:**
- `Frontend-V1/src/screens/customer/CartScreen/CartScreen.js`
- `Frontend-V1/src/screens/customer/CheckoutScreen/CheckoutScreen.js`
- `Frontend-V1/src/screens/customer/OrderDetailScreen/OrderDetailScreen.js`
- `Frontend-V1/src/screens/customer/OrderConfirmationScreen/OrderConfirmationScreen.js`

**Subtasks:**
- [ ] Standardize all delivery charge labels to two options:
  - When `bill.belowThreshold === true`: `"Delivery Charge (Below Minimum)"`
  - When `bill.belowThreshold === false`: `"Delivery Charge"`
- [ ] Update CartScreen labels to use this convention
- [ ] Update CheckoutScreen labels to use this convention
- [ ] Update OrderDetailScreen labels to use this convention
- [ ] Update OrderConfirmationScreen labels to use this convention

**Why:** Four different label variants across screens confuse users.

---

### Task 3.3 — Display `belowThresholdDeliveryCharge` in the UI
**Files:**
- `Frontend-V1/src/screens/customer/CartScreen/CartScreen.js`
- `Frontend-V1/src/screens/customer/CheckoutScreen/CheckoutScreen.js`
- `Frontend-V1/src/components/BillSummary/BillSummary.js`

**Subtasks:**
- [ ] CartScreen: show the actual below-threshold delivery charge value (from `bill.belowThresholdDeliveryCharge`) in the warning/progress bar when user is below threshold, not a hardcoded or calculated value
- [ ] CheckoutScreen: same — show `bill.belowThresholdDeliveryCharge` in the delivery charge line when `bill.belowThreshold === true`
- [ ] BillSummary: support a `belowThreshold` prop that changes the label and shows `belowThresholdDeliveryCharge` value instead of the standard `deliveryCharge`

**Why:** The below-threshold delivery charge (e.g., Rs. 20) may differ from the standard delivery charge (e.g., Rs. 10). Users need to see the actual charge, not a fallback.

---

### Task 3.4 — Remove dead fields from `useSettingsStore`
**File:** `Frontend-V1/src/stores/useSettingsStore.js`

**Subtasks:**
- [ ] Remove `deliveryCharge` and `nightCharge` from the settings store — these are NEVER read in the UI (all pricing comes from the bill API)
- [ ] Remove the corresponding fields from `normalizeSettings` in `apiMappers.js`

**Why:** Dead code that confuses future developers.

---

### Task 3.5 — Fix CheckoutScreen settings fetch that has no effect
**File:** `Frontend-V1/src/screens/customer/CheckoutScreen/CheckoutScreen.js`

**Subtasks:**
- [ ] Remove the `settingsApi.getSettings()` call on CheckoutScreen mount (lines 97-109) — it fetches settings and stores them but the values are never used for pricing display
- [ ] If settings are needed elsewhere, they should be fetched once at app startup and cached in the settings store, not re-fetched on every checkout

**Why:** Wastes a network request on every checkout screen visit.

---

### Task 3.6 — Add delivery blocked state when `delivery_available` is OFF
**File:** `Frontend-V1/src/screens/customer/CheckoutScreen/CheckoutScreen.js`

**Subtasks:**
- [ ] Read `delivery_available` from the settings store (or bill response)
- [ ] When `delivery_available === false`, show a prominent message: "Delivery is currently unavailable in your area" and disable the place order button
- [ ] Add this check in the delivery status section alongside `requiresLocation` and `deliveryWithinRange` checks

**Why:** If admin turns off delivery, customers should be blocked from placing delivery orders.

---

### Task 3.7 — Clean up unused `minimumOrderText` style in CheckoutScreen
**File:** `Frontend-V1/src/screens/customer/CheckoutScreen/CheckoutScreen.js`

**Subtasks:**
- [ ] Remove the `minimumOrderText` StyleSheet definition if it is never used in the render

**Why:** Dead code clutter.

---

## Phase 4: Testing & Verification

### Task 4.1 — Test all pricing scenarios end-to-end
**Test all combinations manually or write test cases:**

| Scenario | minimumOrder | subtotal | free_delivery_above_minimum_active | free_delivery_offer_active | Expected deliveryCharge | Expected belowThreshold |
|---|---|---|---|---|---|---|
| A | 149 | 100 | true | false | belowThresholdDeliveryCharge (20) | true |
| B | 149 | 200 | true | false | 0 | false |
| C | 149 | 200 | false | false | delivery_charge | false |
| D | 149 | 100 | true | true | 0 (offer overrides) | false |
| E | 149 | 200 | false | true | 0 (offer overrides) | false |
| F | 0 (threshold off) | 100 | any | false | delivery_charge | false |
| G | 0 | 100 | any | true | 0 | false |

### Task 4.2 — Verify Cart vs Checkout price consistency
- Place items in cart → note delivery charge shown
- Go to checkout → get GPS location → verify delivery charge is the SAME
- Verify label text is consistent

### Task 4.3 — Admin settings propagation test
- Change `minimum_order_amount` in admin → refresh app → verify new threshold shows in cart warning
- Toggle `free_delivery_above_minimum_active` → verify charge changes immediately
- Toggle `free_delivery_offer_active` → verify delivery charge becomes 0
- Toggle `delivery_available` to OFF → verify checkout blocks with message

---

## Execution Order

1. **Task 2.1** (Admin UI fixes) — so admin can correctly configure the settings
2. **Task 1.1** (Remove dead `free_delivery_above` field) — clean up backend
3. **Task 1.2** (Fix location handling) — ensure backend is consistent
4. **Task 1.3** (Document precedence) — prevent future confusion
5. **Task 1.4** (Clean up legacy code) — reduce confusion
6. **Task 1.5** (Night charge validation)
7. **Task 2.2** (Delivery availability in admin)
8. **Task 3.1** (Cart vs checkout consistency)
9. **Task 3.2** (Standardize labels)
10. **Task 3.3** (Show below-threshold charge)
11. **Task 3.4** (Remove dead store fields)
12. **Task 3.5** (Remove wasted settings fetch)
13. **Task 3.6** (Block checkout when delivery off)
14. **Task 3.7** (Remove dead styles)
15. **Phase 4** (Testing)