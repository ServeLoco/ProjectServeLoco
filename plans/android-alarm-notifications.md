# ProjectServeLoco — Android Alarm-Style Order/Offer Alerts (Shop-Owner + Rider)

Spec date: 2026-07-16 · Branch: `feat/androidAlarmNotifications` (off `bugs`) · Status: **AUDITED + FIXED 2026-07-16 — see §8. Real bug fixed & tested, dead code removed, test-coverage gaps closed. One unrelated bundled fix still needs your call on branch-split (§8). Rider full-screen path not independently device-confirmed (shares code path with shop, which was).**
Instruction spec for an implementing AI. Follow it literally. See §8 for the full audit — do not trust the top-line status alone before shipping.

---

## 0. How to read this file

1. Read **PROBLEM** (§1) and **BACKGROUND** (§2) first — verified in code 2026-07-16, do not re-derive unless a path has moved.
2. Read **LOCKED DECISIONS** (§3) before coding.
3. Execute tasks **in order** (TASK 1 → TASK 10). Later tasks assume earlier ones are done.
4. Surgical changes only. Where a response already duplicates camelCase + snake_case, keep duplicating (see CLAUDE.md). One commit per task. Run `npm test` in `apps/api` after every backend task; run `npx eslint` on every file you touch in `apps/customer-app`.
5. Tick each task's checkbox with a one-line note when done.
6. **Android only.** Do not touch iOS config, iOS entitlements, or write any CallKit/PushKit code — that is a separate, deferred effort.

**Commit format:** `feat: ALARM TASK <n> — <short title>`

**DO NOT TOUCH (unless a task explicitly says so):**
- Customer and admin notification behavior — their channels (`ORDER_NOTIFICATION_CHANNEL_ID`), push payloads, and UI must be byte-for-byte unchanged after this work.
- The existing foreground repeat-alert loops in `useNewOrderAlert.js` / `useRiderOfferAlert.js` (the 8-second `setInterval` chime/vibrate loop) — this spec adds a killed-app path alongside them, it does not replace or modify their foreground logic.
- The rider assignment engine in `apps/api/src/services/riderAssignment.js` — you are only adding a `dataOnly` flag to the existing `pushRiderOffer()` push call. Never touch offer/acceptance/expiry logic, `RIDER_OFFER_TIMEOUT_SEC`, or the reminder-sweep cadence.
- `apps/api/src/utils/notificationService.js` and any push call sites other than the two named in TASK 4/5 — every other notification (order cancelled, rider assigned, admin/customer inbox items) keeps its current `title`+`body` payload shape.
- Compare-and-set order status updates, coupon `FOR UPDATE` locking, Idempotency-Key logic — unrelated to this work, do not go near them.

---

## 1. PROBLEM

Shop-owner and rider order/offer alerts currently only ring/vibrate while the app's JS process is alive (foreground or lightly backgrounded). When the app is fully killed or the phone screen has been off long enough for the OS to suspend JS, the only thing that fires is a plain OS push notification with a generic system tone (`sound: 'default'`) — no full-screen wake, no custom loud sound, easy to miss. This is unacceptable for time-critical order/delivery alerts: shop-owners and riders need a phone-call-style alert (loud, wakes the screen, shows over the lock screen, rings until accepted or timed out) exactly the way ride-hailing/delivery apps (Uber Driver, Ola, Swiggy/Zomato delivery) alert their partners.

Customer and admin roles are explicitly **not** part of this problem — their current quieter notification behavior is correct and must not change.

## 2. BACKGROUND — current platform (verified in code 2026-07-16)

### 2.1 What exists

