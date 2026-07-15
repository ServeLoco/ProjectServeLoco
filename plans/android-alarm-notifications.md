# ProjectServeLoco — Android Alarm-Style Order/Offer Alerts (Shop-Owner + Rider)

Spec date: 2026-07-16 · Branch: create `feat/androidAlarmNotifications` off `bugs` (or `main`, ask user which) · Status: **NOT STARTED**
Instruction spec for an implementing AI. Follow it literally.

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
- [x] `apps/api/src/utils/shops.js:40-41` — shop-owner new-order push: dataOnly + alertType `new_order_alarm`, kept `type`/`orderId`, added `orderNumber`.
- [x] `apps/api/src/services/riderAssignment.js` `pushRiderOffer()`: dataOnly + alertType `rider_offer_alarm`; kept offer/order ids + expiresAt; reminders reuse same path automatically.
- [x] Every other push call site untouched — only shops.js notifyShopsForOrder + pushRiderOffer set dataOnly.
- [x] `npm test` in `apps/api` — 70 suites / 683 passed.
- Acceptance: only these two call sites opt into `dataOnly`; `remindPendingOffers()` reminder pushes for rider offers also need `dataOnly: true` (same alarm type) since they hit the same `pushRiderOffer()` path — verified automatic.
- Commit: `feat: ALARM TASK 3 — send data-only push for shop/rider alarm alerts`

### — Phase 2: native sound assets —

### TASK 4 — Custom alarm sound files + prebuild-safe copy plugin
- [ ] Obtain or produce two louder/distinct alarm-style sound files (ask the user for source files if not already provided, or generate/source royalty-free alarm tones — confirm licensing is clear for commercial app use). Name them `order_alarm.wav` (shop-owner) and `rider_alarm.wav` (rider). Place in `apps/customer-app/assets/sounds/`.
- [ ] Write `apps/customer-app/plugins/withAlarmSounds.js` — an Expo config plugin (`withDangerousMod` or equivalent) that copies these two files from `assets/sounds/` into `android/app/src/main/res/raw/` during every `expo prebuild` run, so a future `--clean` prebuild doesn't silently drop them. Follow the existing plugin registration pattern already used for `@rnmapbox/maps` etc. in `app.json`'s `plugins` array (see `plans/mapbox-live-tracking.md` §1.3 for the pattern this repo follows for custom config plugins).
- [ ] Register `./plugins/withAlarmSounds` in `app.json`'s `plugins` array.
- Acceptance: after `expo prebuild --clean`, `android/app/src/main/res/raw/order_alarm.wav` and `rider_alarm.wav` exist without manual copying.
- Commit: `feat: ALARM TASK 4 — add custom alarm sound assets + prebuild copy plugin`

### — Phase 3: app-side notifee channels + display —

### TASK 5 — New notifee alarm channels
- [ ] In `apps/customer-app/src/hooks/useLocalNotifications.js`, add a notifee-based channel setup (separate from the existing `createAndroidChannel()` which stays untouched for `expo-notifications`): create `serveloco-orders-alarm-v1` and `serveloco-rider-offers-alarm-v1` via notifee's `createChannel` API, importance MAX, `sound: 'order_alarm'` / `'rider_alarm'` (referencing the `res/raw/` filenames from TASK 4 without extension, per notifee's Android sound convention), `bypassDnd: true`, appropriate vibration pattern (reuse `RIDER_VIBRATION_PATTERN` for the rider channel; define a matching shop-owner pattern or reuse `SHOP_VIBRATION_PATTERN` from `useNewOrderAlert.js`).
- [ ] Call this setup once at the same point the existing `createAndroidChannel()` is called (app init), guarded so it only runs on Android.
- [ ] `npx eslint .` — clean.
- Acceptance: channels created without touching `ORDER_NOTIFICATION_CHANNEL_ID`/`RIDER_OFFER_CHANNEL_ID` definitions or their creation call.
- Commit: `feat: ALARM TASK 5 — create notifee alarm channels for shop/rider`

