# VillKro — `apps/web/src/api` Bug Checklist

> **Audit date:** 2026-06-15
> **Verified:** 2026-06-15 — each entry checked against actual code.
> Only **B1, B6, B8** were real and have been fixed. See per-item VERDICT lines.
> **Scope:** Strictly `apps/web/src/api/` and the modules that import it
> (zustand stores, the `RealtimeManager` component, the `client.js`
> axios instance). Each item below is a checklist entry. Tick the box
> when the fix is shipped AND verified.

## Severity legend

- 🔴 **High** — breaks user-visible behavior, security, or session state.
- 🟠 **Medium** — causes incorrect state, data leaks, or a meaningful UX
  regression under normal use.
- 🟡 **Low** — code hygiene, robustness, or minor consistency.

---

## 🔴 B1 — No 401 interceptor → users stay "logged in" after token expires

> **VERDICT: REAL — ✅ FIXED.** Added a 401 response interceptor in
> `apps/web/src/api/client.js` that lazily imports the auth store and calls
> `logout()` (guarded against re-entrancy, and only when a token exists so a
> 401 on the login call itself is left as "wrong credentials"). `AuthGuard`
> reactively redirects to `/auth` when the token clears.

**Files**

- `apps/web/src/api/client.js`
- `apps/web/src/stores/authStore.js`

**Why it is a bug**

The axios client only normalizes errors in the response interceptor; it
never *reacts* to a 401. When the backend returns `401 UNAUTHORIZED`
because the JWT expired, the call rejects with a `customError` whose
`status` is 401, but the user's auth slice is never cleared, the
`RealtimeManager` never disconnects, and React Router keeps rendering
the protected screens. The user has to manually sign out to recover.

The frontend already has a `useAuthStore.logout()` that does the right
cleanup (clears `localStorage`, disconnects the socket, clears
`ath-dismissed`), so the fix is to **call** it on 401.

**Checklist**

- [ ] Add a 401 response interceptor in `apps/web/src/api/client.js`
      that:
  - [ ] Calls `useAuthStore.getState().logout()` (import lazily to
        avoid a circular import — see note below).
  - [ ] Lets `AuthGuard` handle the actual redirect to `/auth`.
- [ ] Verify there is no import cycle:
      `client.js → authStore.js → realtimeClient.js → client.js` would
      be a cycle. Solution: import the store dynamically inside the
      interceptor (`const { useAuthStore } = await import(...)`), or
      put the interceptor in a small `setupClientInterceptors(client)`
      helper that the store calls after both modules are loaded.
- [ ] Re-test the flow:
  - [ ] Log in.
  - [ ] Set `JWT_SECRET` to a wrong value in `apps/api/.env` and
        restart the API.
  - [ ] Reload the page → any authenticated request now 401s.
  - [ ] Confirm the user is bounced to `/auth` and the badge counter,
        cart, and notifications stop bleeding data.
- [ ] Manual regression: log in, sign out via the UI, confirm no
      infinite redirect loop and no console errors.

---

## 🔴 B2 — `realtimeClient.disconnectCustomerRealtime()` calls `removeAllListeners()` AFTER `disconnect()`

> **VERDICT: NOT A BUG (already correct).** Current code calls
> `socket.removeAllListeners()` *before* `socket.disconnect()`
> (`realtimeClient.js:126-128`), then resets `socket/activeToken/connectPromise`.
> No change needed.

**File**

- `apps/web/src/api/realtimeClient.js`

**Why it is a bug**

Reading the current code shows the order is actually `disconnect()`
first, then `activeToken = null`. The `removeAllListeners()` is
**missing** altogether. That means the old socket still has its
`connect` / `disconnect` / order / notification listeners attached
after the user logs out. If a stale event arrives between logout and
the GC of the socket, it can fire into the **new** user's subscriber
handlers once they sign in (handler maps are module-level in
`realtimeClient.js`, see `const listeners = new Map()`).

**Checklist**

- [ ] In `disconnectCustomerRealtime`, call `removeAllListeners()`
      **before** `disconnect()`.
- [ ] Reset `socket = null; activeToken = null; connectPromise = null;`
      in that order.
- [ ] Add a comment block explaining the order — this is the kind of
      thing a future refactor will get wrong.