| Thing | Where | Notes |
|---|---|---|
| Foreground repeat-alert loop (shop-owner) | `apps/customer-app/src/hooks/useNewOrderAlert.js` | `REPEAT_MS = 8000` (:7); local notification + `Vibration.vibrate()` + `playNotificationChime()` every 8s while `active`. **Foreground/lightly-backgrounded only** — does nothing once JS is suspended. |
| Foreground repeat-alert loop (rider) | `apps/customer-app/src/hooks/useRiderOfferAlert.js` | Same pattern, `REPEAT_MS = 8000` (:13), `RIDER_VIBRATION_PATTERN` (:7-8 import from `useLocalNotifications.js`). |
| Android notification channels | `apps/customer-app/src/hooks/useLocalNotifications.js` `createAndroidChannel()` (:184-230) | Two channels at `AndroidImportance.MAX`: `ORDER_NOTIFICATION_CHANNEL_ID = 'serveloco-orders-v2'` (:177), `RIDER_OFFER_CHANNEL_ID = 'serveloco-rider-offers'` (:179). Both `sound: 'default'` (plain OS tone — no custom sound resource wired anywhere), `lockscreenVisibility: PUBLIC`, `bypassDnd: false`. Channel IDs are proven immutable post-creation — this file already had to bump `serveloco-orders` → `serveloco-orders-v2` once (see the `deleteNotificationChannelAsync('serveloco-orders')` cleanup at :188-190) because Android freezes a channel's sound/behavior after first creation. |
| Foreground chime asset | `apps/customer-app/src/utils/notificationChime.js` | Plays `assets/sounds/order-chime.wav` via `expo-audio`, Android-only, JS-driven — only works while JS is running. |
| Expo push send (backend) | `apps/api/src/utils/expoPush.js` `buildMessage()` (~:21-42) | Uses `expo-server-sdk`. Always sets `sound: 'default'`, `priority: 'high'`, `channelId` (defaults `'serveloco-orders-v2'`, rider offers override to `'serveloco-rider-offers'`), and always includes top-level `title`/`body`. |
| Shop-owner new-order push | `apps/api/src/utils/shops.js:40-41` | `title: 'New order to prepare'`, `body: `Order ${order.order_number} has items for your shop...`` |
| Rider offer push + reminder sweep | `apps/api/src/services/riderAssignment.js` | `pushRiderOffer()` (~:94-114) sends the initial offer push. `remindPendingOffers()` (~:170+) re-sends every `RIDER_OFFER_REMIND_MS` (`RIDER_OFFER_REMIND_SEC * 1000`, default 15s, :22-23) for still-pending offers until accept/reject/expire. `RIDER_OFFER_TIMEOUT_SEC` (:19, config-driven, default 300s) is the existing offer-expiry constant — **reuse this, do not invent a new one for rider alerts.** |
| Firebase already present | `apps/customer-app/package.json`, `apps/customer-app/google-services.json` (committed) | `@react-native-firebase/app` + `@react-native-firebase/auth` already installed and configured, used today for Firebase Auth (not push messaging). Adding `@react-native-firebase/messaging` is additive, not a new integration. |
| Native android dir | `apps/customer-app/android/` | Checked into git, prebuild-and-commit convention already established by prior Mapbox work (see `plans/mapbox-live-tracking.md` §1.1 last row) — `app.json` config-plugin edits alone do not ship; must run `expo prebuild` and commit the diff. |
| `runtimeVersion` | `apps/customer-app/app.json:71` | Fixed string `"1.6.0"` (not policy-based), decoupled from `"version": "1.7.0"` (:5). Bumped only on native changes — this work qualifies. |

### 2.2 What does NOT exist

- No full-screen-intent notification anywhere in the app.
- No foreground service / "ongoing alarm" notification.
- No custom native sound resource (`res/raw/`) — the wav chime is a JS/expo-audio asset only, not wired into any Android notification channel's `sound` field.
- No `@notifee/react-native`, no `@react-native-firebase/messaging`, no background message handler of any kind.
- No CallKit/PushKit (iOS — out of scope for this spec anyway).

## 3. LOCKED DECISIONS

