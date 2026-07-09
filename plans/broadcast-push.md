# ProjectServeLoco — Implementation Spec (admin broadcast push visibility)

Diagnosis date: 2026-07-09 · Branch: `main` · Status: all tasks OPEN.
This file is written as an **instruction spec for an implementing AI**. Follow it literally.

---

## BACKGROUND — read to understand, not to act on

Admin broadcasts (`POST /api/admin/notifications`, target `everyone` or `phones`) insert DB rows and return "✅ Sent successfully to N customer(s)", but no phone notification arrives in production. Root cause (already confirmed — do NOT re-investigate):

- Most production users run an old Play Store binary that never registers an Expo push token, so `users.push_token` is NULL for them. The fix for that is the v1.4.0 Play production rollout (already submitted, outside this spec).
- The API compounds this by **failing silently**: in `apps/api/src/utils/expoPush.js`, `sendPushToMany` hits `if (messages.length === 0) return;` and exits without a trace. The call is fire-and-forget (`.catch(() => {})` in `notificationService.js`), and the 201 response counts DB rows inserted, not devices reachable. The admin has no way to know zero pushes went out.
- Bonus gap: Expo ticket errors other than `DeviceNotRegistered` (e.g. `InvalidCredentials`, `MessageRateExceeded`) are ignored entirely — not even logged.

These tasks make the failure **visible**: real send stats in logs, a `pushEligibleCount` field in the API response, and an honest admin-UI banner. They do NOT change when/whether pushes are sent.

---

## RULES FOR THE IMPLEMENTING AI — read before any task

1. **Do exactly what each task says. Nothing more.** No refactoring, renaming, reformatting, or "improving" code outside the listed steps. No new dependencies.
2. **Line numbers are approximate.** Locate code by file path + function name + quoted snippet, never by line number alone.
3. **Never change an API response shape** (rename/remove/re-nest fields). Adding a new field is allowed only where a task explicitly says so. Clients depend on camelCase/snake_case duplicates — keep both wherever they exist.
4. **After every backend task**: run `npm test` inside `apps/api`. All tests must pass before moving on. Test-file changes required to keep the suite green are part of the same task (they are listed as steps).
5. **Mark the task's checkboxes `[x]`** in this file when done, and append a one-line `NOTE (done):` describing what you did.
6. One commit per task, on `main`, message format: `fix: PUSH TASK <n> — <short title>`.
7. If a step is impossible as written (file moved, function renamed, snippet not found), **stop that task**, leave its checkbox unticked, add `BLOCKED: <reason>` under it. Do not invent an alternative.
8. Execute tasks **in order** (TASK 1 → TASK 3). Later tasks assume earlier ones are done.

**DO NOT TOUCH:**
- `cleanupDeadTokens` in `expoPush.js` — its behavior (null tokens only on `DeviceNotRegistered`) stays exactly as is.
- `sendPushToUser`'s return value — existing tests assert it resolves to `undefined`.
- The order-notification flow: `createNotification`, `createOrderNotification` in `notificationService.js` (except nothing — no task touches them), `updateOrderStatus` in `adminController.js`, anything in `src/realtime/`.
- Order/coupon locking, `apps/api/src/utils/coupons.js`.
- The fire-and-forget pattern itself: the Expo send must stay non-awaited (`target=everyone` can be thousands of users; the admin HTTP client times out at 15s).

---

# OPEN TASKS — in execution order

## TASK 1 — expoPush.js: send stats, full ticket-error logging, `countPushEligible`  `[P1]`

**Goal:** `sendPushToMany` returns `{ recipients, tokensFound, sent, failed }` from every exit path, every Expo error ticket is logged, and a new helper counts how many target users have a registered push token.

**Files:** `apps/api/src/utils/expoPush.js`, `apps/api/tests/expoPush.test.js`

**Steps:**
- [x] 1.1 In `expoPush.js`, add an internal helper above `cleanupDeadTokens`:
  ```js
  // Log every error ticket (Expo only nulls tokens for DeviceNotRegistered;
  // other errors like InvalidCredentials were previously invisible).
  const tallyTickets = (tickets, context) => {
    let ok = 0, failed = 0;
    for (const ticket of tickets || []) {
      if (ticket?.status === 'error') {
        failed++;
        console.error('[expoPush] %s ticket error: %s — %s', context, ticket.details?.error || 'unknown', ticket.message || '');
      } else {
        ok++;
      }
    }
    return { ok, failed };
  };
  ```
  Do not export it.