### TASK 6 — Background message handler + full-screen alarm display
- [ ] In `apps/customer-app/index.js` (top-level, before `AppRegistry.registerComponent`), register `messaging().setBackgroundMessageHandler(async (remoteMessage) => { ... })`. Inspect `remoteMessage.data.alertType`; if `'new_order_alarm'` or `'rider_offer_alarm'`, call `notifee.displayNotification()` with `android.fullScreenAction` pointing at the app's main activity, `android.asForegroundService: true` (or notifee's documented equivalent for an ongoing alarm-style notification), the matching channel id from TASK 5, and Accept/Reject `android.actions`. If `alertType` doesn't match either alarm type, no-op (let existing behavior handle it — but recall these two push types are now data-only, so nothing else will render them; that's intended, this handler is their only path).
- [ ] Add a foreground `messaging().onMessage` listener (if one doesn't already exist for FCM specifically — check whether `expo-notifications`' existing foreground handling already covers this before adding a duplicate) that explicitly no-ops for `alertType: 'new_order_alarm' | 'rider_offer_alarm'` payloads, since `useNewOrderAlert.js`/`useRiderOfferAlert.js` already handle the foreground case via socket events, not via this FCM listener.
- [ ] `npx eslint .` — clean.
- [ ] **BOOT_COMPLETED safety check** (see §7 below): confirm `notifee.displayNotification()`/foreground-service start in this handler is reachable ONLY from `setBackgroundMessageHandler` (i.e. an actual FCM push arriving), never from any boot/reboot broadcast receiver. Do not register this handler or any code path that starts the alarm foreground service inside a `BOOT_COMPLETED`/`REBOOT`/`QUICKBOOT_POWERON` receiver — Android 15+ crashes apps that start restricted foreground-service types from boot receivers (Play Console already flags this exact crash class against `expo-notifications`' existing boot receiver reaching into `expo-audio`'s foreground services — do not add a second instance of it).
- Acceptance: killed-app push with `alertType: 'new_order_alarm'` or `'rider_offer_alarm'` triggers a notifee full-screen display; foreground behavior unchanged (verify no double-alert once on a device in TASK 10); confirmed zero code path from any boot receiver into this handler.
- Commit: `feat: ALARM TASK 6 — background handler triggers full-screen alarm display`