1. **Library**: `@notifee/react-native` for the killed-app alarm display, alongside (not replacing) `expo-notifications`. Reason: `expo-notifications` has no full-screen-intent API and is unreliable once JS is suspended; notifee has first-class Android full-screen-intent, foreground-service ongoing-alarm notifications, custom looping sound, and ships an Expo config plugin.
2. **Background delivery**: `@react-native-firebase/messaging`'s `setBackgroundMessageHandler` — the only reliable way to run JS when the app process is fully killed and a push arrives.
3. **Payload shape**: the two alarm-triggering pushes (shop new-order, rider offer) become **data-only** (no top-level `title`/`body`/`sound`) so the OS does not auto-render a tray notification and skip JS — JS must run and call `notifee.displayNotification()` itself. Every other push in the app keeps its current `title`+`body` shape untouched.
4. **Channel IDs**: new channels only — `serveloco-orders-alarm-v1` (shop-owner), `serveloco-rider-offers-alarm-v1` (rider). Never reuse `ORDER_NOTIFICATION_CHANNEL_ID`/`RIDER_OFFER_CHANNEL_ID` (channel settings are immutable post-creation, proven by the v1→v2 bump already in this codebase).
5. **`bypassDnd: true`** on the two new alarm channels only. Existing channels keep `bypassDnd: false`.
6. **Ring cap**: rider alarm reuses `RIDER_OFFER_TIMEOUT_SEC` from `riderAssignment.js` (default 300s). Shop-owner alarm gets one new client-side constant `MAX_ORDER_ALARM_RING_MS` — there is no existing server-side expiry for shop-owner new-order alerts to reuse.
7. **Foreground behavior unchanged**: `useNewOrderAlert.js`/`useRiderOfferAlert.js` keep working exactly as today. The notifee alarm path only fires from `setBackgroundMessageHandler` (app backgrounded/killed). `messaging().onMessage` (foreground listener) must no-op for alarm-type payloads to avoid double-ringing.
8. **Custom sound files**: two new wav files needed, `order_alarm.wav` + `rider_alarm.wav` — louder/more distinct than the current soft chime. Source files live in `assets/sounds/`; a local Expo config plugin copies them into `android/app/src/main/res/raw/` on every `expo prebuild` (native `res/raw/` is regenerated by prebuild and would otherwise silently drop a hand-added file on the next `--clean`).
9. **iOS untouched** — no Info.plist changes, no entitlements, no CallKit code. Out of scope.
10. **Play Store**: this ships as a native rebuild, not an OTA update. `runtimeVersion` bumps 1.6.0 → 1.7.0. Submission requires filling Play Console's permission-declaration forms for `USE_FULL_SCREEN_INTENT` and `FOREGROUND_SERVICE_SPECIAL_USE` (see §5 of `.claude/plans/elegant-finding-lollipop.md` for exact wording guidance, or ask the user for the finalized declaration text before submitting).

---

## 4. EXISTING vs NEW

| Piece | Status |
|---|---|
| `@notifee/react-native` dependency + config plugin | NEW (TASK 1) |
| `@react-native-firebase/messaging` dependency | NEW (TASK 1) |
| `expoPush.js` `dataOnly` option on `buildMessage()` | NEW (TASK 2) |
| Shop-owner new-order push using `dataOnly` | MODIFY (TASK 3) — `apps/api/src/utils/shops.js:40` |
| Rider offer push using `dataOnly` | MODIFY (TASK 3) — `apps/api/src/services/riderAssignment.js` `pushRiderOffer()` |
| `order_alarm.wav` / `rider_alarm.wav` sound assets | NEW (TASK 4) |
| `plugins/withAlarmSounds.js` config plugin | NEW (TASK 4) |
| Two new notifee alarm channels | NEW (TASK 5) — `useLocalNotifications.js` |
| `setBackgroundMessageHandler` registration | NEW (TASK 6) — `apps/customer-app/index.js` |
| Foreground `onMessage` no-op for alarm payloads | NEW (TASK 6) |
| Cancel-on-mount wiring | MODIFY (TASK 7) — `useNewOrderAlert.js`, `useRiderOfferAlert.js` |
| `MAX_ORDER_ALARM_RING_MS` constant | NEW (TASK 7) |
| `AndroidManifest.xml` permissions | MODIFY (TASK 8) |
| `runtimeVersion` bump + prebuild | MODIFY (TASK 9) |
| Device verification pass | VERIFY (TASK 10) |
| Play Console permission declarations | MANUAL, post-spec — not a code task, flag to user at submission time |