- [x] 1.2 Rework `sendPushToMany` to build and return a stats object. Shape: `{ recipients: <userIds length or 0>, tokensFound: 0, sent: 0, failed: 0 }`, declared **before** the `try`. Every exit path returns `stats` (the `catch` returns whatever accumulated so far). Specifically:
  - The early `if (!userIds || userIds.length === 0) return;` becomes `return stats;` (recipients 0).
  - After building `messages`: set `stats.tokensFound = messages.length;`. Replace the silent `if (messages.length === 0) return;` with:
    ```js
    if (messages.length === 0) {
      console.warn('[expoPush] sendPushToMany: 0 of %d target users have a valid push token — no device pushes sent', userIds.length);
      return stats;
    }
    ```
  - In the chunk loop: on `sendPushNotificationsAsync` throw, keep the existing `console.error` and `continue`, but first add `stats.failed += chunk.length;`. On success, add `const { ok, failed } = tallyTickets(tickets, 'sendPushToMany'); stats.sent += ok; stats.failed += failed;` before the existing `cleanupDeadTokens` call (which stays unchanged).
  - Final `return stats;` after the loop and in the outer `catch` (after the existing `console.error`).
- [x] 1.3 In `sendPushToUser`, after `const tickets = await expo.sendPushNotificationsAsync(...)`, add `tallyTickets(tickets, 'sendPushToUser');` (logging only). Do not change its return value.
- [x] 1.4 Add and export a new helper:
  ```js
  // How many of userIds can actually receive a device push.
  // Never throws; returns null on query failure (callers treat null as "unknown",
  // 0 as a definite "no devices" — do not collapse the two).
  const countPushEligible = async (pool, userIds) => {
    if (!userIds || userIds.length === 0) return 0;
    try {
      const placeholders = userIds.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM users WHERE id IN (${placeholders}) AND push_token IS NOT NULL`,
        userIds
      );
      return Number(rows?.[0]?.cnt ?? 0);
    } catch (err) {
      console.error('[expoPush] countPushEligible failed:', err.message);
      return null;
    }
  };
  ```
  Update the exports line to `module.exports = { sendPushToUser, sendPushToMany, cleanupDeadTokens, countPushEligible };`.
- [x] 1.5 Update `apps/api/tests/expoPush.test.js` so the suite passes with the new return shape. Existing `sendPushToMany` assertions that expect `undefined`/void resolutions must now assert the stats object:
  - chunk-send-rejects test → `{ recipients: 2, tokensFound: 2, sent: 0, failed: 2 }` (a thrown chunk counts all its messages as failed; a `DeviceNotRegistered` ticket counts as failed).
  - empty `userIds` test → `{ recipients: 0, tokensFound: 0, sent: 0, failed: 0 }`.
  - SELECT-rejects test → `{ recipients: 3, tokensFound: 0, sent: 0, failed: 0 }`.
  - cleanup-error test → `{ recipients: 1, tokensFound: 1, sent: 0, failed: 1 }`.
  Adjust the exact numbers to each test's fixture sizes if they differ — the rule is: `recipients` = userIds passed, `tokensFound` = valid tokens from the mocked SELECT, `sent`/`failed` = per-ticket outcomes.
- [x] 1.6 Add new tests in `expoPush.test.js`:
  - Mixed tickets `[error, ok, error]` for 3 users → resolves `{ recipients: 3, tokensFound: 3, sent: 1, failed: 2 }`.
  - Zero-token path: SELECT returns no rows → resolves with `tokensFound: 0`, `expo.sendPushNotificationsAsync` NOT called, `console.warn` spy called once.
  - `InvalidCredentials` error ticket → `console.error` spy called with a string containing `InvalidCredentials`, and NO `UPDATE users SET push_token = NULL` query issued.
  - `countPushEligible`: (a) rows `[[{ cnt: 2 }]]` → `2`; (b) empty result set → `0`; (c) pool rejection → `null`; (d) empty `userIds` → `0` with `pool.query` never called.
- [x] 1.7 Run `npm test` in `apps/api` — all green.

**Do NOT:** change `cleanupDeadTokens`; change `sendPushToUser`'s return; change `buildMessage`.

**Done when:** `sendPushToMany` resolves to a stats object on every path, zero-token broadcasts produce a `console.warn`, all ticket errors are logged, `countPushEligible` is exported, tests pass.

NOTE (done): TASK 1 implemented — added internal `tallyTickets` (logs every error ticket) above `cleanupDeadTokens`; reworked `sendPushToMany` to return `{ recipients, tokensFound, sent, failed }` on every exit path with a `console.warn` on zero tokens and `stats.failed += chunk.length` on chunk send rejection; added `tallyTickets` logging in `sendPushToUser` (return value unchanged); added + exported `countPushEligible` (returns number, or null on query failure, 0 for empty). Updated 3 existing assertions to the stats shape and added 7 new tests (mixed tickets, zero-token warn, InvalidCredentials no-null, 4× countPushEligible). `cleanupDeadTokens` and `buildMessage` untouched. Full API suite green (481 passed, 1 skipped) and lint clean (0 errors).

---

## TASK 2 — Broadcast pipeline: report `pushEligibleCount` to the admin client  `[P1]`

**Goal:** the broadcast API response tells the admin how many recipients actually have a push-capable device, without awaiting the Expo send.

**Files:** `apps/api/src/utils/notificationService.js`, `apps/api/src/controllers/adminController.js`, `apps/api/tests/notifications.test.js`

**Steps:**
- [x] 2.1 In `notificationService.js`, function `createBroadcastNotification`, locate (after the commit):
  ```js
  // Batch push — fire after commit so tokens are read from a stable DB state.
  expoPush.sendPushToMany(pool, targetUserIds, { title, body }).catch(() => {});

  return { batchId, count: targetUserIds.length };
  ```
  Replace with:
  ```js
  // Surfaced to the admin client: how many recipients can receive a device push.
  const pushEligibleCount = await expoPush.countPushEligible(pool, targetUserIds);

  // Batch push — fire after commit so tokens are read from a stable DB state.
  // data.type mirrors the order-flow push payload (createNotification).
  expoPush.sendPushToMany(pool, targetUserIds, { title, body, data: { type: type || 'info' } }).catch(() => {});

  return { batchId, count: targetUserIds.length, pushEligibleCount };
  ```
  The COUNT is awaited (indexed PK lookup, milliseconds); the send stays fire-and-forget.
- [x] 2.2 In `adminController.js`, function `createAdminNotification`, in the final `res.status(201).json({ ... })` block, add one field inside `data`, directly after `recipientCount: result.count,`:
  ```js
  pushEligibleCount: result.pushEligibleCount ?? null,
  ```
  Change nothing else in the response (additive only — `batchId`, `recipientCount`, `matchedPhones`, `unmatchedPhones` all stay).
- [x] 2.3 In `apps/api/tests/notifications.test.js`, in the broadcast-creation test, add `expect(res.body.data).toHaveProperty('pushEligibleCount');`. If the mock pool doesn't recognize the new `SELECT COUNT(*)` query, either let the helper's defensive fallback return a value or add a mock branch matching `SELECT COUNT(*)` + `push_token IS NOT NULL` returning `[[{ cnt: 0 }]]` — whichever keeps the suite green with the smallest change.
- [x] 2.4 Run `npm test` in `apps/api` — all green.

**Do NOT:** await `sendPushToMany`; change `createNotification` / `createOrderNotification`; touch the socket-emit block in `createAdminNotification`.

**Done when:** `POST /api/admin/notifications` responds 201 with all existing fields intact plus `data.pushEligibleCount` (number, or null when the count query failed); tests pass.

NOTE (done): TASK 2 implemented — `createBroadcastNotification` now awaits `expoPush.countPushEligible(pool, targetUserIds)` and returns `pushEligibleCount`; the Expo send stays fire-and-forget but now passes `data: { type: type || 'info' }` (mirrors order-flow payload). `createAdminNotification` adds `pushEligibleCount: result.pushEligibleCount ?? null` additively inside `data` after `recipientCount` (all existing fields preserved). `notifications.test.js` adds `expect(res.body.data).toHaveProperty('pushEligibleCount')` — the mock pool's defensive `return [[]]` fallback makes `countPushEligible` return 0, so the field is present. Did NOT await `sendPushToMany` or touch `createNotification`/`createOrderNotification`/socket-emit. Full API suite green (481 passed, 1 skipped), lint clean (0 errors).

---

## TASK 3 — Admin UI: honest success banner  `[P2]`

**Goal:** after sending a broadcast, the admin sees how many recipients have push-capable devices, and a clear warning when none do.

**Files:** `apps/admin/src/pages/Notifications.jsx`

**Steps:**
- [x] 3.1 In `handleSend`, where the success message is built from the response (`recipientCount`, `matchedPhones`, `unmatchedPhones`), read the new field and build a hint:
  ```js
  const pushEligible = res?.data?.pushEligibleCount;
  let pushHint = '';
  if (typeof pushEligible === 'number') {
    pushHint = pushEligible === 0
      ? ' ⚠️ Saved to in-app inboxes, but none of these customers have a push-capable device — no phone notifications will be delivered.'
      : ` — ${pushEligible} have push-capable devices (others will see it in-app)`;
  }
  ```
  Append `pushHint` to the existing "✅ Sent successfully to {N} customer(s)!" success message. The `typeof` guard keeps the UI working against an older API (field absent) and the `null` "unknown" case (show no hint).
- [x] 3.2 Run `npm run lint` in `apps/admin`. No new state, no new components, no styling changes beyond the message text.

**Do NOT:** change the request payload, the error path, the unmatched-phones warning, or the broadcasts history table.

**Done when:** success banner shows the device count (or the ⚠️ zero-devices warning); lint passes.

NOTE (done): TASK 3 implemented — in `handleSend` (`apps/admin/src/pages/Notifications.jsx`), read `res?.data?.pushEligibleCount` and build `pushHint`: `⚠️ …no push-capable device…` when 0, else ` — N have push-capable devices (others will see it in-app)`; appended `${pushHint}` to the existing success message. The `typeof === 'number'` guard keeps the UI working against an older API (field absent) and the `null` "unknown" case (no hint). No new state, components, or styling; request payload, error path, unmatched-phones warning, and broadcasts history table untouched. `npm run lint` in apps/admin passes with 0 errors/warnings; `npm run build` succeeds.

---

## VERIFICATION (after all tasks)

- [x] `cd apps/api && npm test` — full suite green (watch `expoPush.test.js`, `notifications.test.js`, `pushTokenHygiene.test.js`).
- [x] `cd apps/api && npm run lint` and `cd apps/admin && npm run lint`.
- [ ] Manual: `POST /api/admin/notifications` with `{"title":"t","body":"b","type":"info","target":"everyone"}` (admin bearer) → 201, existing fields intact, `pushEligibleCount` present. Repeat with `target:"phones"` → `matchedPhones`/`unmatchedPhones` still present.
- [ ] With a local DB where every `push_token` is NULL: API log prints `[expoPush] sendPushToMany: 0 of N target users have a valid push token`; admin UI shows the ⚠️ banner.
- [ ] Regression: change an order's status from the admin panel → single-user push path (`sendPushToUser`) behaves as before.

NOTE (verification): Automated checks pass — `apps/api` full suite green (481 passed, 1 skipped; `expoPush.test.js`, `notifications.test.js`, `pushTokenHygiene.test.js` all pass), `apps/api` lint 0 errors, `apps/admin` lint 0 errors + build succeeds. The three remaining checkboxes are live-DB/manual checks needing a running MySQL/Mongo + admin bearer (not available in this headless env); their automated equivalents are green: (a) 201 + `pushEligibleCount` for `target:"everyone"` → `notifications.test.js`; the `target:"phones"` path is additive-only in `adminController.js`, so `matchedPhones`/`unmatchedPhones` are preserved; (b) zero-token `console.warn` → expoPush unit test "warns and sends nothing when no target users have a valid push token"; (c) `sendPushToUser` regression → its tests still resolve to `undefined` and only gained `tallyTickets` logging (return/flow unchanged). Owner to run the live-DB smoke before prod.

## DO NOT ATTEMPT (owner/manual — context only)

- **Play rollout**: v1.4.0 was submitted to the Play production track on 2026-07-09. Broadcast pushes reach real devices only after users install it and log in (token registration). No code task can fix old binaries.
- **Expo receipt polling** (`getPushNotificationReceiptsAsync`): deliberate follow-up, not in this spec. Do not add it.
- **Force-update prompt** in the customer app: separate decision, not in this spec.
