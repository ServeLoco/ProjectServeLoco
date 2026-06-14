# Changelog — Night Delivery COD Restriction

## Summary

Cash on Delivery is now disabled on both customer checkouts (Expo app + web) during the admin-configured night delivery window. The backend also rejects any `Cash` order posted during that window, so the rule cannot be bypassed by calling the API directly.

The existing `night_charge_start` / `night_charge_end` / `night_charge` settings are reused — no new DB columns, no new admin form fields, no new API endpoints.

---

## Behavior

- **In the night window** (current IST time is inside `[night_charge_start, night_charge_end]` and `night_charge > 0`):
  - Checkout shows a notice: *"Cash on Delivery is unavailable during night delivery hours (HH:MM to HH:MM). Please use UPI."*
  - The **Cash on Delivery** card is greyed out, non-pressable, and shows *"Unavailable at night"*.
  - If Cash was previously selected, the UI auto-switches to **UPI**.
  - Backend `POST /api/orders` with `payment_method: "Cash"` returns 400.
- **Outside the night window**: existing behavior, both methods available.
- **If `night_charge` is 0 or times are missing**: window is treated as inactive — no restriction.

Window logic uses the same overnight rule already in the codebase: `start > end` means the window crosses midnight (e.g. 21:00 → 07:00). Both endpoints are inclusive, matching the existing `cartController` / `orderController` behavior.

---

## Files Changed

### New
| File | Purpose |
|---|---|
| `Backend-V1/src/utils/nightDelivery.js` | Shared helper: `isInNightWindow`, `isNightWindowActive`, `isCodBlockedDuringNight`, `calculateNightCharge`. IST timezone. |
| `Backend-V1/tests/nightDelivery.test.js` | 25 unit tests for boundaries (overnight, same-day, start/end inclusive, null times, charge=0). |
| `Frontend-V1/src/utils/nightDelivery.js` | JS mirror of the backend helper for the Expo app. |
| `IOSWEB/src/utils/nightDelivery.js` | JS mirror of the backend helper for the web app. |

### Modified
| File | Change |
|---|---|
| `Backend-V1/src/controllers/orderController.js` | Imports the shared helper; `createOrder` rejects `Cash` during night window; the duplicated `toMinutes` + IST block in the night-charge calc is replaced with a helper call. |
| `Backend-V1/src/controllers/cartController.js` | Same refactor — duplicated `toMinutes` block replaced with helper call. |
| `Frontend-V1/src/utils/apiMappers.js` | `normalizeSettings` now also exposes `nightCharge`, `nightChargeStart`, `nightChargeEnd` (snake_case and camelCase both accepted). |
| `Frontend-V1/src/utils/index.js` | Re-exports the new `nightDelivery` helpers. |
| `Frontend-V1/src/stores/useSettingsStore.js` | New defaults: `nightCharge`, `nightChargeStart`, `nightChargeEnd`. |
| `Frontend-V1/src/screens/customer/CheckoutScreen/CheckoutScreen.js` | Reads new settings, ticks a `now` state every 60s, computes `codBlockedByNight`, auto-switches to UPI when blocked, renders the new night-notice banner, disables the COD card. New styles: `nightNotice`, `nightNoticeText`, `paymentBoxDisabled`, `paymentTextDisabled`, `paymentBlockedHint`. |
| `IOSWEB/src/screens/CheckoutScreen/CheckoutScreen.jsx` | Same UI behavior: `now` ticker, `codBlockedByNight`, auto-switch, banner, disabled radio. |
| `IOSWEB/src/screens/CheckoutScreen/CheckoutScreen.css` | New styles: `.co-radio-card.disabled`, `.co-night-notice`. |

---

## API / DB Impact

- **No DB changes.** `payment_method` ENUM, `night_charge_*` columns — all unchanged.
- **No new endpoints.** `GET /api/settings` and `POST /api/orders` already carry the data.
- **New error response** on `POST /api/orders` when blocked:
  ```json
  { "code": "VALIDATION_ERROR", "message": "Cash on Delivery is not available during night delivery hours. Please choose UPI." }
  ```
  Status `400`.

---

## Verification

- `npm test` (Backend-V1): **185 passed, 1 skipped**. New `nightDelivery.test.js`: **25/25 pass**.
- `npm run lint` (Backend-V1 + Frontend-V1): no new issues (3 pre-existing warnings unchanged, all unrelated).

---

## Rollout Notes

1. Restart the backend (`npm run dev`) so it picks up the new util and reject rule.
2. Restart the Expo app (`npx expo start -c`) and the web app — the frontend reads from settings, so it picks up automatically.
3. Settings TTL on the customer side is 5 minutes (`Frontend-V1/src/stores/useSettingsStore.js:5`). To see the new behavior immediately after the admin sets a window, pull-to-refresh on Home (or change the time on the device clock).

---

## Follow-ups (out of scope, not done)

- The "night charge" still applies regardless of `payment_method`. If the business later wants to **waive** the night charge for UPI orders (or add it as a separate line), the helper is in place to add that rule.
- `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js` shows a one-time fetch on Home; if the user keeps the checkout screen open across the night-window boundary, the 60-second ticker handles it. (Today the user typically goes Cart → Checkout, so this is fine.)
- The `normalizeSettings` mapper is the single source of truth — other screens that may want to surface "we're in the night window" (e.g. Home banner) can read the same three fields.