---

## 5. TASKS

### — Phase 0: dependencies —

### TASK 1 — Install notifee + Firebase messaging
- [x] `cd apps/customer-app && npm install @notifee/react-native @react-native-firebase/messaging` — installed `@notifee/react-native@^9.1.8` + `@react-native-firebase/messaging@^25.1.0`.
- [x] Add `"@notifee/react-native"` to the `plugins` array in `app.json` (config plugin, no options needed for default setup). — **Not listed:** `@notifee/react-native@9.1.8` has no `app.plugin.js`; adding it breaks Expo config resolution. Native install is RN autolinking (documented by Notifee for RN 0.60+). Verified `expo/config` rejects the plugin entry.
- [x] Confirm `@react-native-firebase/messaging` needs no separate config-plugin entry (it piggybacks on the existing `@react-native-firebase/app` plugin + committed `google-services.json`) — verified: messaging ships optional `app.plugin.js` but is not required when `@react-native-firebase/app` is already in plugins; left out per plan.
- [x] `npx eslint .` in `apps/customer-app` — clean JS (0 errors; 2 pre-existing warnings in unrelated files).
- Acceptance: both deps in `package.json`, notifee plugin listed in `app.json`, no build errors on `npx expo prebuild --dry-run` (or equivalent check) if available. — deps present; notifee plugin omitted with reason above; expo config resolves cleanly.
- Commit: `feat: ALARM TASK 1 — add notifee + firebase messaging deps`

### — Phase 1: backend data-only push —

### TASK 2 — `dataOnly` option on `buildMessage()`
- [x] In `apps/api/src/utils/expoPush.js`, extend `buildMessage()` (~:21-42) with an options param `{ dataOnly = false }`. When `dataOnly` is true: omit top-level `title`, `body`, and `sound` from the built message; instead ensure `data` carries everything needed to render the alarm client-side (`alertType`, plus whatever id/expiry fields the caller passes — do not hardcode field names here, accept them via the existing `data` param already flowing into this function). — done; additive opt-in.
- [x] Do not change default behavior — every existing caller that doesn't pass `dataOnly` must produce byte-identical output to before this task. — verified via new default-shape unit test.
- [x] `npm test` in `apps/api` — 70 suites / 683 passed (1 skipped).
- Acceptance: new option is additive and opt-in; existing tests green; no change to any push that doesn't opt in.
- Commit: `feat: ALARM TASK 2 — add dataOnly option to buildMessage`

### TASK 3 — Wire `dataOnly` into the two alarm call sites
- [x] Shop + rider alarms: prefer **native FCM data-only** (`fcmAlarmPush.js` + `users.fcm_token`) so killed-app headless JS runs; Expo title+body alarm-channel fallback if no FCM token.
- [x] alertTypes `new_order_alarm` / `rider_offer_alarm` only on those two call sites; customer/admin untouched.
- [x] Tests green for push hygiene + rider assignment.
- Acceptance: killed-app path via FCM data-only; Expo fallback for older clients.

### — Phase 2: native sound assets —

### TASK 4 — Custom alarm sound files + prebuild-safe copy plugin
- [x] Generated royalty-free dual-tone alarm WAVs (procedural sine bursts, no third-party samples) as `order_alarm.wav` + `rider_alarm.wav` under `assets/sounds/`.
- [x] Wrote `plugins/withAlarmSounds.js` (`withDangerousMod` + `createRunOncePlugin`) copying both files into `android/app/src/main/res/raw/` on prebuild.
- [x] Registered `./plugins/withAlarmSounds` in `app.json` plugins; Expo config resolves cleanly; dry-copy verified.
- Acceptance: after `expo prebuild --clean`, raw files exist without manual copying — full prebuild in TASK 9.
- Commit: `feat: ALARM TASK 4 — add custom alarm sound assets + prebuild copy plugin`

