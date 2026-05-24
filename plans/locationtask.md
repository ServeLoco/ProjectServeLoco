# Location Based Delivery Tasks

## Goal
Implement location-based delivery pricing and availability.

Customers must share GPS location during checkout. Backend will calculate distance between shop location and customer location, allow delivery only within the configured radius, and calculate delivery charge using exact per-km pricing.

Default delivery radius: 8 km.

Admin can control:
- Shop latitude and longitude
- Delivery radius
- Delivery cost per km
- Free delivery offer on/off
- Delivery availability

Global free delivery offer should make delivery charge zero for all in-range orders.

---

## 1. Current System Review

### Goal
Understand existing checkout, cart, order, settings, and admin flows before implementation.

### Files likely checked
- Backend-V1/src/controllers/cartController.js
- Backend-V1/src/controllers/orderController.js
- Backend-V1/src/controllers/settingsController.js
- Backend-V1/src/routes/orderRoutes.js
- Backend-V1/src/validators/index.js
- Frontend-V1/src/screens/customer/CheckoutScreen/CheckoutScreen.js
- adminManager-V1/src/pages/Settings.jsx

### Subtasks
- [x] Confirm checkout already captures GPS latitude and longitude
- [x] Confirm order creation already stores latitude and longitude
- [x] Confirm cart calculation currently uses flat delivery charge
- [x] Confirm order creation currently recalculates flat delivery charge
- [x] Confirm admin settings currently has delivery settings but no distance controls
- [x] Confirm settings API can be extended safely
- [x] Confirm mobile app can send coordinates to cart calculation API

### Things to avoid
- [x] Do not change checkout layout during review
- [x] Do not change API behavior before shared pricing logic exists
- [x] Do not trust frontend delivery charge

### Testing checklist
- [x] Existing checkout still loads
- [x] Existing order creation still works before changes
- [x] Existing admin settings page still loads

---

## 2. Backend Settings Fields

### Goal
Add backend-controlled delivery configuration.

### New settings fields
- shop_latitude
- shop_longitude
- delivery_radius_km
- delivery_cost_per_km
- free_delivery_offer_active

### Defaults
- delivery_radius_km = 8
- delivery_cost_per_km = 0
- free_delivery_offer_active = false
- shop_latitude = null
- shop_longitude = null

### Subtasks
- [x] Add migration for new settings fields
- [x] Update settings model/query logic if needed
- [x] Update settings controller allow-list
- [x] Validate numeric fields
- [x] Validate latitude range from -90 to 90
- [x] Validate longitude range from -180 to 180
- [x] Prevent negative radius
- [x] Prevent negative per-km charge
- [x] Return new settings fields from settings API

### Things to avoid
- [x] Do not remove old delivery_charge field
- [x] Do not break existing mobile settings consumers
- [x] Do not require shop coordinates for admin settings page to load

### Testing checklist
- [x] Settings API returns new fields
- [x] Admin can update new fields
- [x] Invalid coordinates are rejected
- [x] Existing settings still update correctly

---

## 3. Delivery Pricing Utility

### Goal
Create one backend source of truth for delivery distance, range, and charge.

### Files likely changed
- Backend-V1/src/utils/deliveryPricing.js
- Backend-V1/src/controllers/cartController.js
- Backend-V1/src/controllers/orderController.js

### Pricing rules
- Customer GPS is required for order creation
- Shop GPS is required for distance pricing
- Distance is calculated using Haversine formula
- Delivery allowed only when distance <= delivery_radius_km
- Delivery charge = exact distance km * delivery_cost_per_km
- If free_delivery_offer_active is true, delivery charge = 0
- Free delivery offer applies only to in-range orders
- Backend always calculates final delivery charge

### Subtasks
- [x] Create Haversine distance helper
- [x] Create delivery pricing helper
- [x] Return exact distance in km
- [x] Round displayed charge to valid currency amount
- [x] Preserve raw distance for order snapshot
- [x] Return clear missing-location message
- [x] Return clear out-of-range message
- [x] Return clear missing-shop-location message
- [x] Use same helper in cart and order flows

### Things to avoid
- [x] Do not duplicate delivery fee logic in multiple controllers
- [x] Do not calculate final charge in frontend
- [x] Do not allow out-of-range orders even if free delivery is active

### Testing checklist
- [x] 0 km distance returns 0 distance
- [x] Inside-radius distance returns delivery allowed
- [x] Outside-radius distance returns delivery blocked
- [x] Free offer returns zero charge inside radius
- [x] Per-km charge calculation is correct
- [x] Cart and order calculations match

---

## 4. Cart Calculation API

### Goal
Allow checkout to preview location-based delivery charge before placing order.