- [ ] Test:
  - [ ] Log in as user A, then log out.
  - [ ] Log in as user B.
  - [ ] From a separate admin session, trigger a
        `notification.created` for user A's id.
  - [ ] Confirm user B's UI does **not** receive it.

---

## 🔴 B3 — `connectPromise` is reused across tokens (TOCTOU)

> **VERDICT: NOT A BUG.** `activeToken` is assigned *after* both guard checks
> (line 97), and there is no `await` between the guards and socket creation —
> JS is single-threaded so two callers cannot interleave to share a socket
> across different tokens. No change needed.

**File**

- `apps/web/src/api/realtimeClient.js`

**Why it is a bug**

```js
if (connectPromise && activeToken === token) {
  return connectPromise;
}
```

`activeToken` is set **just above** this check to the new token, so the
second clause `activeToken === token` becomes true only by coincidence
if a second caller asks for the same new token. In practice, two
near-simultaneous calls with different tokens can both resolve to the
first caller's socket. The fix is to scope the in-flight promise to
the token it was started for.

**Checklist**

- [ ] Replace the single `let connectPromise = null` with a
      `Map<token, Promise>` (or a `{ token, promise }` record) so
      each token has its own in-flight promise.
- [ ] When disconnecting, drop the entry for the current token.
- [ ] Verify with the same test as B2 (two rapid logins).
- [ ] Add a comment that explains why the map is keyed by token.

---

## 🔴 B4 — `markRead` never decrements the badge

> **VERDICT: MOOT (dead code).** `notificationsApi.markRead`,
> `deleteNotification`, and the store's `decrementUnread` are not called from
> any screen/component. The bell UI uses `markAllRead` (which sets count to 0).
> No live code path is affected; left as-is.

**Files**

- `apps/web/src/api/notificationsApi.js`
- `apps/web/src/stores/notificationStore.js`
- `apps/web/src/screens/NotificationsScreen/NotificationsScreen.jsx`

**Why it is a bug**

The store exports `decrementUnread` but nothing calls it. After the
user taps a notification in the bell UI and `notificationsApi.markRead`
succeeds, the backend's `read_at` is set, but the local `unreadCount`
is unchanged. The badge keeps showing the old number until the next
realtime `notification.unread_count.updated` event — and that event
only fires for broadcast inserts (see
`apps/api/src/realtime/orderEvents.js:emitNotificationRow`), not for
single-row reads.

**Checklist**

- [ ] Decide the source of truth:
  - [ ] **Option A (recommended):** trust the backend, refresh
        `unreadCount` after `markRead` by calling
        `notificationsApi.getUnreadCount()` (the store already has
        `fetchUnreadCount`).
  - [ ] **Option B:** optimistically call
        `useNotificationStore.getState().decrementUnread()` from the
        screen that called `markRead`.
- [ ] Do the same for `deleteNotification`: a deleted unread row
      should decrement the badge.
- [ ] Test:
  - [ ] Open the app with 3 unread notifications.
  - [ ] Tap one in the bell dropdown.
  - [ ] Confirm the badge goes to 2 immediately.
  - [ ] Reload the page → backend returns 2, store agrees.

---

## 🔴 B5 — Inconsistent response unwrapping across the API module

> **VERDICT: NOT A BUG — doc advice is WRONG.** The interceptor returns
> `response.data` (the HTTP body), and the backend wraps payloads as
> `{ data: ... }`. So `res.data || res` correctly reaches into that envelope.
> Removing it (as the doc suggests) would break settings/notifications. Left
> as-is. The only real consistency win would be a documented helper, not a
> behavior change.

**Files**

- `apps/web/src/api/client.js`
- `apps/web/src/stores/notificationStore.js`
- `apps/web/src/stores/settingsStore.js`
- `apps/web/src/components/RealtimeManager.jsx`
- `apps/web/src/screens/AuthScreen/AuthScreen.jsx`

**Why it is a bug**

The axios response interceptor unwraps to `response.data`, so the
return value of every `apiClient.*` call is the **body**, not the
AxiosResponse. Then several call sites do
`const payload = res.data || res;` — that is a second unwrap. It
works for `res.data = body` (so `payload === body`), but masks two
classes of mistakes:

- When a test stub returns the raw body, `res` is the body, `res.data`
  is `undefined`, and `payload` falls back to `res` — fine by accident.
- When an API actually returns `{ data: { ... } }` and the client was
  *supposed* to double-unwrap, the call site silently picks the outer
  wrapper and shows "undefined" everywhere.

**Checklist**

- [ ] Pick one convention and document it at the top of
      `apps/web/src/api/client.js`. Recommended:
      *the interceptor returns `response.data`; call sites use the
      body directly; never double-unwrap.*
- [ ] Remove the `res.data || res` pattern from every store and
      component. Replace with a plain `const body = await ...;` and
      use `body` directly.
- [ ] Add a tiny test (or a `// @ts-check` JSDoc on `apiClient.*`)
      to lock the contract.
- [ ] Sweep all `useEffect` blocks in `RealtimeManager.jsx` and the
      auth screen for the same anti-pattern.

---

## 🟠 B6 — Auth limiter is shared between `/login` and `/signup`

> **VERDICT: REAL — ✅ FIXED.** Replaced the single shared `authLimiter` with
> per-flow limiter instances (`loginLimiter`, `registerLimiter`,
> `passwordResetLimiter`) in `apps/api/src/routes/authRoutes.js`. `/register`
> and its `/signup` alias intentionally share one bucket (same flow); login and
> password-reset now have independent budgets.

**Files**

- `apps/web/src/api/authApi.js`
- `apps/api/src/routes/authRoutes.js`

**Why it is a bug**

The backend's `authLimiter` (15 min / 10 requests) is mounted on
**both** `/register` and `/signup` (intentional alias for the
frontend). The frontend exposes both `login()` and `signup()` in
`authApi.js`. So if a user fat-fingers the password 5 times, they
also burn 5 of their 10-request budget for the *signup* flow, even
though they are not signing up. After 10 bad logins, the user is
locked out of signup **and** login for 15 minutes.

**Checklist**

- [ ] Decide on the desired UX:
  - [ ] **Option A:** Drop the `/signup` alias from the frontend
        and route everything through `/register`.
  - [ ] **Option B:** Keep the alias but split the limiter — one
        key per (route, IP) pair in
        `apps/api/src/routes/authRoutes.js`.
- [ ] Add a comment in `authRoutes.js` calling out the shared bucket
      so the next person does not add another path that shares it.

---

## 🟠 B7 — `cartApi.js` is misnamed and misleading

> **VERDICT: COSMETIC (not a bug).** Naming-only; behavior is correct. Deferred.

**File**

- `apps/web/src/api/cartApi.js`

**Why it is a bug**

The export is named `cartApi.calculate(...)` and the file is in
`src/api/`, but the cart itself is purely client-side
(`cartStore.js` with `persist` middleware). The API call only
**prices** a hypothetical cart — it does not persist it.

The native customer-app (see `apps/customer-app/src/stores/useCartStore.js`)
also has a client-side cart, so the inconsistency is consistent — but
the file name suggests server-side cart state, which does not exist.

**Checklist**

- [ ] Pick a direction:
  - [ ] **Option A:** Rename `cartApi.js` → `pricingApi.js` (or
        `cartPricingApi.js`) and update the single caller.
  - [ ] **Option B:** Add a real server-backed cart at
        `apps/api/src/routes/cartRoutes.js` (currently only
        `POST /calculate` exists), then keep the name.
- [ ] If you go with A, also rename `selectCartDisplayTotal` →
      `selectCartClientDisplayTotal` for symmetry (optional).

---

## 🟠 B8 — Order cancel retry returns 400 to the user

> **VERDICT: REAL — ✅ FIXED (backend, the cleanest option).** `cancelOrder` in
> `apps/api/src/controllers/orderController.js` is now idempotent: an
> already-`Cancelled` order returns 200 with the order instead of 400. The
> non-Pending (e.g. Preparing) 400 branch is unchanged. Note: the web app's
> `ordersApi.cancelOrder` is not yet wired to a screen, but the native app and
> any future caller are now protected.

**Files**

