# Deployment Issues — ProjectServeLoco

> Audit performed across: `Backend-V1`, `Frontend-V1`, and `adminManager-V1`
> Status: Pre-production | Not ready for launch

---

## 🔴 CRITICAL BLOCKERS

---

### [DEPLOY-1] UPI Payment Not Verified — Revenue Fraud Risk

**Component:** `Backend-V1`

**Issue:**
UPI orders are placed with `payment_status = 'Pending'` and there is zero server-side payment confirmation. No payment gateway SDK, no webhook endpoint, no callback URL. The admin must manually mark orders as paid.

A customer can:
1. Select UPI payment
2. Place order successfully
3. Close the app without paying
4. Receive delivery because the order status is just `Pending`

**Fix:**
- Integrate **Razorpay** (recommended for India — supports UPI, QR, autopay)
- Create `Backend-V1/src/routes/paymentRoutes.js`
- Add `POST /api/payments/create-order` — creates a Razorpay order ID
- Add `POST /api/payments/verify` — verifies signature after payment
- Add `POST /api/payments/webhook` — handles async payment events
- Only dispatch/accept an order once `payment_status = 'Paid'` is confirmed

**References:**
- Razorpay Node SDK: `npm install razorpay`
- Razorpay Docs: https://razorpay.com/docs/payments/server-integration/nodejs/

---

### [DEPLOY-2] Weak Credentials Still in `.env` — Security Breach Risk

**Component:** `Backend-V1/.env`

**Issue:**
The `.env` file still contains dangerous default/placeholder values that will be used in production if not changed:

```env
JWT_SECRET=your_jwt_secret_here    ← PLACEHOLDER — tokens are trivially forgeable
MYSQL_USER=root                     ← DB root — full database access
MYSQL_PASSWORD=jaat                 ← 4-character password
```

If an attacker gets any foothold on the server, they own everything.

**Fix:**
1. Generate a strong JWT secret:
   ```bash
   openssl rand -hex 64
   ```
2. Create a dedicated MySQL user (not root):
   ```sql
   CREATE USER 'serveloco_app'@'localhost' IDENTIFIED BY '<strong-password>';
   GRANT SELECT, INSERT, UPDATE, DELETE ON serveloco.* TO 'serveloco_app'@'localhost';
   FLUSH PRIVILEGES;
   ```
3. Generate a strong DB password (≥ 20 random characters):
   ```bash
   openssl rand -base64 24
   ```
4. Update `.env` on the production server — never commit secrets to Git
5. Use a secrets manager in future (AWS Secrets Manager, HashiCorp Vault, or Doppler)

---

### [DEPLOY-3] No Deployment Infrastructure — App Cannot Run in Production

**Component:** Project Root

**Issue:**
There is no `Dockerfile`, no `docker-compose.yml`, no PM2 config, no Nginx config, no GitHub Actions, no CI/CD pipeline. If you push code to a server and run `node src/server.js`, the app will crash and stay down permanently if:
- The process throws an unhandled error
- The server reboots
- Memory runs out

**Fix — Minimum viable production setup:**

**Step 1: Install PM2 (process manager)**
```bash
npm install -g pm2
```

**Step 2: Create `Backend-V1/ecosystem.config.js`:**
```js
module.exports = {
  apps: [{
    name: 'serveloco-backend',
    script: 'src/server.js',
    instances: 1,
    exec_mode: 'fork',
    env_production: {
      NODE_ENV: 'production',
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    restart_delay: 5000,
    max_restarts: 10,
  }]
};
```

**Step 3: Start with PM2:**
```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # auto-start on server reboot
```