### API change
POST /api/cart/calculate should accept:
- items
- latitude
- longitude

### Response should include
- deliveryCharge
- deliveryDistanceKm
- deliveryRadiusKm
- deliveryWithinRange
- requiresLocation
- freeDeliveryOfferActive
- deliveryMessage

### Subtasks
- [x] Read latitude and longitude from request body
- [x] Validate coordinates when provided
- [x] If coordinates are missing, return cart totals with requiresLocation = true
- [x] If coordinates are present, calculate distance delivery
- [x] If outside radius, return deliveryWithinRange = false
- [x] Keep item subtotal/tax/night-charge logic unchanged
- [x] Keep response backward compatible where possible

### Things to avoid
- [x] Do not block cart calculation completely when location is missing
- [x] Do not let frontend submit its own delivery fee
- [x] Do not break existing cart UI consumers

### Testing checklist
- [x] Cart calculates without coordinates
- [x] Cart calculates with coordinates
- [x] Cart returns out-of-range status
- [x] Cart returns free delivery when offer is active

---

## 5. Order Creation API

### Goal
Enforce delivery range and final charge during order placement.

### Files likely changed
- Backend-V1/src/controllers/orderController.js
- Backend-V1/src/routes/orderRoutes.js
- Backend-V1/src/validators/index.js

### Subtasks
- [x] Require latitude and longitude for delivery orders
- [x] Validate coordinate format
- [x] Load latest settings during order creation
- [x] Calculate distance and delivery charge server-side
- [x] Block order if customer is outside delivery radius
- [x] Block order if shop coordinates are missing
- [x] Store final delivery charge
- [x] Store delivery distance km
- [x] Store pricing snapshot if useful
- [x] Return clear validation errors to frontend

### Things to avoid
- [x] Do not accept frontend delivery charge as trusted
- [x] Do not create order before distance validation passes
- [x] Do not allow free delivery to bypass radius limit

### Testing checklist
- [x] Missing GPS fails order creation
- [x] Invalid GPS fails order creation
- [x] Inside-radius GPS creates order
- [x] Outside-radius GPS blocks order
- [x] Free delivery creates order with zero delivery charge
- [x] Stored order contains distance and charge

---

## 6. Order Database Fields

### Goal
Store delivery distance and final delivery pricing details for future admin/order review.

### Suggested new order fields
- delivery_distance_km
- delivery_radius_km_snapshot
- delivery_cost_per_km_snapshot
- free_delivery_offer_snapshot

### Subtasks
- [x] Add migration for order delivery snapshot fields
- [x] Store calculated distance
- [x] Store radius used at order time
- [x] Store per-km rate used at order time
- [x] Store free-offer state used at order time
- [x] Ensure old orders still load without these values

### Things to avoid
- [x] Do not recalculate old order charges when settings change
- [x] Do not break order history for existing users
- [x] Do not make nullable historical fields required

### Testing checklist
- [x] New orders store snapshot fields
- [x] Old orders still display correctly
- [x] Admin order detail can read new fields safely

---

## 7. Mobile Checkout Updates

### Goal
Show accurate delivery cost and block invalid orders on the customer app.

### Files likely changed
- Frontend-V1/src/screens/customer/CheckoutScreen/CheckoutScreen.js
- Frontend-V1/src/api/cartApi.js if needed
- Frontend-V1/src/api/orderApi.js if needed

### Subtasks
- [x] Send coordinates to cart calculate API after GPS pin
- [x] Recalculate totals when location changes
- [x] Show delivery distance in order summary
- [x] Show delivery radius/status message
- [x] Show free delivery message when offer is active
- [x] Disable place order when GPS is missing
- [x] Disable place order when outside delivery range
- [x] Keep manual address input unchanged
- [x] Keep payment flow unchanged
- [x] Keep existing checkout layout unchanged

### Things to avoid
- [x] Do not redesign checkout screen
- [x] Do not remove manual address field
- [x] Do not calculate delivery charge locally except display formatting
- [x] Do not change payment method behavior

### Testing checklist
- [x] Checkout asks for GPS
- [x] Delivery fee updates after GPS
- [x] Distance appears correctly
- [x] Out-of-range order cannot be placed
- [x] Free delivery offer displays zero delivery charge
- [x] Existing order placement still works for valid locations

---

## 8. Admin Manager Settings

### Goal
Allow admin to control location-based delivery from web admin panel.

### Files likely changed
- adminManager-V1/src/pages/Settings.jsx
- adminManager-V1/src/api/settingsApi.js if present
- Backend-V1 settings API

### Admin fields to add
- Shop latitude
- Shop longitude
- Delivery radius km
- Delivery cost per km
- Free delivery offer active

