# Security Issues — ProjectServeLoco

> Audit performed across: `Backend-V1`, `Frontend-V1`, and `adminManager-V1`

---

## 🔴 CRITICAL

---

### [CRIT-1] Hardcoded Credentials in `.env` Committed to Repo

**Location:** [`Backend-V1/.env`](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/.env)

**Issue:**
The `.env` file contains real, weak credentials and is tracked by Git (the root `.gitignore` lists `.env`, but the **Backend-V1** `.gitignore` also lists `.env` — however if this file was ever committed before `.gitignore` was added it would be in history).

```
JWT_SECRET=your_jwt_secret_here   ← placeholder, never changed
ADMIN_OWNER_ID=9350238504         ← real admin ID exposed
ADMIN_PASSWORD=admin143           ← trivially weak (7 chars, dictionary word + number)
MYSQL_USER=root                   ← DB root user
MYSQL_PASSWORD=jaat               ← 4-character DB password
```

**Risk:** Any attacker who gains repo access can immediately authenticate as admin and access the database.

**Fix:**
1. Rotate all secrets immediately.
2. Use a strong, randomly-generated `JWT_SECRET` (≥ 32 chars).
3. Use a non-root MySQL user with least-privilege.
4. Use a strong admin password (≥ 16 random chars).
5. Ensure `.env` is in `.gitignore` **before** first commit, and run `git rm --cached Backend-V1/.env` if it was ever committed.
6. Use a secrets manager (e.g., HashiCorp Vault, AWS Secrets Manager) for production.

---

### [CRIT-2] Plaintext Admin Password Comparison (No Hashing)

