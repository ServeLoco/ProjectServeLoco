# ProjectServeLoco — Dev Environment / Local-vs-Prod Switch Spec

Date: 2026-07-05 · Branch: `adminfixes` · Status: not started.
This file is an **instruction spec for an implementing AI**. Follow it literally, in task order.

---

## RULES FOR THE IMPLEMENTING AI

1. Do exactly what each task says. No refactors, renames, or "improvements" outside listed steps.
2. Never touch coupon engine, order integrity code, or response field casing — unrelated to this spec.
3. One commit per task, message format: `feat: TASK <n> — <short title>`.
4. Mark checkboxes `[x]` and add a one-line NOTE when a task is done.
5. If a step is impossible as written, stop that task, leave checkbox unticked, add `BLOCKED: <reason>`.
6. Execute tasks in order — later tasks assume earlier ones exist (TASK 4 assumes TASK 2/3 scripts exist).
7. Any new `.env.*` file with real credentials must NOT be committed (repo `.gitignore` already ignores `.env.*` except `*.example` — verify this holds for new files).

---

## Context

VillKro API is deployed on AWS Lightsail; the app is in Play Store closed testing. Feature work happens on local branches. Today there is no single command to start the stack, and the switch between local and production targets is manual across three different mechanisms (API `APP_ENV`, Vite `--mode`, Expo `EXPO_PUBLIC_*`). Worse, `apps/api/.env.development` currently contains **production** values (prod JWT secret, prod S3 keys, Atlas Mongo, `NODE_ENV=production`) mixed with a local MySQL host — a landmine that could let local runs write to production or vice versa.

Goal: one command starts API + Admin + Web + Customer app together, with a clean switch between:
- **local** — everything on this machine, native local MySQL + local Mongo.
- **proddb** — local API code connected to **production** Azure MySQL + Atlas Mongo (for pre-push verification only), UIs still local.

---

## OPEN TASKS — in execution order

### TASK 1 — Fix `apps/api/.env.development` to true local values `[P0]`

**Goal:** `.env.development` must only ever point at local infrastructure. No prod secrets, no prod DB hosts.

**Files:** `apps/api/.env.development`