- `apps/web/src/api/ordersApi.js`
- `apps/api/src/routes/orderRoutes.js`
- `apps/web/src/screens/OrderDetailScreen/OrderDetailScreen.jsx`

**Why it is a bug**

The frontend fires `POST /orders/:id/cancel` (the backend aliases
PATCH and POST). A flaky network can cause the call to land twice.
The second call hits the controller's check

```js
if (order.status !== 'Pending') { return 400 ... }
```

and the user sees: *"Only pending orders can be cancelled"* — even
though the order was cancelled successfully the first time.

**Checklist**

- [ ] Add a small request-id (or just
      `config.headers['X-Idempotency-Key']`) to the cancel call from
      `ordersApi.cancelOrder`.
- [ ] In the OrderDetailScreen, treat 400 with that exact message as
      success and refresh the order detail silently. Better: catch
      any 400 whose message starts with "Only pending orders" and
      re-fetch the order to update the UI.
- [ ] Or: in the backend, change the cancel handler to be idempotent
      — if the order is already cancelled, return the existing order
      with 200 instead of 400. This is the cleanest fix.
- [ ] Test:
  - [ ] Throttle the network in DevTools to "Slow 3G".
  - [ ] Tap "Cancel" twice quickly.
  - [ ] Confirm the UI shows cancelled, not an error.

---

## 🟠 B9 — `getProduct(id, type)` ignores `type`

> **VERDICT: NOT A BUG (already correct).** `getProductById`
> (`productController.js:183-205`) reads `req.query.type === 'combo'` and looks
> up the `combos` table accordingly. The `type` knob works. No change needed.

**Files**

- `apps/web/src/api/productsApi.js`
- `apps/api/src/controllers/productController.js`

**Why it is a bug**

The client signature is `getProduct(id, type)` and the call sends
`?type=...`. The backend's `getProductById` only filters by `id`,
returning either a product row or a 404. A caller that passes
`type='combo'` to disambiguate a combo id from a product id gets a
404 (or the wrong row), and the error message has no hint that
`type` exists as a knob.

**Checklist**

- [ ] Decide:
  - [ ] **Option A:** Implement type-aware lookup in the backend —
        try `products` first; if `type='combo'` and not found, look
        in `combos` and return the combo.
  - [ ] **Option B:** Drop the `type` argument from the client and
        the API; rename to `getProduct(id)` to match the actual
        behavior.
- [ ] Update the `API.md` if you keep the parameter.

---

## 🟠 B10 — `bindSocketEvents` leaks local listeners on socket reuse

> **VERDICT: NOT A CURRENT BUG (latent).** `bindSocketEvents` is only ever
> called on a freshly-built socket, so no double-binding happens today (the doc
> concedes "right now it is safe"). Deferred as defensive hardening.

**File**

- `apps/web/src/api/realtimeClient.js`

**Why it is a bug**

```js
function bindSocketEvents(nextSocket) {
  ORDER_EVENTS.forEach(name => nextSocket.on(name, ...));
  NOTIFICATION_EVENTS.forEach(name => nextSocket.on(name, ...));
  if (import.meta.env.DEV) {
    nextSocket.on('connect', ...);
    nextSocket.on('disconnect', ...);
  }
}
```

`bindSocketEvents` is only called on a **newly-built** socket
inside `connectCustomerRealtime`, so right now it is safe — but a
future change that reuses the same socket for a token refresh will
double-bind every handler. The order/notification handlers are the
same function references, so the user would see the same
notification rendered twice on every event.

**Checklist**

- [ ] Make `bindSocketEvents` defensive: track bound sockets in a
      `WeakSet` and no-op if called twice on the same socket.
- [ ] Add a `// NOTE:` comment warning future readers not to refactor
      this into a "hot path" reuse.
- [ ] Add a unit test that calls `bindSocketEvents` twice on the
      same stub socket and asserts each event fires exactly once per
      emit.

---

## 🟠 B11 — `getActiveOffer` falls back across store types

> **VERDICT: NOT A BUG.** The "silent re-run without filter" described does not
> exist. `getActiveOffer` (`settingsController.js:146-169`) filters by
> normalized `store_type` and returns `{ data: null }` when nothing matches —
> no cross-store fallback. No change needed.

**Files**

