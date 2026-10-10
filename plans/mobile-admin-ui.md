# Mobile Admin Mode visual refresh

## Scope and plan

Keep the existing admin content, data requests, permissions, routes and actions.
Work on `codex/order-item-ratings`; commit locally without merging or publishing.

- [x] Inspect the connected Android phone and current admin screens before editing.
- [x] Introduce admin-only presentation tokens and reduce outer horizontal gutters
  from 24dp to 12dp across Home, Orders, People, Alerts, Live, Reports and detail.
- [x] Refresh the canvas, borders, card corners and shadows; clarify dashboard
  metrics with decorative icons and left-aligned labels.
- [x] Use inset segmented controls for People, Alerts and Reports. Keep every
  existing segment, report field and period. Put report periods in a horizontal
  selector and reset its scroll position when changing report mode.
- [x] Preserve order-detail map bleed by matching its negative margins to the
  revised content padding.
- [x] Test locally, review the scoped diff, and commit only the admin UI files.

## Validation

Connected device: Realme RMX3630, 1080x2400 pixels / 360dp wide. Tested through
the existing local Metro development session, without publishing an OTA.

- Inspected Home and Orders before/after, long order numbers, status/payment
  badges, order filters, delivered order detail, full-width map, and lower cards.
- Checked all People segments (Riders, Shops, Customers), both Alerts segments
  (Broadcast, Templates), and Live analytics. Customers retains the existing
  admin permission message requiring search; that API rule was not changed.
- Checked Reports Profit/Overview switching, horizontal periods including
  Custom, the custom date form, All time populated totals and food ratings.
  Phone testing found retained period scroll offset on mode switches; keyed
  the period selector by mode and verified the fix on the device.
- Full mobile Jest suite: 92 suites, 698 tests passed. Reports suite rerun after
  the scroll fix: 10 tests passed.
- ESLint: zero errors; nine existing warnings outside the changed files.
- Android and iOS Expo/Hermes exports succeeded. No new native dependencies.
- Scoped reviewer found no blockers in the UI diff.

Screenshots and test/export logs are saved under `/tmp/serveloco-admin-*`.
Manual checks used navigation, scrolling and report filters; no orders,
availability settings, broadcasts, templates or payment states were changed.
Unrelated customer home edits in the shared checkout are excluded from this commit.
