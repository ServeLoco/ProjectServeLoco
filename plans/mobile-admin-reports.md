# Mobile Admin Reports

The owner requested Reports in mobile Admin Mode on 2026-10-10. This expands
Reports beyond the original web-only scope in `admin-mode-mobile.md`.

## Implementation plan

1. Reuse the existing admin report endpoints and mobile admin authentication.
2. Add Admin Home → Reports as a stack screen, keeping the five current tabs.
   The shortcut must remain available if the dashboard fails to load.
3. Add Profit & Payouts: date presets/custom range, summary and breakdown,
   shop payouts, business insights/trend, delivered orders with shop/sort/page
   filters and links to order detail.
4. Add Overview: period filter, sales/payment/status totals, food ratings
   (actual average and displayed rating), top items, customers and shops.
5. Load only the selected view while focused. Debounce order updates, refresh
   on foreground/reconnect, ignore stale requests, and provide retry states.
   Changing order pagination/filtering must not reload summary/insights.
6. Test authentication/query parameters, date validation, navigation, ratings,
   negative profit, pricing warnings, errors/retries, refresh and stale races.
   Run the customer-app suite/lint and Android/iOS bundle export.
7. Commit this work separately on the current feature branch. Do not merge,
   push or publish an OTA without the owner's instruction.

Report math and area permissions remain owned by the existing backend.
Missing values show as unavailable rather than inventing zero revenue.

## Validation completed

- Customer-app suite: 92 suites / 698 tests passed.
- New reports tests cover API auth/query parameters, real-vs-shown food
  ratings, profit/warnings, independent retries, custom dates, pagination,
  order navigation, pull refresh, live debounce/cleanup and stale responses.
- Customer-app lint: no errors; nine existing warnings outside this change.
- Android and iOS Expo/Hermes exports completed locally.
- Feature review found no blocking issues.
- Existing uncommitted customer home/animation work is excluded from this
  commit. No dependency, native runtime or database changes were needed.