### Subtasks
- [x] Add form fields for shop coordinates
- [x] Add form field for radius
- [x] Add form field for cost per km
- [x] Add toggle for free delivery offer
- [x] Show helper text explaining radius and per-km pricing
- [x] Save settings through backend settings API
- [x] Display validation errors clearly
- [x] Keep existing settings fields working

### Things to avoid
- [x] Do not add admin logic inside mobile app
- [x] Do not hardcode shop coordinates in frontend
- [x] Do not remove existing delivery availability controls

### Testing checklist
- [x] Admin can save shop coordinates
- [x] Admin can save radius
- [x] Admin can save per-km cost
- [x] Admin can enable/disable free delivery
- [x] Mobile checkout reflects admin changes

---

## 9. Admin Order Visibility

### Goal
Let admin understand delivery pricing used on each order.

### Subtasks
- [x] Show customer delivery distance on order detail
- [x] Show delivery charge
- [x] Show whether free delivery offer was applied
- [x] Show if order used distance-based pricing
- [x] Keep order status/payment actions unchanged

### Things to avoid
- [x] Do not allow changing completed order pricing unless a separate refund/adjustment system exists
- [x] Do not mix current settings with old order snapshots

### Testing checklist
- [x] New order detail shows distance
- [x] Free delivery order clearly shows zero charge
- [x] Old orders without distance still load

---

## 10. Error And Edge Case Handling

### Goal
Make location delivery reliable and understandable.

### Cases to handle
- GPS permission denied
- GPS unavailable
- Missing shop coordinates
- Customer outside delivery radius
- Delivery disabled by admin
- Free delivery active
- Cost per km set to zero
- Existing old orders without distance fields
- Network failure while recalculating delivery

### Subtasks
- [x] Add clear mobile message for GPS denied
- [x] Add clear mobile message for out-of-range delivery
- [x] Add clear backend error for missing shop coordinates
- [x] Allow zero per-km charge if admin wants free delivery without toggle
- [x] Make old order fields nullable
- [x] Keep checkout recoverable after location/API error

### Things to avoid
- [x] Do not crash checkout on missing distance fields
- [x] Do not silently place out-of-range orders
- [x] Do not hide backend validation messages

### Testing checklist
- [x] GPS denied message appears
- [x] Missing shop location blocks order clearly
- [x] Zero per-km cost works
- [x] Old orders remain readable

---

## 11. Backend Tests

### Goal
Verify pricing, range, and order enforcement.

### Subtasks
- [x] Test Haversine helper
- [x] Test inside-radius pricing
- [x] Test outside-radius blocking
- [x] Test missing customer coordinates
- [x] Test missing shop coordinates
- [x] Test free delivery offer
- [x] Test zero per-km charge
- [x] Test order stores distance snapshot
- [x] Test cart and order totals match

### Testing checklist
- [x] Backend test suite passes
- [x] No existing order/cart tests regress
- [x] Validation messages are clear

---

## 12. Frontend Testing

### Goal
Verify mobile checkout and admin settings behavior.

### Subtasks
- [x] Test checkout before GPS pin
- [x] Test checkout after GPS pin
- [x] Test in-range delivery
- [x] Test out-of-range delivery
- [x] Test free delivery offer display
- [x] Test admin settings save
- [x] Test admin settings validation errors
- [x] Test order detail distance display

### Testing checklist
- [x] Frontend-V1 lint/test passes
- [x] adminManager-V1 lint/build passes
- [x] No checkout layout regression
- [x] No admin settings regression

---

## 13. Final Verification

### Goal
Confirm the full system works end to end.

### Subtasks
- [ ] Start Backend-V1
- [ ] Start adminManager-V1
- [ ] Start Frontend-V1
- [ ] Login as admin
- [ ] Set shop coordinates
- [ ] Set radius to 8 km
- [ ] Set delivery cost per km
- [ ] Disable free delivery offer
- [ ] Place in-range test order
- [ ] Confirm delivery charge is calculated
- [ ] Place out-of-range test order
- [ ] Confirm order is blocked
- [ ] Enable free delivery offer
- [ ] Place in-range test order
- [ ] Confirm delivery charge is zero
- [ ] Confirm admin order detail shows distance/charge
- [x] Run graphify update .

### Acceptance criteria
- [x] Customer cannot place order without GPS location
- [x] Customer cannot place order outside delivery radius
- [x] Delivery charge is calculated by backend using exact km times admin per-km rate
- [x] Admin can control radius and per-km charge
- [x] Admin can enable free delivery offer
- [x] Mobile checkout reflects admin setting changes
- [x] Existing app features, routes, payment flow, and order flow remain working
