# WhatsApp OTP Login Migration Plan

**Goal:** Replace the current `phone + password` login/signup with a passwordless **4-digit OTP delivered via WhatsApp**. Phone number is the only identity. Both first-time signup and returning login use the same OTP flow.

**Repo:** `ProjectServeLoco` (monorepo: `apps/api`, `apps/web`, `apps/customer-app`, `apps/admin`)

---

## 1. Current State (Recap)

- Backend: Node + Express, MySQL (raw `mysql2`), JWT (HS256, 7d), `bcrypt` passwords.
- Auth endpoints today: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/password-reset-requests` — all in `apps/api/src/controllers/authController.js:5-76` and `apps/api/src/routes/authRoutes.js:25-92`.
- `users` table has `password_hash NOT NULL` (`apps/api/src/db/migrate.js:56-91`).
- No SMS/WhatsApp/OTP integration exists. `whatsapp_number` is just a stored contact field.
- Admin login is separate (env-based) and **out of scope**.

---

## 2. Target Flow (User-facing)

### Signup (first-time number)
1. User opens app → enters **phone number** (+ name on the same screen, since we have no password step anymore).
2. Tap **Send OTP** → backend creates user row with `phone_verified_at = NULL`, generates 4-digit code, sends via WhatsApp template.
3. User enters 4-digit OTP → backend verifies, sets `phone_verified_at = NOW()`, returns JWT.

### Login (returning number)
1. User enters **phone number**.
2. Tap **Send OTP** → backend finds verified user, generates code, sends via WhatsApp.
3. User enters OTP → JWT returned.

### Resend & Limits
- **Resend** allowed after **30 s** cooldown.
- Max **5 OTP requests per phone per 15 min**.
- Max **5 verify attempts** per OTP before it is invalidated.
- OTP **expires in 5 minutes**.

---

## 3. WhatsApp Provider Decision

Pick one (recommend **Meta WhatsApp Cloud API** — free tier, official, template-based):

| Provider | Pros | Cons |
|---|---|---|
| **Meta Cloud API** (recommended) | Free 1k convos/mo, official | Requires Business verification + approved template |
| Gupshup | Easy India onboarding | Paid per message |
| Interakt | India-focused, simple dashboard | Paid |
| Twilio WhatsApp | Mature SDK | More expensive, US-centric |

Action: register a WhatsApp Business number, create an approved **`otp_code`** template:
> `Your ServeLoco verification code is {{1}}. Valid for 5 minutes. Do not share.`

---

## 4. Backend Changes (`apps/api/`)

### 4.1 Database migration
File: `apps/api/src/db/migrate.js`

- Alter `users`:
  - `password_hash VARCHAR(255) NULL` (make nullable; we will stop writing to it).
  - Add `phone_verified_at TIMESTAMP NULL`.
- New table:
  ```sql
  CREATE TABLE IF NOT EXISTS otp_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    purpose ENUM('signup','login') NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP NULL,
    ip VARCHAR(45) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_phone_created (phone, created_at),
    INDEX idx_expires (expires_at)
  );
  ```
- Update `apps/api/src/db/seed_demo.js:20,32` — drop `password_hash` seeding (or seed with NULL), set `phone_verified_at = NOW()` for demo users.

### 4.2 New env vars
File: `apps/api/src/config/env.js`

```
WHATSAPP_PROVIDER=meta            # meta | gupshup | mock
WHATSAPP_API_TOKEN=...            # Meta permanent access token
WHATSAPP_PHONE_NUMBER_ID=...      # Meta phone number ID
WHATSAPP_TEMPLATE_NAME=otp_code
WHATSAPP_TEMPLATE_LANG=en
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SECONDS=30
OTP_DEV_BYPASS_CODE=              # optional: e.g. "1234" only in dev
```

Add validation in the existing `requireEnv` block.

### 4.3 New service: WhatsApp sender
File: `apps/api/src/services/whatsappService.js` (new)

```js
// sendOtp({ to, code }) -> Promise<void>
// Implements Meta Graph API POST /{phone-number-id}/messages
// with template name + {{1}} body parameter = code.
// In dev/mock mode, console.logs the code instead of calling network.
```

### 4.4 New service: OTP logic
File: `apps/api/src/services/otpService.js` (new)

```js
generateOtp()                  // crypto.randomInt(1000, 10000) -> "0421"
createOtpRecord({phone,purpose,ip})  // hash with bcrypt(8 rounds), insert row, return code
verifyOtp({phone, code})       // find latest unconsumed non-expired, check attempts, bcrypt.compare,
                               // mark consumed_at, increment attempts on fail