- `apps/web/src/api/settingsApi.js`
- `apps/api/src/controllers/settingsController.js`

**Why it is a bug**

The frontend calls `offersApi.getActiveOffer()` with no params.
The backend's `getActiveOffer` defaults `store_type` to `'packed'`
and then, if the store-filtered query returns nothing, **silently
re-runs the query without the filter**. End result: a customer
browsing the `fast_food` tab can see a `packed` offer in the
carousel. The frontend cannot tell the difference because the
`store_type` column is not in the response.

**Checklist**

- [ ] Frontend: always pass `storeType` from the active store context
      (read from `useSettingsStore` or the route).
- [ ] Backend: remove the silent fallback — if no offer matches the
      requested store, return `{ data: null }` and let the frontend
      render an empty carousel.
- [ ] Add a response field `store_type` to the offer payload so the
      frontend can self-correct if it ever gets a wrong-store offer.
- [ ] Test:
  - [ ] Create a packed-store offer.
  - [ ] Open the web PWA on the `fast_food` tab.
  - [ ] Confirm the offer is **not** shown.

---

## 🟡 B12 — No retry on transient network errors

> **VERDICT: ENHANCEMENT (not a bug).** Deferred.

**File**

- `apps/web/src/api/client.js`

**Why it is a bug**

`timeout: 15000` is set, but on a network blip (the request never
gets a response), the call rejects with `isNetworkError: true`.
There is no retry. For idempotent verbs (`GET`) the user just sees
an error and a skeleton stays forever; for `POST /cart/calculate`
they see a "Failed to calculate" toast on flaky connections.

**Checklist**

- [ ] Add a small retry-on-network-error interceptor for `GET` and
      `HEAD` only, capped at 2 retries with exponential backoff
      (250 ms, 750 ms).
- [ ] Never retry `POST` (no idempotency key in this codebase).
- [ ] Log retries to `console.warn` in DEV only.

---

## 🟡 B13 — `transports: ['websocket', 'polling']` ordering

> **VERDICT: ENHANCEMENT (not a bug).** Reconnection is enabled; socket.io
> falls back on its own. Deferred.

**File**

- `apps/web/src/api/realtimeClient.js`

**Why it is a bug**

In some corporate proxies the upgrade from polling to websocket
hangs forever. Pinning the order to start with websocket is
slightly riskier than relying on socket.io's default. The
symptom: a customer behind a strict proxy sees realtime just stop
working and the badge counter stops updating.

**Checklist**

- [ ] Either drop the `transports` option entirely (let socket.io
      pick), or set it to `['polling', 'websocket']` so the initial
      handshake always succeeds over HTTP and upgrades only after
      the connection is established.
- [ ] Document the choice in a comment.

---

## 🟡 B14 — `dashboardApi` does not pass the user's store type

> **VERDICT: MINOR UX (not a correctness bug).** Deferred.

**File**

- `apps/web/src/api/dashboardApi.js`

**Why it is a bug**

`getDashboard(storeType)` is called from screens, but the
`storeType` arg is sometimes `undefined` on first render (before
`useSettingsStore` has hydrated). The backend treats `undefined` as
"all", which means the very first dashboard request returns the
**combined** dashboard, and only later requests filter correctly.
The user sees a layout shift.

**Checklist**

- [ ] In the home screen, gate the `dashboardApi.getDashboard` call
      until `useSettingsStore` has finished its first fetch (or
      pass a sensible default `storeType`).
- [ ] In the backend, return 400 if `storeType` is missing on the
      dashboard route (defensive — never silently fall back to
      "all").

---

## 🟡 B15 — `fetchUnreadCount` fires on every realtime notification event

> **VERDICT: PREMISE WRONG.** A customer socket only receives events targeted
> at that user, not one-per-user broadcasts — so the "1000 in-flight requests
> on a phone" scenario doesn't occur for a customer client. A trailing debounce
> would still be a minor nicety; deferred.

**Files**

- `apps/web/src/api/notificationsApi.js`
- `apps/web/src/stores/notificationStore.js`
- `apps/web/src/components/RealtimeManager.jsx`

**Why it is a bug**

