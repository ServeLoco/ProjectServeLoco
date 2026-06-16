# 🚀 VillKro Deployment Runbook (Beginner Edition)

> Follow this top to bottom. Do **not** skip steps.
> Each step has: **What** → **Do this** → **Why** → **✅ Done when**.
>
> **Your setup (locked in):**
> - Domain: `serveloco.app`
> - Database: Azure MySQL
> - Images: AWS S3
> - API host: **AWS Lightsail Instance (VM)** — Mumbai / ap-south-1
> - Run with: **pm2** (keeps API alive) + **nginx** (reverse proxy + serves admin/web)
> - DNS + HTTPS: Cloudflare (free)
>
> **Why an instance, not a container service?** An instance (a plain Ubuntu VM)
> is much cheaper: a 2 GB instance is **$10/mo** vs **$40/mo** for the equivalent
> container service. You set it up yourself, which is also how you learn servers.

---

## ✅ PART A — Code (ALREADY DONE)

The app code is finished and tested. Nothing for you to do here.

- [x] S3 image upload wired in
- [x] Web app Docker files created
- [x] Production env template ready
- [x] 185 tests pass, 0 lint errors

---

## 📋 PART B — Setup (what you do now)

```
Step 1  Check installed tools          ← START HERE
Step 2  Configure AWS CLI
Step 3  Create S3 bucket (images)
Step 4  Create IAM user (API keys)
Step 5  Create Azure MySQL database
Step 6  Create MongoDB Atlas (free)
Step 7  Generate secrets
Step 8  Fill in production .env (local)
Step 9  Create the Lightsail instance (VM)
Step 10 Install Docker on the server
Step 11 Deploy with Docker Compose
Step 12 Connect Cloudflare DNS
Step 13 Smoke test everything
```

> **Note:** This runbook runs your 3 apps on the VM with **Docker Compose**
> (`docker-compose.prod.yml`, already in your repo). One nginx container routes
> the 3 subdomains to the API + admin + web containers. Databases stay managed
> (Azure MySQL + MongoDB Atlas) — they are not on this server.

---

## STEP 1 — Check what tools you already have

**Do this** — open PowerShell (Windows key → type `PowerShell` → Enter), paste:
```powershell
aws --version; docker --version; node --version; git --version
```

**Why:** These 4 tools are needed to build and push your app.

**What you should see:**
| Tool | Expected | If missing, install from |
|---|---|---|
| AWS CLI | `aws-cli/2.x` | https://awscli.amazonaws.com/AWSCLIV2.msi |
| Docker | `Docker version 2x` | https://www.docker.com/products/docker-desktop/ |
| Node | `v20.x` or higher | https://nodejs.org/en/download (LTS) |
| Git | `git version 2.x` | https://git-scm.com/download/win |

**✅ Done when:** all 4 show a version number.

---

## STEP 2 — Connect AWS CLI to your account

**Do this:**
1. Get your access keys: AWS Console → search `IAM` → Users → your user → **Security credentials** → **Create access key** → **CLI** → download the `.csv`.
2. In PowerShell:
```powershell
aws configure
```
3. Paste when asked:
```
AWS Access Key ID:     <from csv>
AWS Secret Access Key: <from csv>
Default region name:   ap-south-1
Default output format: json
```
4. Verify:
```powershell
aws sts get-caller-identity
```

**Why:** Lets your laptop create AWS resources from the command line.

**✅ Done when:** you see your account ID and ARN (no error).

---

## STEP 3 — Create the S3 bucket (stores product images)