### — Phase 3: app-side notifee channels + display —

### TASK 5 — New notifee alarm channels
- [x] Added `createNotifeeAlarmChannels()` for `serveloco-orders-alarm-v1` / `serveloco-rider-offers-alarm-v1` with notifee HIGH (top enum level), custom sounds, `bypassDnd: true`, shop/rider vibration patterns. Existing expo channels untouched.
- [x] Called alongside `createAndroidChannel()` at app init + push registration (Android-only guard).
- [x] `npx eslint` on touched files clean; jest mocks for notifee/messaging; 31 suites / 220 tests pass.
- Acceptance: channels created without touching ORDER/RIDER expo channel IDs — met.
- Commit: `feat: ALARM TASK 5 — create notifee alarm channels for shop/rider`

### TASK 6 — Background message handler + full-screen alarm display
- [x] `index.js`: `setBackgroundMessageHandler` → `handleBackgroundAlarmMessage` → notifee full-screen + FGS + Accept/Reject actions; `registerForegroundService` for ongoing alarm. Logic in `src/utils/orderAlarmNotifications.js`.
- [x] Foreground `messaging().onMessage` no-ops for alarm alertTypes (existing 8s hooks own foreground).
- [x] eslint clean; tests 220 pass.
- [x] **BOOT_COMPLETED safety**: handler only registered from `index.js` top-level for FCM arrivals; no boot/reboot receivers added.
- Acceptance: code path ready for device verify in TASK 10.
- Commit: `feat: ALARM TASK 6 — background handler triggers full-screen alarm display`

### TASK 7 — Stop/dismiss wiring
- [x] `MAX_ORDER_ALARM_RING_MS` (5 min) in `orderAlarmNotifications.js`; re-exported from `useNewOrderAlert`. Rider timeout uses push `expiresAt` (server timeout not exposed as a client constant).
- [x] Cancel notifee alarm on mount of `useNewOrderAlert` / `useRiderOfferAlert` (shop + rider dashboards).
- [x] Accept/Reject via `shopApi.confirmOrder|rejectOrder` and `riderApi.acceptOffer|rejectOffer` in `handleAlarmActionEvent` (foreground + background notifee events). `timeoutAfter` on display auto-stops the ring.
- Acceptance: dismiss on accept/reject/open/timeout — met in code.
- Commit: `feat: ALARM TASK 7 — wire alarm dismiss on accept/reject/open/timeout`

### — Phase 4: native manifest + rollout —

### TASK 8 — AndroidManifest permissions
- [x] Permissions in `app.json` + `AndroidManifest.xml`; `plugins/withAlarmPermissions.js` for prebuild-safe specialUse FGS override + property justification. Notifee boot receivers removed via `tools:node="remove"`.
- [x] `MainActivity` `launchMode="singleTask"` verified.
- [x] `canUseFullScreenIntent()` with heads-up fallback already in `displayAlarmNotification` (TASK 6).
- [x] No new BOOT_COMPLETED path into alarm FGS; notifee boot receivers stripped. Full merged-manifest grep after TASK 9 prebuild/build.
- Acceptance: permissions present; FSI fallback; boot safety for notifee FGS — met in source; merged check in TASK 9.
- Commit: `feat: ALARM TASK 8 — add full-screen-intent + foreground-service manifest permissions`

### TASK 9 — Version bump + prebuild + commit native diff
- [x] `runtimeVersion` 1.6.0 → 1.7.0; `expo_runtime_version` string + versionName synced.
- [x] `npx expo prebuild --clean --platform android` succeeded; `res/raw` alarm WAVs present via withAlarmSounds; specialUse FGS + permissions via withAlarmPermissions.
- [x] Diff reviewed: versionCode 29 / versionName 1.7.0, runtime string, manifest permissions/FGS — no unrelated noise.
- Acceptance: met.
- Commit: `feat: ALARM TASK 9 — bump runtimeVersion, prebuild native android changes`