A broadcast notification to "everyone" emits one
`notification.created` per user, and `RealtimeManager` calls
`fetchUnreadCount` on each one. For a 1000-user customer base, that
is 1000 network round-trips in a few seconds. The backend handles
it fine, but the frontend is the bottleneck (1000 in-flight
HTTP/1.1 requests on a phone).

**Checklist**

- [ ] Debounce `fetchUnreadCount` with a 1-second trailing debounce
      inside `RealtimeManager.jsx`.
- [ ] Or: in `notificationStore.js`, accept a delta instead of
      re-fetching — increment `unreadCount` by 1 on
      `notification.created`, only re-fetch on
      `notification.unread_count.updated` (the backend already sends
      that).
- [ ] Measure: with 5 rapid-fire events, confirm only 1 HTTP call
      happens.

---

## 🟡 B16 — `updateProfile` accepts a never-sent field

> **VERDICT: NOT A BUG (doc agrees).** Dead-code alias only. Deferred.

**Files**

- `apps/web/src/api/authApi.js`
- `apps/api/src/routes/authRoutes.js`

**Why it is a bug**

`routes/authRoutes.js:profileSchema` accepts `req.body.whatsapp`
(no underscore) as a fallback, but the frontend only ever sends
`whatsappNumber`. The second branch is dead code. Not a bug — just
dead code. Mentioned for completeness.

**Checklist**

- [ ] Pick one of:
  - [ ] Remove the `whatsapp` fallback in the backend schema.
  - [ ] Add a comment in the frontend that the backend accepts
        `whatsapp` as an alias.
- [ ] Same audit for any other camelCase/snake_case fallback the
      backend carries.

---

## 🟡 B17 — `VITE_API_URL` is captured at build time

> **VERDICT: ENHANCEMENT (not a bug).** Runtime override is a deploy
> convenience, not a defect. Deferred.

**File**

- `apps/web/src/api/client.js`

**Why it is a bug**

`import.meta.env.VITE_API_URL` is replaced at *build* time. The
same bundle cannot be repointed at a different backend at runtime
(useful for preview deploys that want to point at a staging API
without a rebuild).

**Checklist**

- [ ] Add a runtime override in this priority order:
  1. `window.__API_URL__` (set by a small inline script in
     `index.html`).
  2. `localStorage.getItem('apiBaseUrl')` (for in-app override).
  3. `import.meta.env.VITE_API_URL`.
  4. The localhost default.
- [ ] Re-build the PWA once to make sure the override works.

---

## Summary

| # | Severity | Title | Verdict |
|---|----------|-------|---------|
| B1 | 🔴 | 401 interceptor missing | ✅ REAL — FIXED |
| B2 | 🔴 | Disconnect listener order | ❌ Not a bug (already correct) |
| B3 | 🔴 | connectPromise TOCTOU | ❌ Not a bug |
| B4 | 🔴 | markRead does not decrement badge | ➖ Moot (dead code) |
| B5 | 🔴 | Inconsistent response unwrapping | ❌ Not a bug (doc advice wrong) |
| B6 | 🟠 | Auth limiter shared | ✅ REAL — FIXED |
| B7 | 🟠 | cartApi misnamed | ➖ Cosmetic |
| B8 | 🟠 | Cancel retry leaks 400 | ✅ REAL — FIXED |
| B9 | 🟠 | getProduct ignores type | ❌ Not a bug (already correct) |
| B10 | 🟠 | Socket listener binding fragility | ➖ Latent only, deferred |
| B11 | 🟠 | getActiveOffer cross-store fallback | ❌ Not a bug |
| B12 | 🟡 | No retry on network errors | ➖ Enhancement |
| B13 | 🟡 | transports order | ➖ Enhancement |
| B14 | 🟡 | dashboardApi no default | ➖ Minor UX |
| B15 | 🟡 | fetchUnreadCount on every event | ❌ Premise wrong |
| B16 | 🟡 | Dead fallback in profileSchema | ❌ Not a bug |
| B17 | 🟡 | VITE_API_URL build-time only | ➖ Enhancement |

**Verified result:** 3 real bugs (B1, B6, B8) — all fixed. The other 14 were
already-correct code, dead code, wrong premises, or deferred enhancements.
Verification: `apps/api` 185 tests pass, lint 0 errors; edited web `client.js`
lints clean.