```

Use `bcrypt(8 rounds)` for OTP hashing (fast, still safe for short-lived 4-digit secret).

### 4.5 Controller rewrite
File: `apps/api/src/controllers/authController.js`

Replace `register`, `login`, `requestPasswordReset` with:

- **`POST /api/auth/request-otp`** body `{ phone, name? }`
  - Validate phone (`^\+?[0-9]{10,15}$`).
  - Look up user by phone.
  - If exists → `purpose='login'`.
  - If not exists → require `name`, INSERT user row (`password_hash=NULL`, `phone_verified_at=NULL`), `purpose='signup'`.
  - Enforce rate limit (5/15min) and resend cooldown (30s) via `otp_requests` lookup.
  - Call `otpService.createOtpRecord` → `whatsappService.sendOtp`.
  - Return `{ status: 'sent', purpose, resendAfter: 30 }`. **Never** return the code.
- **`POST /api/auth/verify-otp`** body `{ phone, code }`
  - `otpService.verifyOtp`. On success:
    - Set `users.phone_verified_at = NOW()` if null.
    - `signCustomerToken({ sub: user.id })` → return `{ token, user }`.
  - On failure: 400 with reason (`invalid`, `expired`, `too_many_attempts`).

Keep untouched: `me`, `updateProfile`, `registerPushToken`, `requestAccountDeletion`, `cancelAccountDeletion`.

For `requestAccountDeletion` at `apps/api/src/controllers/authController.js:162-198` — replace its current password check with a fresh OTP verification (require `code` in body, validated against a new `purpose='delete'` OTP), OR drop the re-auth requirement entirely. Recommendation: require fresh OTP.

### 4.6 Routes
File: `apps/api/src/routes/authRoutes.js`

- Remove `registerSchema`, `loginSchema`, `passwordResetRequestSchema`.
- Add:
  ```js
  const requestOtpSchema = { phone: [required, isPhone], name: [optional, maxLen(255)] };
  const verifyOtpSchema  = { phone: [required, isPhone], code: [required, isOtp4] };
  ```
- Add `isOtp4` to `apps/api/src/validators/index.js` → regex `^[0-9]{4}$`.
- Wire:
  ```js
  router.post('/auth/request-otp', authLimiter, validate(requestOtpSchema), requestOtp);
  router.post('/auth/verify-otp',  authLimiter, validate(verifyOtpSchema),  verifyOtp);
  ```
- Tighten `authLimiter` to `max: 5, windowMs: 15*60*1000` keyed by `phone || ip`.
- **Delete** `/auth/register`, `/auth/login`, `/auth/password-reset-requests` routes. Optionally keep them returning `410 Gone` for a deprecation window.

### 4.7 Cleanup
- `apps/api/src/utils/auth.js` — keep `signCustomerToken`/`verifyToken`. `hashPassword`/`comparePassword` still used by admin env login, so leave them.
- Remove `bcrypt` import from `authController.js`.

### 4.8 Tests
- Rewrite `apps/api/tests/auth.test.js` to cover:
  - request-otp signup (creates user, sends OTP — mock provider)
  - request-otp login (existing user)
  - verify-otp success → JWT
  - wrong code, expired code, too many attempts
  - rate limit / cooldown
- `apps/api/tests/orderIdempotency.test.js:147,202` and `realtimeControllerIntegration.test.js:68,103` — user fixtures may insert `password_hash`; switch to `phone_verified_at=NOW()` and `password_hash=NULL`.

---

## 5. Frontend — Customer App (`apps/customer-app/`)

### 5.1 `src/api/authApi.js`
Replace `login` / `signup` / `requestPasswordReset` with:
```js
requestOtp({ phone, name })  -> POST /auth/request-otp
verifyOtp({ phone, code })   -> POST /auth/verify-otp  -> { token, user }
```

### 5.2 `src/screens/customer/AuthScreen/AuthScreen.js`
Full rewrite (the existing 873-line three-mode form goes away). Two-step UI:

**Step 1 — Phone entry**
- Country code prefix (default `+91`).
- Phone input (10–15 digits).
- Conditional **Name** input shown only if backend responds with `purpose: 'signup'` — or simpler: always show name field but make it optional; backend ignores when user already exists.
- "Send OTP" button → calls `requestOtp`.
- On success → move to Step 2, start 30 s resend countdown.

**Step 2 — OTP entry**
- 4 boxes (single hidden input + 4 visual cells), auto-advance, paste support.
- "Verify" button → `verifyOtp`. On success: persist token via `sessionTokens`, hydrate `useAuthStore`, navigate to Home.
- "Resend OTP" link (disabled during cooldown).
- "Change number" link → back to Step 1.

### 5.3 `src/stores/useAuthStore.js`
- No shape change (still `{ user, token }`). Just remove any `password` references.

### 5.4 Misc
- `src/screens/customer/ProfileScreen` — if there is a "Change password" option, remove it.
- `apps/customer-app/src/utils/apiMappers.js` `normalizeSession` — unchanged.

---

## 6. Frontend — Web PWA (`apps/web/`)

Mirror of customer-app:
- `src/api/authApi.js` — replace endpoints.
- `src/screens/AuthScreen/AuthScreen.jsx` + `.css` — rewrite as two-step (phone → OTP) UI. Drop login/signup tab toggle and password fields.
- `src/stores/authStore.js` — drop password handling.
- `src/screens/EditProfileScreen/EditProfileScreen.jsx` — remove password change UI if present.

---

## 7. Admin (`apps/admin/`)
**No changes.** Admin auth uses env credentials (`ADMIN_OWNER_ID` + `ADMIN_PASSWORD_HASH`) not the `users` table.

---

## 8. Docs & Policy

- `apps/api/API.md` — replace `/auth/register`, `/auth/login` sections with `/auth/request-otp`, `/auth/verify-otp`.
- `apps/api/API_TEST_REPORT.md:82,85` — refresh examples.
- `apps/api/public/policies/privacy.html:25` — replace bcrypt-password wording with "OTP delivered via WhatsApp; codes are short-lived and hashed at rest".
- Root `README.md` — short note about the new auth model + required `WHATSAPP_*` env vars.

---

## 9. Rollout Steps (Suggested Order)

1. **Provider setup** — register WhatsApp Business number, get approved `otp_code` template, obtain `WHATSAPP_API_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`.
2. **Migration** — add `otp_requests` table, alter `users` (`password_hash` nullable, add `phone_verified_at`). Backfill existing users with `phone_verified_at = created_at`.
3. **Backend** — add `otpService`, `whatsappService`, new controller methods + routes, env vars. Keep old routes returning `410 Gone` initially.
4. **Backend tests** — rewrite `auth.test.js`. Use a mock provider in tests (`WHATSAPP_PROVIDER=mock`).
5. **Customer app** — rewrite `AuthScreen` + `authApi`. Ship to TestFlight / internal track.
6. **Web PWA** — rewrite `AuthScreen` + `authApi`. Deploy to staging.
7. **Cutover** — once both clients are out, delete the deprecated `/auth/register` and `/auth/login` routes.
8. **Cleanup** — drop `users.password_hash` column in a follow-up migration after a safe interval (e.g. 30 days).

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Meta template approval delay | Submit template early; have Gupshup fallback ready |
| WhatsApp delivery failure | Show "Didn't get it?" → resend; consider SMS fallback later |
| Brute-force OTP guessing | 4-digit + 5-attempt cap + 5-min expiry + rate limit |
| Phone enumeration (signup vs login leak) | Return same generic `{status:'sent'}` shape regardless of new/existing |
| User loses WhatsApp access | Manual recovery via admin panel (already supports profile edits) |
| Existing users with passwords | They simply use OTP next time; ignore old `password_hash` |
| Cost overrun on Meta convos | Monitor conversation count; cap requests per phone per day (e.g. 10) |

---

## 11. Out of Scope (Future)

- SMS fallback if WhatsApp fails.
- Email OTP alternative.
- WhatsApp-based order notifications (template messages for status updates).
- Refresh-token rotation.
- Device-bound sessions.

---

## 12. Acceptance Criteria

- New user can sign up with phone + name + 4-digit WhatsApp OTP — no password ever requested.
- Returning user can log in with phone + OTP only.
- Wrong OTP rejected; OTP expires after 5 min; max 5 attempts per code; max 5 sends per 15 min.
- JWT issued is compatible with existing `requireCustomer` middleware (no client changes elsewhere).
- All existing customer-app and web flows (orders, profile, push tokens, deletion) continue to work.
- `apps/api/tests/auth.test.js` passes against mock WhatsApp provider.