**Do this:**
1. AWS Console → search `S3` → **Create bucket**.
2. Bucket name: `villkro-images-prod` (if taken, add `-app`).
3. Region: **Asia Pacific (Mumbai) ap-south-1**.
4. **Uncheck** "Block all public access" → tick the acknowledgement box.
5. **Create bucket**.
6. Open bucket → **Permissions** → **Bucket policy** → **Edit** → paste (change name if you changed it):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::villkro-images-prod/*"
    }
  ]
}
```
7. Same page → **CORS** → **Edit** → paste:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

**Why:** Product images must be publicly viewable in the app.

**✅ Done when:** bucket exists with the policy + CORS saved.

---

## STEP 4 — Create an IAM user for the API (S3 keys)

**Do this:**
1. AWS Console → `IAM` → Users → **Create user**.
2. Username: `villkro-api-s3`.
3. **Attach policies directly** → search `AmazonS3FullAccess` → tick it.
4. **Create user** → click the user → **Security credentials** → **Create access key** → **CLI**.
5. **Save the Access Key ID + Secret** — the API uses these to upload images.

**Why:** Your API needs its own permission to write to S3.

**✅ Done when:** you have saved this user's 2 keys.

---

## STEP 5 — Create Azure MySQL database

**Do this:**
1. Azure Portal → search `Azure Database for MySQL` → **Create** → **Flexible Server**.
2. Server name: `villkro-db` (or similar). Region: **Central India**.
3. Workload type: **Development** → plan **B1ms (Burstable)**.
4. Set admin username + password — **save both**.
5. After it deploys: **Networking** → allow public access → **Add current client IP**, and tick "Allow Azure services". (For first deploy you can temporarily allow `0.0.0.0`.)
6. **Databases** → create a database named `serveloco`.
7. Download the TLS cert: https://www.digicert.com/CACerts/DigiCertGlobalRootG2.crt.pem → save it to `apps/api/certs/DigiCertGlobalRootG2.crt.pem` (create the `certs` folder).

**Why:** Your app stores orders/products/users here.

**✅ Done when:** server is "Available", `serveloco` DB exists, cert is saved.

**Save these 5 values:** host, port `3306`, database `serveloco`, user, password.

---

## STEP 6 — Create MongoDB Atlas (free, stores image info)

**Do this:**
1. https://www.mongodb.com/cloud/atlas/register → sign up.
2. Create **M0 Free** cluster → region **Mumbai (ap-south-1)** → name `villkro`.
3. **Database Access** → Add user `villkro-app` → autogenerate password → **copy it** → role "Read and write to any database".
4. **Network Access** → Add IP → **Allow access from anywhere** (`0.0.0.0/0`).
5. **Database** → **Connect** → **Drivers** → copy the `mongodb+srv://...` string. Replace `<password>` with the one from step 3.

**Why:** Stores image metadata (filenames, URLs).

**✅ Done when:** you have the full connection string saved.

---

## STEP 7 — Generate your secrets

**Do this** — in PowerShell:
```powershell
# JWT secret (login tokens)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Save the 64-char output as **JWT_SECRET**.

```powershell
# Admin password hash — replace YOUR_PASSWORD
cd "c:\Users\yashs\OneDrive\Pictures\Documents\ProjectServeLoco\apps\api"
node -e "console.log(require('bcrypt').hashSync('YOUR_PASSWORD', 10))"
```
Save the `$2b$...` output as **ADMIN_PASSWORD_HASH**.

**Why:** Secure login. The password is never stored in plain text.

**✅ Done when:** you have both values saved + the admin email you'll log in with.

---

## STEP 8 — Fill in the production .env

**Do this:**
1. Copy the template:
```powershell
cd "c:\Users\yashs\OneDrive\Pictures\Documents\ProjectServeLoco\apps\api"
Copy-Item .env.production.example .env.production
```
2. Open `.env.production` and replace every `replace_...`/`your_...` placeholder with the real values you saved in Steps 4, 5, 6, 7.

**Why:** This file tells the deployed app how to reach the database, S3, etc.

**✅ Done when:** no placeholders remain in `.env.production`.

⚠️ Never commit this file to git (it's already gitignored).

---

## STEP 9 — Create the Lightsail instance (your server)

**Do this:**
1. Go to https://lightsail.aws.amazon.com → region **Mumbai (ap-south-1)** (top right).
2. **Create instance**.
3. Platform: **Linux/Unix** → Blueprint: **OS Only → Ubuntu 22.04 LTS**.
4. Pick a plan:
   - **$10/mo — 2 GB RAM / 1 vCPU / 60 GB** ← recommended (matches your 500-concurrent target)
   - or **$5/mo — 1 GB RAM** to start cheap (resize later if needed)
5. Name it `villkro-server` → **Create instance**. Wait until it says **Running**.
6. **Networking** tab → under **IPv4 Firewall**, add a rule: **HTTP** port `80` (it's usually there by default; SSH 22 is there too).
7. Attach a **Static IP**: instance → **Networking** → **Create static IP** → attach to `villkro-server`. **Copy this IP** — you'll point DNS at it.

**Why:** This is the actual computer in the cloud that runs your API.

**✅ Done when:** instance is Running, has a static IP, and port 80 is open.

---

## STEP 10 — Install Docker on the server

**Do this:**
1. Connect: in Lightsail, click your instance → **Connect using SSH** (browser terminal). Everything below is typed **in that terminal**, not PowerShell.
2. Install Docker + git + a 2 GB swap file (the swap prevents out-of-memory crashes while building 3 images on a small instance):
```bash
sudo apt-get update
sudo apt-get install -y git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# 2 GB swap so docker build doesn't run out of RAM
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```
3. Log out and back in (so the docker group applies), then verify:
```bash
docker --version
docker compose version
```

**Why:** Docker runs your 3 app containers; the swap file keeps builds from crashing on a 1–2 GB box.

**✅ Done when:** both version commands print.

---

## STEP 11 — Deploy with Docker Compose

**Do this (in the SSH terminal):**
1. Get your code (push to GitHub first, then):
```bash
cd ~
git clone <your-repo-url> ProjectServeLoco
cd ProjectServeLoco
```
2. Create the API's production env file:
```bash
nano apps/api/.env.production
```
   Paste the **entire contents** of your local `.env.production` (Step 8) → `Ctrl+O`, `Enter`, `Ctrl+X`.
3. Add the Azure TLS cert:
```bash
mkdir -p apps/api/certs
nano apps/api/certs/DigiCertGlobalRootG2.crt.pem
```
   Paste the cert contents, save the same way.
4. Build and start everything:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
   First build takes ~5–8 min (it builds all 3 apps). Then check:
```bash
docker compose -f docker-compose.prod.yml ps      # all should be "Up"
curl http://localhost/health -H "Host: api.serveloco.app"
```
   You want `mysql: ok` and `mongodb: ok`.

**Why:** One command builds and runs the API + admin + web + nginx router together. `restart: always` means they auto-start on reboot.

**✅ Done when:** all containers show "Up" and the health check returns ok.

> If `/health` shows a DB error: your Azure firewall must allow this server's static IP (Step 9), or a value in `.env.production` is wrong.
> See logs with `docker compose -f docker-compose.prod.yml logs api`. Send me the error.

---

## STEP 12 — Connect Cloudflare DNS (serveloco.app)

**Do this:**
1. https://dash.cloudflare.com → **Add a site** → `serveloco.app` → Free plan.
2. Cloudflare gives you 2 nameservers. At your **registrar**, set the domain's nameservers to those 2. Wait for it to verify (10–30 min).
3. In Cloudflare → **DNS** → **Records**, add **three A records**, all pointing to your **static IP** from Step 9, all **Proxied (orange cloud)**:
   | Type | Name | Value (IPv4) | Proxy |
   |---|---|---|---|
   | A | `api`   | `<your static IP>` | Proxied |
   | A | `admin` | `<your static IP>` | Proxied |
   | A | `app`   | `<your static IP>` | Proxied |
4. Cloudflare → **SSL/TLS** → set encryption mode to **Flexible** (user→Cloudflare is HTTPS; Cloudflare→your server is HTTP port 80, which the nginx router serves).

**Why:** Points your domain at your server and gives free HTTPS — no certs to manage.

**✅ Done when:** the 3 records exist (DNS may take a few minutes).

> The frontends were already built and are being served by the compose stack —
> there is **no separate hosting step**. Once DNS resolves, all 3 subdomains work.

---

## STEP 13 — Smoke test (final check)

Open in your browser, in order:
```
[ ] https://api.serveloco.app/health   → mysql ok, mongodb ok
[ ] https://admin.serveloco.app        → login page loads
[ ] https://app.serveloco.app          → customer PWA loads
```
Then in the admin panel:
```
[ ] Log in with your email + admin password
[ ] Upload a product image → URL starts with villkro-images-prod.s3.ap-south-1.amazonaws.com
[ ] Open that image URL in a private window → it loads
```
Then end-to-end:
```
[ ] Place a test order in the PWA
[ ] Accept it in admin → PWA shows "Accepted" within ~2 seconds
```

**✅ If all pass — you are LIVE. 🎉**

---

## 🛠️ Useful server commands (SSH terminal)

> All commands run from `~/ProjectServeLoco`. Tip: `alias dc='docker compose -f docker-compose.prod.yml'` then just type `dc ps`, `dc logs`, etc.

```bash
docker compose -f docker-compose.prod.yml ps         # are all containers up?
docker compose -f docker-compose.prod.yml logs api   # API logs (add -f to follow)
docker compose -f docker-compose.prod.yml restart api
docker compose -f docker-compose.prod.yml down        # stop everything
docker compose -f docker-compose.prod.yml up -d       # start everything
```

**To deploy a code update later:**
```bash
cd ~/ProjectServeLoco && git pull
docker compose -f docker-compose.prod.yml up -d --build
```
(DB migrations run automatically when the API container starts.)

---

## 🆘 If something breaks

- **A container won't start** → `docker compose -f docker-compose.prod.yml logs <api|admin|web|proxy>` → send me the error.
- **`/health` shows DB error** → Azure firewall must allow your server's static IP; check `.env.production` host/user/password.
- **Image upload fails** → check the API's S3 keys (Step 4) + bucket name match.
- **CORS error in browser** → `CORS_ORIGIN` must list your exact admin/app URLs.
- **502 Bad Gateway** → the `api` container isn't healthy (`docker compose ... ps`).
- **admin/app shows blank** → rebuild with the correct `VITE_API_BASE_URL` (it's baked at build time).
- **Build killed / out of memory** → make sure the swap file (Step 10) is active: `free -h`.

Send me the exact error message and I'll tell you the fix.

---

## 💰 Rough monthly cost (instance model)

| Item | Cost |
|---|---|
| **Lightsail instance (2 GB / 1 vCPU)** | **$10** |
| Azure MySQL B1ms | ~$18 (covered by Azure credit) |
| S3 images | < $1 |
| MongoDB Atlas / Cloudflare | $0 |
| **Total** | **~$29/mo** (or ~$24 with the $5 / 1 GB instance) |

> 💡 One instance runs the **API + admin + web** together, so you do **not**
> pay separately for hosting the two frontends. That's the big saving vs the
> container-service approach (which would have been 3× the cost).