### TASK 7 — Stop/dismiss wiring
- [ ] Add `MAX_ORDER_ALARM_RING_MS` constant near `useNewOrderAlert.js` (or a shared constants file if one exists — check first) for the shop-owner alarm ring cap. Use `RIDER_OFFER_TIMEOUT_SEC * 1000` (imported/threaded from wherever the rider timeout is already exposed to the client, e.g. an existing offer object field — check if `riderAssignment.js`'s `RIDER_OFFER_TIMEOUT_SEC` is already surfaced to the client via an API response before adding a new constant; if not surfaced, use the offer's own `expiresAt` field from the push payload instead of a hardcoded duplicate value).
- [ ] On mount of the shop-owner dashboard screen (wherever `useNewOrderAlert`'s `active` flag is currently set to true — check the calling screen) and the rider dashboard screen (`useRiderOfferAlert` caller), call `notifee.cancelNotification()` for the corresponding alarm notification id so opening the app manually silences a still-ringing killed-app alarm.
- [ ] Wire Accept/Reject notifee action buttons (declared in TASK 6) to call the same accept/reject API functions the in-app UI already uses — check `ShopDashboard`/`RiderDashboard` accept/reject handlers and reuse them, do not duplicate the API call logic.
- Acceptance: alarm dismisses on accept, reject, in-app open, or timeout — never rings indefinitely.
- Commit: `feat: ALARM TASK 7 — wire alarm dismiss on accept/reject/open/timeout`

### — Phase 4: native manifest + rollout —

### TASK 8 — AndroidManifest permissions
- [ ] Add to `android/app/src/main/AndroidManifest.xml` (or, if this repo's convention edits `app.json`'s `android.permissions` array and lets prebuild regenerate the manifest — check TASK 2 pattern used in `plans/mapbox-live-tracking.md` first and follow whichever convention is actually used for permissions in this repo): `USE_FULL_SCREEN_INTENT`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE` with the required `<property>` metadata for the special-use justification string (Android 14+ requirement).
- [ ] Confirm `MainActivity`'s `launchMode` is already `singleTask` (it is, per §2.1 — no change needed, just verify post-prebuild it's still set).
- [ ] Add the Android 14+ runtime check (`notifee`'s `canUseFullScreenIntent()` or manifest-driven equivalent) with a heads-up-notification fallback if denied, inside the TASK 6 handler.
- [ ] Do NOT declare `android:name="android.intent.action.BOOT_COMPLETED"` (or `REBOOT`/`QUICKBOOT_POWERON`) on any receiver/service tied to the new `FOREGROUND_SERVICE_SPECIAL_USE` alarm service. Grep the post-prebuild merged manifest (`android/app/build/intermediates/merged_manifest/*/AndroidManifest.xml`) for `BOOT_COMPLETED` after this task and confirm the only match is the pre-existing `expo.modules.notifications.service.NotificationsService` entry (unrelated, pre-existing, tracked separately in §7) — no new receiver from notifee/this feature should appear there.
- Acceptance: manifest (post-prebuild) contains all three permissions; app doesn't crash on Android 14+ devices with full-screen-intent denied; no new BOOT_COMPLETED-triggered path into the alarm foreground service.
- Commit: `feat: ALARM TASK 8 — add full-screen-intent + foreground-service manifest permissions`

### TASK 9 — Version bump + prebuild + commit native diff
- [ ] Bump `runtimeVersion` in `app.json` from `"1.6.0"` to `"1.7.0"`.
- [ ] `git status` clean check first, then `npx expo prebuild --clean --platform android`.
- [ ] Review the resulting `android/` diff carefully — confirm it only reflects the new plugins (notifee, `withAlarmSounds`) and permission additions, no unrelated regeneration noise. Commit.
- Acceptance: `runtimeVersion` bumped; native `android/` diff is clean and reviewed; committed separately from app-code changes for a clear audit trail.
- Commit: `feat: ALARM TASK 9 — bump runtimeVersion, prebuild native android changes`

### — Phase 5: verification —

### TASK 10 — Device verification (cannot be done in a sandbox — needs a real Android device)
- [ ] Build via `eas.json` `development` profile, install on a real Android device.
- [ ] Force-quit the app. Trigger a real shop-owner new-order push with screen off and phone locked — confirm full-screen alarm UI appears over the lock screen, custom loud sound (`order_alarm.wav`) plays, vibration loops, Accept/Reject buttons work, and it self-cancels at `MAX_ORDER_ALARM_RING_MS` if ignored.
- [ ] Repeat for rider offer push — confirm `rider_alarm.wav`, and self-cancel at the existing offer-expiry window.
- [ ] Repeat both triggers as customer/admin roles — confirm behavior is byte-for-byte unchanged (quiet default tone, no full-screen intent, existing channels only).
- [ ] Foreground case for both roles: confirm no double-alert (only the existing 8s chime/vibrate loop fires, not also a notifee alarm).
- [ ] Full delivery-flow regression: place order → shop confirm → rider offer → accept → picked up → delivered — must behave identically to before this work, alarm behavior aside.
- Acceptance: all of the above observed on a real device by a human tester; this task cannot be marked done from code review alone.
- Commit: `docs: ALARM TASK 10 — device verification notes` (no code change expected; commit only if minor fixes were needed during verification, in which case fold them into the relevant earlier task's commit instead where possible)

---

## 6. Play Store submission (manual, not a code task)

Before submitting the build containing this feature, fill Play Console's permission-declaration forms for `USE_FULL_SCREEN_INTENT` and `FOREGROUND_SERVICE_SPECIAL_USE`. See `.claude/plans/elegant-finding-lollipop.md` (last section) for the reasoning and suggested framing. Expect a few extra days of review time versus a normal update.

## 7. Pre-existing Play Console warning — NOT part of this spec's scope, flagged only

Play Console pre-launch report (release 1.7.0, before this feature existed) already flags: *"Restricted foreground service types — apps starting BOOT_COMPLETED broadcast receivers cannot start certain foreground service types on Android 15+"*, naming `expo.modules.audio.service.AudioRecordingService.startForegroundWithNotification` and `expo.modules.audio.service.AudioControlsService.postOrStartForegroundNotification`.

Root cause confirmed in this repo's post-prebuild merged manifest: `expo.modules.notifications.service.NotificationsService` (from `expo-notifications`, already installed for the existing chime/vibrate alerts) registers a receiver on `BOOT_COMPLETED`/`REBOOT`/`QUICKBOOT_POWERON`/`MY_PACKAGE_REPLACED`. Play's static analysis found a reachable call path from that boot receiver into `expo-audio`'s restricted-type foreground-service starters (`mediaPlayback`/`microphone` types, declared in `expo-audio`'s own `AndroidManifest.xml`). This is a library-level interaction between `expo-notifications` and `expo-audio`, not app code, and predates this alarm feature entirely.

**This is a real Android 15+ crash risk on the current production app, independent of the alarm work.** Not fixed by this spec. Recommended before shipping any 1.7.0 build (this feature's or otherwise): check for a newer `expo-audio`/`expo-notifications` patch version that resolves the boot-receiver-to-restricted-FGS call path; if none exists yet, this needs its own separate investigation/spec — do not fold it into the ALARM TASK numbering above, it touches unrelated library internals, not this feature's files.