**Step 4: Create Nginx reverse proxy config (`/etc/nginx/sites-available/serveloco`):**
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    location /uploads/ {
        alias /path/to/Backend-V1/uploads/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

---

### [DEPLOY-4] No HTTPS / SSL — App Store Rejection + Data Exposed in Transit

**Component:** All components

**Issue:**
All API calls are over `http://`. This means:
- Passwords, JWT tokens, and order data travel in plaintext
- Android API 28+ blocks cleartext HTTP by default (app will fail silently)
- Google Play Store **rejects** apps that make cleartext HTTP requests to non-localhost
- Apple App Store enforces ATS (App Transport Security) — blocks HTTP

**Fix:**
1. Point a domain name at your server IP
2. Install Certbot and get a free Let's Encrypt SSL cert:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```
3. Update `EXPO_PUBLIC_API_BASE_URL` to `https://yourdomain.com/api`
4. Update `VITE_API_BASE_URL` (admin panel) to `https://yourdomain.com/api`
5. Update `PUBLIC_BASE_URL` in `Backend-V1/.env` to `https://yourdomain.com`
6. Add to Nginx: auto-renew certs via cron or systemd timer

---

### [DEPLOY-5] No Error Monitoring — You Won't Know When Production Breaks

**Component:** `Backend-V1`, `Frontend-V1`

**Issue:**
There is no Sentry, Bugsnag, or any error tracking tool. When an error happens in production:
- You are not notified
- You have no stack trace
- You have no user context (what they were doing when it crashed)
- You find out only when a customer complains

**Fix — Add Sentry (free tier: 5,000 errors/month):**

Backend:
```bash
cd Backend-V1
npm install @sentry/node
```
Add to `src/server.js` (before app loads):
```js
const Sentry = require('@sentry/node');
Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV });
```
Add Sentry error handler in `src/middleware/errorHandler.js`:
```js
Sentry.captureException(err);
```

Frontend:
```bash
cd Frontend-V1
npx expo install @sentry/react-native
```

Add `SENTRY_DSN` to both `.env` files.

---

### [DEPLOY-6] Mobile App Not Built for Production — Customers Cannot Install It

**Component:** `Frontend-V1`

**Issue:**
The app only runs via Expo Go (a development app). Real users cannot be asked to install Expo Go first. You need a standalone `.apk` / `.aab` file submitted to the Play Store.

**Fix:**

1. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   eas login
   ```

2. Configure `Frontend-V1/app.json`:
   ```json
   {
     "expo": {
       "name": "ServeLoco",
       "slug": "serveloco",
       "version": "1.0.0",
       "android": {
         "package": "com.yourcompany.serveloco",
         "versionCode": 1
       },
       "extra": {
         "eas": { "projectId": "your-eas-project-id" }
       }
     }
   }
   ```

3. Create `Frontend-V1/eas.json`:
   ```json
   {
     "build": {
       "production": {
         "android": { "buildType": "apk" },
         "env": {
           "EXPO_PUBLIC_API_BASE_URL": "https://yourdomain.com/api"
         }
       }
     }
   }
   ```

4. Build:
   ```bash
   eas build --platform android --profile production
   ```

5. Submit to Google Play Store (₹1,750 one-time registration fee).

---

## 🟠 HIGH PRIORITY — Fix Within First Week of Launch

---

### [DEPLOY-7] No Database Backups — Risk of Total Data Loss

**Component:** MySQL Database

**Issue:**
No backup strategy exists. A corrupted database, accidental DELETE, or server failure means all customer data and order history is permanently lost.

**Fix:**
Add a daily backup cron job on the server:
```bash
# Edit crontab
crontab -e

# Add this line — runs at 2am every day
0 2 * * * mysqldump -u serveloco_app -p<password> serveloco | gzip > /backups/serveloco-$(date +\%Y\%m\%d).sql.gz

# Also upload to S3 or remote server
0 3 * * * aws s3 cp /backups/serveloco-$(date +\%Y\%m\%d).sql.gz s3://your-backup-bucket/
```

Keep at least 30 days of backups. **Test your restore before launch:**
```bash
gunzip < backup.sql.gz | mysql -u root -p serveloco_restore
```

---

### [DEPLOY-8] Images Stored Locally — Lost on Server Replace / Cannot Scale

**Component:** `Backend-V1/uploads/`

**Issue:**
All uploaded product/offer images go to a local `uploads/` folder on the Node.js server. Problems:
- Images are **lost** if the server is destroyed or replaced
- Images are served by Node.js (wastes CPU/memory on a non-I/O task)
- Cannot run multiple backend instances (they won't share the same folder)

**Fix — Migrate to Cloudinary (free tier: 25GB storage, 25GB bandwidth):**

```bash
npm install cloudinary multer-storage-cloudinary
```

Update `imageRoutes.js` to use Cloudinary storage instead of `diskStorage`.
Store the Cloudinary `public_id` and `secure_url` in MongoDB instead of a local filename.
Remove `express.static` for uploads — serve from Cloudinary CDN URL directly.

---

### [DEPLOY-9] No Push Notifications for Order Updates

**Component:** `Frontend-V1`, `Backend-V1`

**Issue:**
Customers get order status updates only via WebSocket — which only works when the app is open. If a customer closes the app after ordering, they will never know their order was accepted, is being prepared, or is out for delivery.

**Fix — Expo Push Notifications (free):**

1. Add to `Frontend-V1`:
   ```bash
   npx expo install expo-notifications expo-device
   ```

2. Add `push_token` column to `users` table in migration:
   ```sql
   ALTER TABLE users ADD COLUMN push_token VARCHAR(255) DEFAULT NULL;
   ```

3. Register token on app startup and send to backend via `PATCH /api/auth/profile`

4. In `Backend-V1/src/utils/notificationService.js`, after sending an in-app notification, also call Expo Push API:
   ```js
   const { Expo } = require('expo-server-sdk');
   const expo = new Expo();
   await expo.sendPushNotificationsAsync([{
     to: user.push_token,
     title: 'Order Update',
     body: 'Your order is out for delivery!',
   }]);
   ```

---

### [DEPLOY-10] No CI/CD Pipeline — Manual Deployments Are Error-Prone

**Component:** `.github/workflows/`

**Issue:**
Deployments are fully manual — you have to SSH into the server and run commands yourself every time. This leads to:
- Forgetting to run migrations
- Deploying untested code
- Inconsistent environment between dev and prod

**Fix — Create `.github/workflows/deploy.yml`:**
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run backend tests
        run: cd Backend-V1 && npm ci && npm test
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /var/www/serveloco/Backend-V1
            git pull origin main
            npm ci --production
            node src/db/migrate.js
            pm2 restart serveloco-backend
```

---

### [DEPLOY-11] No Legal Documents — App Store Rejection + Legal Risk

**Component:** All

**Issue:**
Google Play Store **requires** a Privacy Policy URL before you can publish. Apple App Store requires the same. Additionally, operating a food delivery service in India without Terms & Conditions and a Refund Policy exposes you to consumer disputes.

**Documents required:**
- **Privacy Policy** — Required by Play Store, App Store, and Indian IT Act 2000 (Rule 4 of IT Rules 2011). Must explain what data you collect (phone, address, GPS) and how you use it.
- **Terms & Conditions** — Protects you from disputes over delivery failures, wrong items, cancellations.
- **Refund/Cancellation Policy** — Required for payment compliance (RBI guidelines for UPI merchants).
- **FSSAI License** — Required if you handle or deliver food in India.
- **GST Registration** — Required if annual turnover exceeds ₹20 lakh.

**Fix:**
- Use TermsFeed or GetTerms.io to generate a Privacy Policy and T&C (free/cheap)
- Host them on your domain (e.g., `https://yourdomain.com/privacy`, `https://yourdomain.com/terms`)
- Add links in the app (registration screen footer, about section)
- Consult a startup lawyer for the FSSAI and GST requirements

---

## 🟡 MEDIUM PRIORITY — Fix Before Heavy Traffic

---

### [DEPLOY-12] Database Connection Pool Too Small for Production Load

**Component:** `Backend-V1/src/db/mysql.js`

**Issue:**
```js
connectionLimit: 10
```
At lunch/dinner peaks, 10 concurrent DB connections will fill up instantly. The 11th request queues, adding latency. Under high load, requests will time out waiting for a connection.

**Fix:**
```js
connectionLimit: 30,      // Increase to 25-50
connectTimeout: 10000,    // Add connection timeout
acquireTimeout: 10000,    // Add acquire timeout
```

---

### [DEPLOY-13] No Token Refresh / Logout API

**Component:** `Backend-V1`, `Frontend-V1`

**Issue:**
- JWTs expire after 1 day — users are silently logged out mid-session with no way to refresh
- There is no `POST /api/auth/logout` endpoint — tokens cannot be invalidated server-side
- If a user's account is blocked, their existing token still works for up to 1 day

**Fix:**
Option A (simple) — Add a refresh token endpoint:
```
POST /api/auth/refresh  → accepts a long-lived refresh token, returns new access token
POST /api/auth/logout   → invalidates the refresh token (stored in DB)
```

Option B (complex but more secure) — Redis token blacklist:
```
On logout: store JWT jti (JWT ID) in Redis with TTL = remaining token lifetime
In requireCustomer: check if jti is blacklisted
```

---

### [DEPLOY-14] No Load Testing Done

**Component:** All

**Issue:**
The app has never been tested under realistic traffic. You don't know how many concurrent users it can handle before it degrades.

**Fix — Run load tests with k6 (free):**
```bash
npm install -g k6
```
Write a test script that simulates:
- 50 concurrent users browsing products
- 20 concurrent users placing orders simultaneously
- Measure: response time, error rate, DB connection saturation

Target: P95 response time < 500ms under 50 concurrent users.

---

### [DEPLOY-15] Admin Panel Has No Rate Limiting or Brute-Force Protection

**Component:** `Backend-V1/src/routes/adminRoutes.js`

**Issue:**
The admin login endpoint (`POST /api/admin/login`) has no rate limiting. An attacker can try thousands of passwords per second without being blocked. The auth routes have a rate limiter but the admin routes do not.

**Fix:**
Add a strict rate limiter to the admin login route:
```js
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                     // 10 attempts
  message: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts. Try again in 15 minutes.' }
});

router.post('/login', adminLoginLimiter, validate(loginSchema), asyncHandler(login));
```

---

### [DEPLOY-16] Frontend API Base URL Falls Back to localhost in Production

**Component:** `Frontend-V1/src/api/config.js`

**Issue:**
If `EXPO_PUBLIC_API_BASE_URL` is not set, the app falls back to `http://localhost:3000/api` or `http://10.0.2.2:3000/api` (Android emulator). A production build without this env variable will connect to nothing.

**Fix:**
1. Create `Frontend-V1/.env.production`:
   ```
   EXPO_PUBLIC_API_BASE_URL=https://yourdomain.com/api
   ```
2. Add a startup check in `config.js` for production builds:
   ```js
   if (!__DEV__ && !process.env.EXPO_PUBLIC_API_BASE_URL) {
     throw new Error('EXPO_PUBLIC_API_BASE_URL must be set for production builds');
   }
   ```

---

### [DEPLOY-17] Test Coverage at 60% — Large Untested Surface Area

**Component:** `Backend-V1`

**Current Coverage:**
```
Statements : 60.16%
Branches   : 46.31%   ← Only half of all conditional paths tested
Functions  : 63.19%
Lines      : 61.31%
```

**Most critical untested areas:**
- `settingsController.js` — dynamic SQL UPDATE builder (SQL injection risk)
- `comboController.js` — dynamic WHERE clause builder
- `dashboardController.js` — complex section/item logic
- Most error branches across all controllers

**Fix:**
- Set a Jest coverage threshold in `package.json` to block CI if coverage drops:
  ```json
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 70,
        "functions": 75,
        "lines": 75,
        "statements": 75
      }
    }
  }
  ```
- Write tests for `settingsController`, `comboController`, and dashboard flows

---

## Summary Table

| ID | Severity | Component | Issue | Effort |
|---|---|---|---|---|
| DEPLOY-1 | 🔴 Critical | Backend | UPI payment not verified | 3-5 days |
| DEPLOY-2 | 🔴 Critical | Backend | Weak credentials in `.env` | 1 hour |
| DEPLOY-3 | 🔴 Critical | All | No deployment infrastructure | 1-2 days |
| DEPLOY-4 | 🔴 Critical | All | No HTTPS / SSL | 2-4 hours |
| DEPLOY-5 | 🔴 Critical | Backend + Frontend | No error monitoring | 2-4 hours |
| DEPLOY-6 | 🔴 Critical | Frontend | App not built for Play Store | 1-2 days |
| DEPLOY-7 | 🟠 High | Database | No DB backups | 2 hours |
| DEPLOY-8 | 🟠 High | Backend | Images stored locally | 1-2 days |
| DEPLOY-9 | 🟠 High | Frontend + Backend | No push notifications | 2-3 days |
| DEPLOY-10 | 🟠 High | DevOps | No CI/CD pipeline | 4-8 hours |
| DEPLOY-11 | 🟠 High | Legal | No Privacy Policy / T&C | 2-3 days |
| DEPLOY-12 | 🟡 Medium | Backend | DB connection pool too small | 30 mins |
| DEPLOY-13 | 🟡 Medium | Backend + Frontend | No logout / token refresh | 1-2 days |
| DEPLOY-14 | 🟡 Medium | All | No load testing | 1 day |
| DEPLOY-15 | 🟡 Medium | Backend | Admin login not rate limited | 30 mins |
| DEPLOY-16 | 🟡 Medium | Frontend | API URL fallback in production | 30 mins |
| DEPLOY-17 | 🟡 Medium | Backend | Test coverage only 60% | 3-5 days |