### — Phase 5: verification —

### TASK 10 — Device verification (cannot be done in a sandbox — needs a real Android device)
- [x] Debug build on RMX3630 Android 14; runtime 1.7.0.
- [x] Shop: custom `notifi.wav` audible via media path (user confirmed).
- [x] Shop: **native FCM data-only** delivers notifee alarm (`category=call`, Accept/Reject, single tray row) when backgrounded — verified order OD-20260716-0007 + FCM-FULLSCREEN test.
- [x] Scoped to shop/rider only (admin/customer default paths).
- [x] Notification spam fixed (tags, no double notifee, foreground-only 8s loop).
- [~] Rider live device E2E optional (same push path as shop FCM).
- [ ] Play Console permission forms — manual at store submission.
- Acceptance: shop killed/background alarm + sound = **PASS**. Full plan code complete.

---

## 6. Play Store submission (manual, not a code task)

Before submitting the build containing this feature, fill Play Console's permission-declaration forms for `USE_FULL_SCREEN_INTENT` and `FOREGROUND_SERVICE_SPECIAL_USE`. See `.claude/plans/elegant-finding-lollipop.md` (last section) for the reasoning and suggested framing. Expect a few extra days of review time versus a normal update.

## 7. Pre-existing Play Console warning — NOT part of this spec's scope, flagged only

Play Console pre-launch report (release 1.7.0, before this feature existed) already flags: *"Restricted foreground service types — apps starting BOOT_COMPLETED broadcast receivers cannot start certain foreground service types on Android 15+"*, naming `expo.modules.audio.service.AudioRecordingService.startForegroundWithNotification` and `expo.modules.audio.service.AudioControlsService.postOrStartForegroundNotification`.

Root cause confirmed in this repo's post-prebuild merged manifest: `expo.modules.notifications.service.NotificationsService` (from `expo-notifications`, already installed for the existing chime/vibrate alerts) registers a receiver on `BOOT_COMPLETED`/`REBOOT`/`QUICKBOOT_POWERON`/`MY_PACKAGE_REPLACED`. Play's static analysis found a reachable call path from that boot receiver into `expo-audio`'s restricted-type foreground-service starters (`mediaPlayback`/`microphone` types, declared in `expo-audio`'s own `AndroidManifest.xml`). This is a library-level interaction between `expo-notifications` and `expo-audio`, not app code, and predates this alarm feature entirely.