**Steps:**
- [x] 1.1 Set `APP_ENV=development`, `NODE_ENV=development`.
- [x] 1.2 Keep local MySQL block (`MYSQL_HOST=localhost`, existing root user/password); remove/comment the Azure MySQL block if present.
- [x] 1.3 Point `MONGODB_URI` at a local Mongo instance (`mongodb://localhost:27017`) with a dev-only database name (not the Atlas prod URI).
- [x] 1.4 Replace prod `JWT_SECRET` with a dev-only placeholder value (any string ≥16 chars, clearly not the real prod secret).
- [x] 1.5 Set `CORS_ORIGIN=http://localhost:5173,http://localhost:5174`.
- [x] 1.6 Set `STORAGE_DRIVER=disk`, remove AWS/S3 keys.
- [x] 1.7 Set `PUBLIC_BASE_URL=http://localhost:3000`.
- [x] 1.8 Set `SKIP_SEED_DEFAULTS` to whatever lets `npm run seed` work locally (unset it or `false`, opposite of prod's `true`).

**NOTE (done):** Rewrote `apps/api/.env.development` with local-only values. File is `.gitignore`d (local credentials); verified `APP_ENV=development node -e "require('./src/config/env.js')"` loads and prints `MYSQL_HOST=localhost`, `MONGODB_URI=mongodb://localhost:27017/`, `PUBLIC_BASE_URL=http://localhost:3000`, `STORAGE_DRIVER=disk`.

**Do NOT:** touch `apps/api/.env.production` — it stays the source of truth for real prod values.

**Done when:** `cd apps/api && APP_ENV=development node -e "require('./src/config/env.js')"` loads without throwing, and printed config shows `localhost` MySQL + local Mongo URI, not Azure/Atlas.

---

### TASK 2 — Add `proddb` env profile to the API `[P0]`

**Goal:** New profile lets local API code run against production databases, without touching `.env.production` or `.env.development`.

**Files:** `apps/api/.env.proddb` (new, gitignored), `apps/api/.env.proddb.example` (new, tracked), `apps/api/package.json`

**Steps:**
- [x] 2.1 Create `apps/api/.env.proddb` by copying the Azure MySQL + Atlas Mongo connection values out of `apps/api/.env.production` (host, port, database, user, password, SSL, Mongo URI, Mongo database, S3 config).
- [x] 2.2 In that file, override: `APP_ENV=proddb`, `NODE_ENV=development` (keeps dev fallbacks/relaxations, avoids prod-only gates), `CORS_ORIGIN=http://localhost:5173,http://localhost:5174`, `PUBLIC_BASE_URL=http://localhost:3000`.
- [x] 2.3 Create `apps/api/.env.proddb.example` mirroring the existing `.env.production.example` convention (placeholders only, no real credentials).
- [x] 2.4 In `apps/api/package.json`, add script: `"dev:proddb": "cross-env APP_ENV=proddb NODE_ENV=development nodemon src/server.js"`. Do not add a migrate step to this script — never auto-migrate production from a local run.

**NOTE (done):** Created `.env.proddb` (untracked, real prod DB + S3 values, local CORS/base-url overrides) and `.env.proddb.example` (tracked template). Added `dev:proddb` script to `apps/api/package.json`; no migrate step.

**Do NOT:** run `db:migrate` against proddb from any script added in this spec.

**Done when:** `cd apps/api && npm run dev:proddb` (with real `.env.proddb` filled in) connects to Azure MySQL + Atlas Mongo and serves on :3000; `git status` shows `.env.proddb` untracked (ignored).

---

### TASK 3 — Fix web/admin port collision `[P1]`

**Goal:** Admin and Web PWA can run simultaneously without port conflict.

**Files:** `apps/web/vite.config.js`

**Steps:**
- [x] 3.1 Add `server: { port: 5174, strictPort: true }` to the Vite config export (admin stays on default 5173).

**NOTE (done):** Added `server: { port: 5174, strictPort: true }` to `apps/web/vite.config.js`; admin remains on Vite default 5173.

**Done when:** `cd apps/web && npm run dev` binds to :5174 while admin's `npm run dev` binds to :5173, both running at once.

---

### TASK 4 — Root single-command orchestrator `[P0]`

**Goal:** One command starts API + Admin + Web + Customer app together, in either `local` or `proddb` mode, with a safety preflight.

**Files:** `package.json` (root, new scripts + devDependency), `scripts/dev.js` (new)

**Steps:**
- [x] 4.1 Add `concurrently` as a root devDependency.
- [x] 4.2 Add root scripts: `"dev": "node scripts/dev.js local"`, `"dev:proddb": "node scripts/dev.js proddb"`.
- [x] 4.3 Write `scripts/dev.js`:
  - Parse mode arg (`local` | `proddb`), default `local` if omitted.
  - **Local mode preflight:** TCP-probe `localhost:3306` (MySQL) and `localhost:27017` (Mongo) using Node's built-in `net` module (no new dependency). If either is unreachable, print a clear error naming the service and exit non-zero before spawning anything.
  - **proddb mode guard:** print a loud warning that the local API will read/write PRODUCTION databases; require the user to type `y` to continue (skip prompt if `--yes` flag passed), otherwise abort.
  - Spawn via `concurrently` with labeled/colored output:
    - `api`: `npm run dev` in `apps/api` (local) or `npm run dev:proddb` in `apps/api` (proddb)
    - `admin`: `npm run dev` in `apps/admin`
    - `web`: `npm run dev` in `apps/web`
    - `app`: `npm start` in `apps/customer-app`
  - Ctrl-C must terminate all four child processes.

**Do NOT:** add Docker orchestration — local DBs are native installs per user's environment, not containers.

**Done when:** `npm run dev` from repo root starts all four apps with labeled output, and fails fast with a clear message if local MySQL/Mongo aren't running. `npm run dev:proddb` prompts for confirmation, then starts API against production DBs and the three frontends locally.

**NOTE (done):** Installed `concurrently` as root devDependency, added root `dev`/`dev:proddb` scripts, and created `scripts/dev.js` with TCP preflight for local MySQL/Mongo, interactive confirmation for `proddb`, labeled colored output, and `killOthers` so Ctrl-C stops all children.

---

### TASK 5 — Document the workflow `[P2]`

**Goal:** Anyone (including future you) can find and use the new commands.

**Files:** root `README.md` (create short section if a README exists, otherwise add one) or `CLAUDE.md` under a new "Local dev" note — pick whichever file already exists; do not create a new doc file if one of these already covers commands.

**Steps:**
- [ ] 5.1 Document `npm run dev` (local, all four apps, requires local MySQL+Mongo running) and `npm run dev:proddb` (local API code against production DBs, confirmation required, UIs still local) and what each connects to.

**Done when:** the two commands and their meaning are written down in one discoverable place.

---

## Verification (run after all tasks)

1. `npm install` at root, then `npm run dev` — all four processes start labeled; `curl http://localhost:3000/api/health` OK; admin (localhost:5173) and web (localhost:5174) both load and hit local API; log into admin against local DB.
2. Stop local MySQL, rerun `npm run dev` — preflight fails with a clear message before any process starts.
3. `npm run dev:proddb` — warning + `y` prompt appears; on confirm, API connects to Azure MySQL/Atlas Mongo (verify via API logs), admin/web still local, read-only smoke test against real data only.
4. `cd apps/api && npm test` — full jest suite still passes unchanged.
5. With an Android device attached: `npm run dev` still runs `adbReverse` via customer-app's existing `prestart` hook; app on device reaches local API on :3000.
