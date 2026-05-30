# Deployment Fix Plan - ProjectServeLoco

This file tracks deployment fixes from `plans/deployissues.md`.

Current decisions:
- DEPLOY-2 will be fixed by using Azure Database for MySQL Flexible Server and production-only secrets.

---


## DEPLOY-2 - Weak Credentials / Production Database

Status: Must fix before production.

Decision:
- Local MySQL is not production.
- Production database will be hosted on Azure.
- Use Azure Database for MySQL Flexible Server.
- Backend will also run on Azure.
- Production secrets must live only in Azure/server environment config, not in Git.

### Tasks

- [ ] Create Azure Database for MySQL Flexible Server.
- [ ] Create production database named `serveloco`.
- [ ] Create a dedicated MySQL app user instead of using `root`.
- [ ] Configure Azure networking so the deployed backend can reach MySQL.
- [ ] Add optional MySQL TLS/SSL support in backend config if Azure requires encrypted connection.
- [ ] Generate strong production `JWT_SECRET`.
- [ ] Generate bcrypt admin password hash and use `ADMIN_PASSWORD_HASH`.
- [ ] Remove plaintext `ADMIN_PASSWORD` from production environment.
- [ ] Run backend migrations against Azure MySQL.
- [ ] Verify backend starts in `NODE_ENV=production`.
- [ ] Verify `Backend-V1/.env` remains untracked.

### Azure Fields Needed

Azure account/project:
- Azure subscription ID
- Azure resource group name
- Azure region
- Azure MySQL Flexible Server name
- Azure MySQL server hostname, usually:
  ```env
  MYSQL_HOST=<server-name>.mysql.database.azure.com
  ```
- Azure MySQL port:
  ```env
  MYSQL_PORT=3306
  ```

Database:
```env
MYSQL_DATABASE=serveloco
MYSQL_USER=serveloco_app
MYSQL_PASSWORD=<strong_random_password>
```

Networking:
- Backend hosting type: Azure
- Backend outbound IP address, if using public firewall access
- Azure VNet name, if using private access
- Azure subnet name, if using private access
- Azure MySQL firewall rule, if using public access
- Decision: prefer private Azure networking when backend and MySQL are both on Azure.

TLS/SSL:
```env
MYSQL_SSL=true
MYSQL_SSL_CA_PATH=/path/to/DigiCertGlobalRootG2.crt.pem
```

Note:
- The current backend reads `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, and `MYSQL_PASSWORD`.
- If TLS is required, add support in `Backend-V1/src/db/mysql.js` and `Backend-V1/src/db/migrate.js`.

### Backend Production Env Fields Needed

```env
NODE_ENV=production
PORT=3000

JWT_SECRET=<openssl_rand_hex_64>
JWT_EXPIRES_IN=1d

ADMIN_OWNER_ID=<admin_login_id>
ADMIN_PASSWORD_HASH=<bcrypt_hash>

MYSQL_HOST=<azure_mysql_host>
MYSQL_PORT=3306
MYSQL_DATABASE=serveloco
MYSQL_USER=serveloco_app
MYSQL_PASSWORD=<strong_random_password>
MYSQL_SSL=true
MYSQL_SSL_CA_PATH=<certificate_path_if_required>

MONGODB_URI=<production_mongodb_uri>
MONGODB_DATABASE=serveloco_images

CORS_ORIGIN=<admin_panel_origin>,<mobile_api_origin_if_needed>
PUBLIC_BASE_URL=https://<api-domain>
UPLOAD_DIR=uploads
MAX_IMAGE_SIZE_MB=5
STATIC_UPLOAD_PATH=/uploads
```

### Commands Needed

Generate JWT secret:
```bash
openssl rand -hex 64
```

Generate DB password:
```bash
openssl rand -base64 24
```

Generate admin bcrypt hash:
```bash
cd Backend-V1
node -e "require('bcrypt').hash('YOUR_STRONG_ADMIN_PASSWORD', 12).then(console.log)"
```

Create database/user:
```sql
CREATE DATABASE serveloco;
CREATE USER 'serveloco_app'@'%' IDENTIFIED BY '<strong-password>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON serveloco.* TO 'serveloco_app'@'%';
FLUSH PRIVILEGES;
```

Run migrations:
```bash
cd Backend-V1
npm run db:migrate
```

Verify `.env` is not tracked:
```bash
git ls-files Backend-V1/.env
```

Expected output: empty.

### Verification

- Backend connects to Azure MySQL.
- `npm run db:migrate` completes successfully against Azure MySQL.
- Tables exist in Azure MySQL, including:
  - `users`
  - `orders`
  - `order_items`
  - `settings`
  - `products`
  - `categories`
  - `password_reset_requests`
  - `notifications`
- Admin login works with `ADMIN_PASSWORD_HASH`.
- Customer register/login works.
- Cart calculation works.
- Order placement writes to Azure MySQL.
- Backend refuses unsafe production config:
  - placeholder JWT secret
  - weak admin password
  - wildcard CORS in production

---

## Upcoming Issues To Plan Next

- [ ] DEPLOY-3 - Deployment infrastructure: PM2/Nginx/Azure hosting setup.
- [ ] DEPLOY-4 - HTTPS/SSL and production API URLs.
- [ ] DEPLOY-5 - Error monitoring.
- [ ] DEPLOY-6 - Mobile app production build.
- [ ] DEPLOY-7 - Database backups.
- [ ] DEPLOY-8 - Image storage.
- [ ] DEPLOY-9 - Push notifications.
- [ ] DEPLOY-10 - CI/CD pipeline.
- [ ] DEPLOY-11 - Legal documents.
- [ ] DEPLOY-12 - DB connection pool sizing.
- [ ] DEPLOY-13 - Token refresh/logout API.
- [ ] DEPLOY-14 - Load testing.
- [ ] DEPLOY-15 - Admin panel rate limiting.
- [ ] DEPLOY-16 - Frontend API URL fallback.
- [ ] DEPLOY-17 - Test coverage.