**Location:** [`Backend-V1/src/controllers/adminController.js` (line 27)](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/controllers/adminController.js#L20-L37)

**Issue:**
The admin `login` function compares the submitted password **directly** against the environment variable — no hashing at all:

```js
if (id === ownerId && password === ownerPassword) {
```

The `ADMIN_PASSWORD` env variable stores a **plaintext** password. This means:
- The password is visible to anyone with server/env access.
- Timing attacks are possible (string comparison is not constant-time).
- There is no salting or bcrypt protection.

**Fix:**
- Store `ADMIN_PASSWORD` as a bcrypt hash (pre-hashed at setup time).
- Compare using `bcrypt.compare()` (already available in `utils/auth.js`):
  ```js
  const isValid = await bcrypt.compare(password, ownerPasswordHash);
  ```
- Use a constant-time comparison library for the ID as well.

---

### [CRIT-3] Unauthenticated Cart Calculation Endpoint

**Location:** [`Backend-V1/src/routes/cartRoutes.js` (line 6)](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/routes/cartRoutes.js#L6)

**Issue:**
The `/api/cart/calculate` endpoint is entirely **public** — no authentication middleware is applied:

```js
router.post('/calculate', asyncHandler(calculateCart));
```

Anyone on the internet can enumerate all products/combos, query pricing, and probe the database by sending arbitrary `product_id` values.

**Fix:**
Add `requireCustomer` middleware (or at minimum rate-limiting) to the cart calculation route:
```js
const { requireCustomer } = require('../middleware/authMiddleware');
router.post('/calculate', requireCustomer, asyncHandler(calculateCart));
```

---

## 🟠 HIGH

---

### [HIGH-1] Duplicate Route Registration Creates Unauthenticated Admin Access Path

**Location:** [`Backend-V1/src/app.js` (lines 69-79)](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/app.js#L69-L79)

**Issue:**
All routes are registered twice — once under `/api/*` and once under the root path `/`:

```js
app.use('/api/admin', adminRoutes);   // ← correct
// ...
app.use('/admin', adminRoutes);       // ← alias — same middleware, same security
```

While authentication middleware is still applied on both, this doubles the attack surface unnecessarily. More critically, if someone ever adds an unprotected route under `/api/admin/*`, it will silently also be exposed under `/admin/*`. This also violates least-exposure principles and makes security audits harder.

**Fix:**
Remove the legacy root aliases. If old clients must be supported, redirect them:
```js
app.use('/admin', (req, res) => res.redirect(301, `/api/admin${req.path}`));
```

---

### [HIGH-2] Weak Password Policy (Minimum 6 Characters)

**Location:** [`Backend-V1/src/routes/authRoutes.js` (line 30)](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/routes/authRoutes.js#L28-L32)

**Issue:**
Customer passwords are accepted with only **6 characters**. This is well below modern security standards (NIST SP 800-63B recommends ≥ 8, industry practice is ≥ 12).

```js
} else if (String(data.password).length < 6) {
  errors.password = 'Password must be at least 6 characters';
}
```

There is also **no complexity requirement** (no checks for digits, uppercase, etc.).

**Fix:**
- Raise minimum to at least **8 characters** (preferably 12).
- Optionally check against common password lists (e.g., using the `zxcvbn` library).

---

### [HIGH-3] JWT Token Expiry is 7 Days — No Revocation Mechanism

**Location:** [`Backend-V1/.env` (line 4)](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/.env#L4), [`Backend-V1/src/utils/auth.js`](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/utils/auth.js)

**Issue:**
JWT tokens expire in `7d`. There is **no token blacklisting/revocation** mechanism. If a token is stolen:
- It remains valid for up to 7 days.
- Blocking a customer (`setBlockStatus`) does **not** invalidate existing tokens — the block check only happens at order creation, not on every request.

Specifically, `requireCustomer` middleware does **not** check if the user is blocked:
```js
// authMiddleware.js: no blocked check here
req.user = { id: payload.sub || payload.id, role: payload.role };
next();
```

**Fix:**
1. Reduce token expiry to 1 day (or 24h) for a better security/UX balance.
2. Add a `blocked` check in `requireCustomer` middleware (query the DB or cache).
3. For production, implement a token revocation list (Redis-based blacklist or short-lived tokens with refresh tokens).

---

### [HIGH-4] Sensitive Customer Data Leaked in Login Response

**Location:** [`Backend-V1/src/controllers/authController.js` (lines 33-57)](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/controllers/authController.js#L30-L58)

**Issue:**
The login response returns the **full database row** from `SELECT * FROM users`, only deleting `password_hash` after the fact. Any new column added to the `users` table (e.g., internal flags, admin notes) will immediately be leaked to the client:

```js
const [rows] = await pool.query('SELECT * FROM users WHERE phone = ?', [phone]);
// ...
delete user.password_hash;
delete user.password;
res.status(200).json({ ... user }); // ← entire row exposed
```

**Fix:**
Use an explicit column selection to whitelist only what the client needs:
```js
const [rows] = await pool.query(
  'SELECT id, name, phone, whatsapp_number, address, trusted, blocked, created_at FROM users WHERE phone = ?',
  [phone]
);
```

---

### [HIGH-5] No Rate Limiting on Cart or Public Product/Category/Settings Endpoints

**Location:** 
- [`Backend-V1/src/routes/cartRoutes.js`](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/routes/cartRoutes.js)
- [`Backend-V1/src/routes/productRoutes.js`](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/routes/productRoutes.js)
- [`Backend-V1/src/routes/categoryRoutes.js`](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/routes/categoryRoutes.js)
- [`Backend-V1/src/routes/settingsRoutes.js`](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/routes/settingsRoutes.js)

**Issue:**
The public endpoints (`/products`, `/categories`, `/settings`, `/cart/calculate`) have **no rate limiting**, making them vulnerable to DoS attacks and data scraping.

**Fix:**
Apply a `rateLimit` middleware (already used on auth and image routes):
```js
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests' }
});
router.get('/', publicLimiter, asyncHandler(getProducts));
```

---

## 🟡 MEDIUM

---

### [MED-1] Admin Password Reset Approval Does Not Verify Token Freshness

**Location:** [`Backend-V1/src/controllers/adminController.js` (lines 290-316)](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/controllers/adminController.js#L290-L316)

**Issue:**
When approving a password reset request, the admin applies whatever `password_hash` was stored at request time — with **no expiry check** on the request itself. A pending request from months ago could theoretically be approved.

**Fix:**
Add an expiry check (e.g., 72 hours) when approving:
```js
// Reject requests older than 72 hours
const requestAge = Date.now() - new Date(request.requested_at).getTime();
if (requestAge > 72 * 60 * 60 * 1000) {
  return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Password reset request has expired' });
}
```

---

### [MED-2] SQL Query Built with Unvalidated `period` Filter in Reports (SQL Injection Vector)

**Location:** [`Backend-V1/src/controllers/adminController.js` (lines 188-238)](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/controllers/adminController.js#L188-L238)

**Issue:**
The `getSalesReport` and `getTopProductsReport` functions build a `dateFilter` string that is **interpolated directly into the SQL query**:

```js
const dateFilter = '1=1'; // or 'DATE(created_at) = CURDATE()' etc.
// ...
await pool.query(`SELECT ... FROM orders WHERE ${dateFilter}`);
```

While the `period` value is filtered through an `if/else if` chain that only produces safe strings, the **final `else` branch uses `1=1`** (no filter) rather than explicitly rejecting unknown values. If the if-chain logic ever changes or is extended carelessly, the interpolated string could become a SQL injection vector.

Additionally, `getCustomersReport` does the same pattern interpolating `dateFilter` directly into a `COUNT(CASE WHEN ${dateFilter} THEN 1 END)` expression.

**Fix:**
Use parameterized queries or an allowlist approach. Since the filters are static strings, at minimum add an explicit rejection:
```js
const ALLOWED_PERIODS = ['today', 'week', 'month'];
if (period && !ALLOWED_PERIODS.includes(period)) {
  return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid period' });
}
```

---

### [MED-3] Uploaded Image Filename Extension Allows Path Traversal Risk

**Location:** [`Backend-V1/src/routes/imageRoutes.js` (lines 28-33, 80-84)](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/routes/imageRoutes.js#L24-L88)

**Issue:**
The Multer `filename` callback uses `path.extname(file.originalname)` from the **user-supplied filename**. Even though magic-byte validation rewrites the extension afterward, the intermediate file on disk briefly has an attacker-controlled extension. Separately, `originalname` from the user is stored directly in MongoDB without sanitization:

```js
originalName: originalname,  // ← raw user input stored to DB
```

A filename like `../../etc/passwd.jpg` could potentially be crafted, and while `path.extname` only extracts the extension, the full original name is persisted.

**Fix:**
- Sanitize `originalname` before storing: strip path separators and limit to alphanumeric + safe chars.
- The file path used for disk storage already uses a UUID-like name, so path traversal is not immediately exploitable for the stored file — but the DB record should still be clean:
```js
const safeOriginalName = path.basename(originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
```

---

### [MED-4] Coordinates Logged to Console in Production

**Location:** [`Backend-V1/src/controllers/cartController.js` (line 109)](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/controllers/cartController.js#L109)

**Issue:**
Customer GPS coordinates are logged to `console.log` unconditionally in production:

```js
console.log(`[cartController] calculateCart received coordinates (Lat: ${customerLat}, Lng: ${customerLng}) but they are intentionally ignored for pricing.`);
```

Server logs containing precise customer locations are a privacy/compliance risk (GDPR, etc.) and could appear in log aggregation services.

**Fix:**
Remove this log line entirely or guard it behind a debug flag:
```js
if (process.env.NODE_ENV !== 'production') {
  console.log(`[cartController] ...`);
}
```

---

### [MED-5] `SELECT *` Returns Internal Fields to Admin Clients

**Location:** 
- [`Backend-V1/src/controllers/adminController.js` (lines 480, 486)](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/controllers/adminController.js#L477-L490)
- [`Backend-V1/src/controllers/orderController.js` (line 204-207)](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/controllers/orderController.js#L202-L210)

**Issue:**
Multiple endpoints use `SELECT *` and return the raw result to clients. Any schema change (adding an internal column) immediately exposes it. In `getAdminOrderById`, the full order row including GPS coordinates is returned.

**Fix:**
Specify explicit column lists in all SELECT queries used for API responses.

---

### [MED-6] adminManager `.env.example` Contains No Actual Variables

**Location:** [`adminManager-V1/.env.example`](file:///home/linux/Documents/ProjectServeLoco/adminManager-V1/.env.example)

**Issue:**
The admin panel has no `.env` file — it falls back to a hardcoded default in `client.js`:

```js
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
```

If deployed to a production host without setting `VITE_API_BASE_URL`, the admin panel would silently point to localhost (connection failure) or, worse, a malicious server if the default were different.

**Fix:**
- Create a proper `.env` file for production deployment.
- Remove the hardcoded fallback or make it fail loudly in production.

---

## 🔵 LOW / INFORMATIONAL

---

### [LOW-1] Stack Traces Exposed in Non-Production Environments

**Location:** [`Backend-V1/src/middleware/errorHandler.js` (lines 32-34)](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/middleware/errorHandler.js#L31-L34)

**Issue:**
Full stack traces are returned in API error responses in development/staging:
```js
if (config.NODE_ENV !== 'production') {
  response.stack = err.stack;
}
```
If staging is exposed to the internet, internal file paths and code structure are revealed.

**Fix:**
Consider only enabling stack traces when an explicit `DEBUG=true` flag is set, regardless of `NODE_ENV`.

---

### [LOW-2] Missing `X-Content-Type-Options` / MIME Sniffing Protection on Image Endpoint

**Location:** [`Backend-V1/src/app.js` (line 50)](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/app.js#L50)

**Issue:**
`express.static` serves uploaded images. While magic-byte validation occurs at upload time, the static file server sets `crossOriginResourcePolicy: cross-origin` but doesn't enforce `Content-Type: image/*` on served files. If an attacker previously uploaded a file with a forged magic byte, it could be served with wrong content type.

**Fix:**
- Restrict static file MIME types using a custom middleware or CDN policy.
- Consider serving files from a dedicated CDN/object store rather than from the app server.

---

### [LOW-3] No CSRF Protection on State-Changing Endpoints (Admin Panel)

**Location:** [`adminManager-V1/src/api/client.js`](file:///home/linux/Documents/ProjectServeLoco/adminManager-V1/src/api/client.js)

**Issue:**
The admin panel is a web app (Vite/React) relying on Bearer token authentication. As long as the token is stored in `localStorage`/`sessionStorage` (not cookies), CSRF is not directly exploitable. However, if tokens are ever moved to cookies, CSRF protection will be needed immediately.

**Fix:**
- Confirm tokens are stored in memory/localStorage (not cookies) — this is the safer default for SPAs.
- Document this assumption to prevent future developers from switching to cookies without adding CSRF protection.

---

### [LOW-4] Order Cancellation Reason Not Sanitized/Length-Limited

**Location:** [`Backend-V1/src/controllers/orderController.js` (lines 239-258)](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/controllers/orderController.js#L236-L259)

**Issue:**
The `reason` field in order cancellation is passed directly to the DB without length validation:
```js
const { reason } = req.body;
// No length check
await pool.query('... cancel_reason = ? ...', [reason || 'Cancelled by customer', id]);
```

**Fix:**
Add a length limit:
```js
if (reason && reason.length > 500) {
  return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Reason too long (max 500 chars)' });
}
```

---

### [LOW-5] Health Endpoint Leaks Database Configuration Info

**Location:** [`Backend-V1/src/app.js` (lines 82-90)](file:///home/linux/Documents/ProjectServeLoco/Backend-V1/src/app.js#L82-L90)

**Issue:**
The `/health` endpoint is public and returns database status information:
```json
{ "status": "ok", "databases": { "mysql": "ok", "mongodb": "ok" } }
```
This reveals what database technologies are in use to potential attackers.

**Fix:**
Either remove the health endpoint from public access (add auth), or return only a simple `{ "status": "ok" }` without database details.

---

## Summary Table

| ID | Severity | Component | Title |
|---|---|---|---|
| CRIT-1 | 🔴 Critical | Backend | Hardcoded credentials in `.env` |
| CRIT-2 | 🔴 Critical | Backend | Plaintext admin password (no hashing) |
| CRIT-3 | 🔴 Critical | Backend | Unauthenticated cart calculation endpoint |
| HIGH-1 | 🟠 High | Backend | Duplicate routes double attack surface |
| HIGH-2 | 🟠 High | Backend | Weak minimum password policy (6 chars) |
| HIGH-3 | 🟠 High | Backend | No token revocation; blocked users keep valid tokens |
| HIGH-4 | 🟠 High | Backend | Full user row leaked in login response |
| HIGH-5 | 🟠 High | Backend | No rate limiting on public endpoints |
| MED-1 | 🟡 Medium | Backend | Password reset requests never expire |
| MED-2 | 🟡 Medium | Backend | SQL string interpolation in report filters |
| MED-3 | 🟡 Medium | Backend | Unsanitized original filename stored in DB |
| MED-4 | 🟡 Medium | Backend | GPS coordinates logged in production |
| MED-5 | 🟡 Medium | Backend | `SELECT *` exposes internal fields to clients |
| MED-6 | 🟡 Medium | Admin | Missing `.env` — hardcoded API base URL fallback |
| LOW-1 | 🔵 Low | Backend | Stack traces exposed in non-production |
| LOW-2 | 🔵 Low | Backend | MIME type not enforced on served images |
| LOW-3 | 🔵 Low | Admin | CSRF assumptions not documented |
| LOW-4 | 🔵 Low | Backend | Cancellation reason field unbounded |
| LOW-5 | 🔵 Low | Backend | Health endpoint reveals DB topology |