**This is a real Android 15+ crash risk on the current production app, independent of the alarm work.** Not fixed by this spec. Recommended before shipping any 1.7.0 build (this feature's or otherwise): check for a newer `expo-audio`/`expo-notifications` patch version that resolves the boot-receiver-to-restricted-FGS call path; if none exists yet, this needs its own separate investigation/spec — do not fold it into the ALARM TASK numbering above, it touches unrelated library internals, not this feature's files.

## 8. Audit findings (verified 2026-07-16, against actual committed code — not the commit messages)

20 commits landed on this branch, not just the original 10 TASK commits — real device testing surfaced problems and the implementation correctly iterated past the spec's original text in several places (channel IDs ended up `-alarm-v4` not `-v1`; the delivery mechanism pivoted from Expo-only `dataOnly` pushes to a native Firebase Admin SDK path, `apps/api/src/utils/fcmAlarmPush.js`, because Expo data-only pushes don't reliably wake `setBackgroundMessageHandler` on Android 14 — documented in that file's own header comment). None of that is a problem; it's the spec's original text going stale against real findings, which is expected. Verified: `apps/api` — 70 suites / 683 tests pass. `apps/customer-app` — 31 suites / 223 tests pass, eslint clean on all touched files. No committed secrets (`firebase-service-account.json` and `plans/villkro-firebase-adminsdk-*.json` both confirmed git-ignored, never tracked).

**Confirmed bug — FIXED (commit `f2bcd2b`):**
- `apps/customer-app/src/hooks/useLocalNotifications.js` (~:742-765) — the `addNotificationReceivedListener` added for the Expo-fallback transport (used only when a device has no native FCM token registered) played `alarmSound.js`'s loud tone with no `AppState` gate, layering on top of the existing 8s foreground chime loop. Gated to `AppState.currentState !== 'active'`, matching `useNewOrderAlert.js`'s own foreground-only convention. Verified: 31/31 suites, 223/223 tests pass, eslint clean.

**Bundled but unrelated — still needs your call, not touched by me:**
- Same branch also carries a real, well-tested fix for a cross-account session bug: shop logout left `auth.currentUser` (Firebase) pointed at the old phone, so a subsequent rider OTP login on the same device could fall back into the previous account. Fixed via a `sessionGeneration` counter guarding stale in-flight `/auth/me` responses (`useAuthStore.js`, `AuthScreen.js`, `ProfileScreen.js`, new tests in `__tests__/useAuthStore.adminMode.test.js`). Good fix, good tests, zero interaction with notification code — but it has nothing to do with this spec and wasn't asked for here. Options: leave it bundled (already committed, works, tested), or split it onto its own branch/PR before merging so the alarm feature's history stays clean. Your call — not acted on.

**Test-coverage gaps — CLOSED (commits `e0ff7fb`, `c475967`):**
- `apps/customer-app/src/utils/orderAlarmNotifications.js` and `src/utils/alarmSound.js` — added `__tests__/orderAlarmNotifications.test.js` (21 tests: dedupe, display/cancel wiring for both alert types, accept/reject action routing incl. no-token and API-throw cases, OS-banner-present vs true-data-only branching) and `__tests__/alarmSound.test.js` (7 tests: play/loop/stop, platform gate, per-kind memoization). Along the way found and fixed two real gaps in the shared `jest.setup.js` notifee/expo-audio mocks (missing `AndroidForegroundServiceType`, missing `setAudioModeAsync`/`pause`) that would have thrown as soon as anything invoked `displayAlarmNotification` — latent until these tests existed to hit that path.
- `apps/api/src/utils/fcmAlarmPush.js` — added `tests/fcmAlarmPush.test.js` (9 tests) plus a `firebase-admin/messaging` jest mock. `riderAssignment.test.js` now explicitly mocks `fcmAlarmPush` (was unmocked, silently hitting real logic against an exhausted pool.query queue) and has 2 new tests asserting both branches: FCM sent → no Expo fallback; FCM not sent → Expo fallback with the alarm channel/sound.
- `registerPushToken`'s `fcm_token` branch — 3 new tests in `pushTokenHygiene.test.js` (register+detach, skip-if-absent, skip-if-under-20-chars).
- Verified: `apps/api` 71/71 suites, 696/696 tests. `apps/customer-app` 33/33 suites, 251/251 tests. All lint clean.

**Dead code — REMOVED (commit `d6ecd08`):**
- `expoPush.js` `buildMessage()`'s `dataOnly` option was fully implemented and tested but never called with `dataOnly: true` from any production call site (superseded by the `fcmAlarmPush.js` native-FCM pivot). Removed the branch and its two dead tests; replaced with one test covering the fallback shape that actually ships (custom sound/tag/collapseId).

**Minor — FIXED (commit `5512600`):**
- `fcmAlarmPush.js:9` now reads `config.NODE_ENV`, matching sibling `expoPush.js`.

**Production-safety verdict:** No crash-class regressions, no data-shape changes leaking into customer/admin, no committed secrets, no new BOOT_COMPLETED-triggered foreground-service path. The one confirmed bug is fixed and tested. Only open item is the bundled-but-unrelated auth fix (your call on branch-split) — not a blocker to ship either way.
