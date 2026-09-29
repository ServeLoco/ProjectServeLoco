# Plan: Move production MySQL from Azure to AWS RDS (same database, app works the same)

## Context

- **Where the database is now:** Azure MySQL (`servelocoserver`) in Hong Kong, paid by an Azure for
  Students credit.
- **Why move:**
  - If the credit runs out, or LPU closes the email, the database stops and the app goes down.
  - Every query also travels Mumbai → Hong Kong and back, about 96 ms.
- **Where it goes:** AWS RDS MySQL in Mumbai, zone `ap-south-1a`. That is the same account and zone
  as the Lightsail box, so a query will take about 1 ms.
- **What we need:**
  1. Zero data loss.
  2. The app connects and behaves exactly as today.
  3. About 15 minutes of API downtime, one night between 2 and 4 AM IST.
- **How we work:** you click in the AWS console. I check every step with read-only AWS calls and
  tell you ✅ or what to fix. Commands on the box are pasted by you or run by me, and I ask
  before each one.

**Status:** approved 2026-09-29. Phase 0 is done. The scripts are in `deploy/rds-migration/` (run order in its README), and the whole flow was tested on a laptop against two local MySQL 8.4.11 servers. Nothing has been done on Azure, AWS or the box yet.

---

## 1. Facts I checked (2026-09-29)

### Azure today (read live with `az`)

- MySQL **8.4.9**, B1ms (1 vCore, 2 GB). The only app database is `serveloco`, stored as
  `utf8mb4` / `utf8mb4_0900_ai_ci`.
- 7-day backups, GTID off, binlog ROW, `max_connections` 171.
- The Azure firewall has a rule that allows **the whole internet** (`AllowAll_2026-5-30`). Only
  the password protects the data today.

### AWS today

- Account plan is **PAID**, with **$194.38 of credits** left.
- No RDS database exists yet. Lightsail VPC peering is **off**.
- The box is `villkro-server`: private IP `172.26.14.155`, zone `ap-south-1a`.
- The default VPC is `172.31.0.0/16`. It doesn't overlap Lightsail's `172.26.0.0/16`, so the two
  can be connected.
- MySQL **8.4.11** on db.t4g.micro with gp3 storage is available in `ap-south-1a`.

### RDS default settings do NOT match Azure

We fix this with our own parameter group, before the database exists.

| Setting | Azure (live) | RDS default | We set | If we don't |
|---|---|---|---|---|
| `lower_case_table_names` | 1 | 0 | **1** | Can only be set when the database is created. It can't be fixed later. |
| `sql_mode` | `ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO` | `NO_ENGINE_SUBSTITUTION` | **Azure's exact value** | Bad data gets silently cut instead of rejected. |
| `require_secure_transport` | ON | OFF | **1** | Connections without encryption would be allowed. |
| `event_scheduler` | OFF | ON | **OFF** | Different from Azure. |
| `character_set_server` / `collation_server` | utf8mb4 / utf8mb4_0900_ai_ci | unset | **utf8mb4 / utf8mb4_0900_ai_ci** | New tables from `migrate.js` get the wrong collation, and joins fail with "Illegal mix of collations". |
| `time_zone` | +00:00 | UTC | leave | — |
| `binlog_format` | ROW | ROW | leave | — (the order flow's READ COMMITTED needs ROW) |
| `innodb_ft_min_token_size` | 3 | 3 | leave | — (product search depends on it) |
| `transaction_isolation` | REPEATABLE-READ | same | leave | — |

### How the app connects (why it will work the same)

- **Pool:** `apps/api/src/db/mysql.js` reads `MYSQL_HOST`, `PORT`, `USER`, `PASSWORD`, `DATABASE`,
  `MYSQL_SSL` and `MYSQL_SESSION_TZ` through `apps/api/src/config/env.js`.
- **Settings come only from `.env.production`:**
  - `apps/api/src/config/loadEnv.js` puts the container's own environment back on top of any file
    it loads.
  - `.dockerignore` keeps every `.env.*` file out of the image.
  - So `apps/api/.env.production` on the box, loaded by `docker-compose.prod.yml` `env_file`, is
    the **only** place the settings come from. The move is **3 lines** in it: `MYSQL_HOST`,
    `MYSQL_USER`, `MYSQL_PASSWORD`.
- **TLS:** `apps/api/src/db/mysqlSsl.js` with `MYSQL_SSL=true` and an empty CA path encrypts the
  connection without checking the certificate. That works on RDS as it is.
  - ⚠️ If `MYSQL_SSL_CA_PATH` is set in `.env.production`, it points to Azure's certificate and
    the RDS connection will fail. The pre-check reads it, and it must be empty.
- **Time:** `timezone: 'Z'` plus a UTC server means every time is read and written exactly as
  today.
- **The other two things that connect:**
  - `apps/api/src/db/migrate.js`: needs CREATE, ALTER, INDEX, REFERENCES and DROP, and uses
    `GET_LOCK`.
  - The deploy backup in `.github/workflows/deploy.yml`: `mysqldump` needs PROCESS, TRIGGER and
    EVENT, or **every future deploy stops**.
- Nothing needs SUPER. There are no triggers, events, routines or views.
- The admin, customer app and landing pages never touch MySQL.
- `migrate.js` rewrites its seed rows on every run, so we always compare data **before** running
  migrate.

---

## 2. Decisions

- **Engine:** RDS MySQL **8.4.11**.
- **Size:** **db.t4g.micro** (1 GB). The data is about 43 MB. It can be resized later.
- **Single-AZ**, `ap-south-1a`. Multi-AZ can be switched on later with no downtime.
- **Storage:** 20 GB gp3, autoscaling up to 50 GB.
- **Private.** Public access is **No**. Security group: port 3306 only from `172.26.14.155/32`.
- **Encrypted.** 7-day backups. Deletion protection ON. Auto minor upgrade ON.
- **Night windows:**
  - Backup 23:30–00:00 UTC (05:00–05:30 IST).
  - Maintenance Mon 00:00–00:30 UTC (05:30–06:00 IST).
- **Two users:**
  - `villkroadmin` (master). Its password lives in AWS Secrets Manager. Used only once, to set up.
  - `villkro_app`. Used by the app, migrations and deploy backups.
    - On `serveloco.*`: SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES,
      CREATE TEMPORARY TABLES, LOCK TABLES, SHOW VIEW, TRIGGER, EVENT.
    - Globally: PROCESS.
    - Must use TLS (`REQUIRE SSL`).
- **Passwords never go through chat.**
  - The master password is pasted only into a hidden prompt on the box.
  - The app password is generated on the box with `openssl rand -hex 24`, written straight into a
    file, and never printed.
- **Cost:** about $18.4/month:
  - db.t4g.micro at $0.021/hour: about $15.3.
  - 20 GB gp3 at $0.131/GB: about $2.6.
  - Secrets Manager: $0.40.
  - Backups and same-zone traffic: about $0.
  - The $194 of credits covers about 10 months.
- **Freeze rule:** **no push to `main` from Phase C until Phase D is done.** A push runs
  `deploy.yml`, which stops and starts the API and migrates by itself.

---

## Safety net: backups of the working Azure database (before anything else)

**Rule: nothing is copied, switched or changed until these backups exist and one of them is
proven to restore.** Azure is only ever *read* during the move. No script writes to it except
rollback R3, which you approve separately.

| # | Backup | Who / how | Where it lives | Survives |
|---|---|---|---|---|
| S1 | **Longer Azure backup retention.** Raise it from 7 → **35 days** for the move period. Free, because backup storage is free up to 31 GB and the DB is ~43 MB. | You click: Azure portal → `servelocoserver` → **Compute + storage** → Backup retention period = 35 → Save. No downtime. | Azure | Any mistake in the next 35 days: point-in-time restore to any minute |
| S2 | **Azure on-demand backup "before-rds-move"** | You click: Azure portal → `servelocoserver` → **Backup and restore** → **Backup now** | Azure | A bad change to Azure itself |
| S3 | **Full dump `pre_move_<time>.sql.gz`**, same client and flags as the deploy backup | `./backup-azure.sh pre_move` on the box, run by me with your OK. Read-only on Azure, API stays up. | Box: `~/rds-migration/backups/` | Azure going down or being closed |
| S4 | **Copy of S3 on your laptop** | `scp` from the box, then check that the sha256 matches | Laptop: `~/villkro-db-backups/` | The box dying |
| S5 | **The 5 most recent deploy dumps** that already exist | Already there, left untouched | Box: `~/backups/` | Extra older restore points |
| S6 | **Copy of `apps/api/.env.production`** | Backed up by `switch-env.sh` | Box: `~/rds-migration/`, chmod 600 | A bad config switch |

**S3 is proven to restore.**
- In Phase C, S3 is the dump we restore into RDS.
- `compare.sh` then proves the restored copy is complete: every table, every row, every foreign
  key. So we know the backup works before we depend on it.

**Moving night gets its own fresh set** (step D1b):
- Another Azure **Backup now** ("before-cutover").
- Write down the exact **UTC time** just before the API stops. Azure point-in-time restore can
  return to that minute.
- The final dump from D4, which is kept forever, and copied to your laptop in D12.

So on the night there are **4 independent copies** of the last good state:
1. Azure point-in-time restore.
2. The Azure on-demand backup.
3. The dump on the box.
4. The dump on your laptop.

### If something breaks midway

| What breaks | What happens to your data | What we do |
|---|---|---|
| SSH or internet drops during the copy or compare | Azure untouched. RDS half-filled, which doesn't matter. | Reconnect, `docker compose -f docker-compose.prod.yml up -d api` on the old settings (R1), or re-run `copy.sh`. It always starts RDS from empty. |
| The restore into RDS fails halfway | Azure untouched | Fix it, re-run `copy.sh`, or R1 |
| `compare.sh` finds any difference | Azure untouched | **Stop.** R1. Find the cause in daylight. |
| The API won't start on RDS | Azure untouched, no orders on RDS | R1 / R2: old settings back, API up in ~2 min |
| The box dies during the move | Azure untouched | New box from a Lightsail snapshot, old settings. Dump copies are on the laptop. |
| Azure goes down or gets closed during the move | Your data is in S3/S4 and the D4 dump | Restore the newest dump into RDS, `compare.sh --dump`, then continue |
| RDS has a problem after the move, with real orders | Those orders are only on RDS | RDS point-in-time restore (7 days), or R3 reverse copy to Azure |
| A script is pointed at Azure by mistake | Protected: `copy.sh` refuses to drop anything on a non-RDS host, and dumps only read | If ever needed: Azure point-in-time restore to the time written down in D1b |

---

## Phase 0 — I prepare the scripts (no risk, ~30 min)

I write these in `deploy/rds-migration/` on a local branch `rds-migration`. I commit, **but don't
push**. Then I copy them to `~/rds-migration/` on the box, outside the repo, so a deploy's
`git reset --hard` can't touch them.

| File | What it does |
|---|---|
| `rds.env.example` | Template holding only `MYSQL_HOST`, `MYSQL_USER=villkro_app`, `MYSQL_PASSWORD`. The real `rds.env` exists only on the box, chmod 600. |
| `setup-db.sh` | Asks for the master password at a hidden prompt. Creates `serveloco` with `utf8mb4_0900_ai_ci`, then creates `villkro_app` with the rights above. The SQL goes in on stdin, so no password ever appears in the process list. |
| `copy.sh` | Dumps Azure with the same client and flags the deploy uses (`mysql:8.0`, `--ssl-mode=REQUIRED --single-transaction --quick --routines --triggers --events --default-character-set=utf8mb4`), plus `--order-by-primary --set-gtid-purged=OFF --no-tablespaces`. Checks `gzip -t` and the `Dump completed` line. Recreates the empty `serveloco` on RDS, then restores into it. **It refuses to drop anything unless the target host ends in `.rds.amazonaws.com`.** |
| `compare.sh` | Two modes: `--live` (Azure vs RDS) and `--dump <file>` (dump vs RDS). Prints both sides next to each other:<br>1. The exact `COUNT(*)` of every table.<br>2. A **data fingerprint**: sha256 of a same-flag dump of each side, with comment lines removed.<br>3. A schema fingerprint.<br>4. `SHOW CREATE DATABASE`.<br>5. The key settings from §1.<br>6. Zero orphan rows on every foreign key.<br>It exits 0 only if all of it is identical. It reuses the counting and FK-check patterns from `deploy/backup/verify-restore.sh`: real `COUNT(*)`, no `GROUP_CONCAT` truncation. |
| `app-check.js` | Runs **inside the real API image**, through the app's own code. Prints JSON, and we run it once against Azure and once against RDS, then diff. Details in §App checks. |
| `switch-env.sh` / `rollback-env.sh` | Backs up `apps/api/.env.production`, then changes only the 3 `MYSQL_*` lines using `rds.env`. Prints a diff with the password masked, and refuses if `MYSQL_SSL_CA_PATH` is not empty. The rollback script puts the backup back. |

All containers are run with a memory cap (`--memory 200m`), so they can't starve the live API. The
box has 1 GB of RAM and about 200 MB free.

**How the app scripts are run:**

```bash
docker run --rm --memory 200m --env-file apps/api/.env.production --env-file ~/rds-migration/rds.env \
  -v ~/rds-migration/app-check.js:/usr/src/app/app-check.js:ro \
  ghcr.io/serveloco/projectserveloco-api:$(cat .deploy-tag) node app-check.js
```

- The second `--env-file` overrides the first. Leave it out and the same command runs against
  Azure.
- The script's first output line shows which server it reached (`@@hostname`), so a wrong target
  is caught at once.

---

## Phase A — Build the AWS side (you click, I check; no downtime; any day, ~1 hour)

### A1. Connect Lightsail to AWS (VPC peering)
1. Open the **Lightsail console**, click your **username** (top right), then **Account**.
2. Open the **Advanced** tab.
3. Under **VPC peering**, switch on **Asia Pacific (Mumbai) ap-south-1**.

✅ I check that `IsVpcPeered` is true and a peering connection exists in the VPC console.

### A2. Security group (the firewall for the database)
1. Open the **VPC console**, then **Security groups**, then **Create security group**.
2. Fill in:
   - Name `villkro-rds-sg`
   - Description `MySQL from villkro-server Lightsail only`
   - VPC: the **default** VPC (`172.31.0.0/16`)
3. Inbound rules → Add rule:
   - Type **MYSQL/Aurora** (port 3306)
   - Source **Custom** `172.26.14.155/32`
   - Description `villkro-server`
4. Leave outbound as it is, then **Create**.

✅ I check that the group has exactly that one inbound rule.

### A3. Parameter group (makes RDS behave like Azure)
1. Open the **RDS console**, then **Parameter groups**, then **Create parameter group**.
2. Fill in:
   - Engine **MySQL Community**
   - Family **mysql8.4**
   - Type **DB Parameter Group**
   - Name `villkro-mysql84`
   - Description `Matches Azure servelocoserver`
3. Click **Create**.
4. Open it, click **Edit**, then search for each of these and set it:
   - `lower_case_table_names` = `1`
   - `sql_mode` = `ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO`
   - `require_secure_transport` = `1`
   - `event_scheduler` = `OFF`
   - `character_set_server` = `utf8mb4`
   - `collation_server` = `utf8mb4_0900_ai_ci`
5. Click **Save changes**.

✅ I read all 6 values back.

### A4. Create the database
Open the **RDS console**, then **Databases**, then **Create database**, and fill in each section:

- **Creation method:** Standard create (it may be called "Full configuration").
- **Engine:** MySQL. Version **8.4.11**.
- **Template:** Dev/Test.
- **Availability:** Single-AZ DB instance.
- **Settings:**
  - Identifier `villkro-prod-mysql`
  - Master username `villkroadmin`
  - Credentials management: **Managed in AWS Secrets Manager**, default key
- **Instance:** Burstable classes, **db.t4g.micro**.
- **Storage:**
  - gp3, 20 GB
  - Storage autoscaling ON, maximum **50** GB
- **Connectivity:**
  - **Don't connect to an EC2 compute resource**
  - Default VPC, default subnet group
  - **Public access: No**
  - Security group: choose `villkro-rds-sg` and **remove `default`**
  - Availability zone **ap-south-1a**
  - Port 3306
- **Authentication:** password authentication.
- **Monitoring:** leave the free default. Enhanced Monitoring **off**.
- **Additional configuration:**
  - Initial database name **leave EMPTY**. `setup-db.sh` creates it with the right collation.
  - DB parameter group **`villkro-mysql84`**
  - Backups ON, **7 days**, window **23:30 UTC, 0.5 h**
  - Encryption ON (default key)
  - Log exports: none
  - Auto minor version upgrade ON, maintenance window **Mon 00:00 UTC, 0.5 h**
  - **Deletion protection ON**
- Click **Create database**, then wait 10–15 minutes.

✅ I check:
- Status `available`, version 8.4.11, db.t4g.micro, ap-south-1a.
- Not public, SG `villkro-rds-sg` only.
- Parameter group `villkro-mysql84` in-sync.
- Encrypted, backups 7 days, deletion protection on.

Then I give you the **endpoint**.

---

## Phase B — Connect the box to RDS (no downtime, ~20 min)

**B1.** I copy the Phase 0 scripts to `~/rds-migration/` on the box with `scp` (with your OK).

**B2.** Create `~/rds-migration/rds.env` on the box. I fill in the host, and the password is
generated and never shown:

```bash
cd ~/rds-migration && umask 077 && printf 'MYSQL_HOST=%s\nMYSQL_USER=villkro_app\nMYSQL_PASSWORD=%s\n' "<endpoint>" "$(openssl rand -hex 24)" > rds.env
```

**B3. Set up the user.**
1. Get the master password:
   - Open **Secrets Manager** and find the secret whose name starts with `rds!db-`.
   - Click **Retrieve secret value** and copy the `password`.
2. On the box, run `./setup-db.sh` and paste the password at the hidden prompt.

**B4. Connection test from the box:** `./check.sh`. It runs as `villkro_app` in a `mysql:8.0`
container, the same path the app uses. Every line must show:

| Check | Expected |
|---|---|
| `SELECT VERSION()` | `8.4.11` |
| `@@lower_case_table_names` | `1` |
| `TIMEDIFF(NOW(), UTC_TIMESTAMP())` | `00:00:00` |
| `@@sql_mode` | Azure's exact value |
| `SHOW CREATE DATABASE serveloco` | `utf8mb4` / `utf8mb4_0900_ai_ci` |
| `SHOW STATUS LIKE 'Ssl_cipher'` | not empty (TLS in use) |
| `SHOW GRANTS` | exactly the rights in §2 |
| Round trip: 20 × `SELECT 1` | ~1 ms (Azure measured the same way: ~96 ms) |
| Table count on Azure | **45**: the code creates 45 tables, which the laptop test confirmed |

---

## Phase C — Practice run on real data (no downtime, the day before, ~45 min)

Azure is only **read** here. The API stays up. Every step is timed.

- [ ] **C0. Safety net first.** S1–S4 are done: retention is 35 days, "before-rds-move" is
  completed, `pre_move_*.sql.gz` is on the box and on the laptop, and the sha256 values match.
- [ ] **C1. Copy.** Run `./copy.sh --dump backups/pre_move_*.sql.gz`: restore the S3 dump into RDS.
  - Pass: clean dump, no restore errors.
  - This also proves S3 restores.
- [ ] **C2. Prove identical.** Run `./compare.sh --dump <the dump from C1>`.
  - Pass: identical fingerprint, identical schema, 0 orphan rows.
  - Azure is live, so we compare RDS against the dump, not against Azure.
- [ ] **C3. App checks.** `./app-check.sh`: runs `app-check.js` against Azure, then RDS, and diffs the JSON.
  - It only reads rows that existed at dump time, so new live orders on Azure don't cause false
    alarms.
  - Pass: identical, except the host line.
- [ ] **C4. Write test.** `./app-check.sh --rds-extra` on RDS only: insert, update and delete inside a
  transaction, then roll back.
  - Pass: every write works, nothing is left behind.
- [ ] **C5. Pool test.** The same `--rds-extra` run opens 30 connections at once through the app's
  pool, then reads `@@max_connections`.
  - Pass: all 30 connect, and `max_connections` is above 30 plus room for a deploy.
- [ ] **C6. Migration test.** `./migrate-test.sh`: the API image's `migrate.js` against RDS
  (`rds.env` override, memory cap).
  - Pass: exit 0. This proves `villkro_app` can run every future migration.
- [ ] **C7. Deploy backup test.** `./deploy-dump-test.sh` runs the **exact** `deploy.yml` dump command (`mysql:8.0`, same
  flags) as `villkro_app` against RDS.
  - Pass: over 10 KB, ends with `Dump completed`. This proves the next deploy won't be blocked.
- [ ] **C8. Timing.** Write down how long C1 + C2 took. That is the real downtime estimate.

**Go / no-go:** everything green → pick the night. Anything red → I fix it and we run Phase C
again.

---

## Phase D — Moving night (2–4 AM IST; API down ~15 min)

**The day before:**
- No push to `main`.
- Check that your `aws login` and SSH work.
- Keep the admin panel open.

| Step | Action | Pass / stop rule |
|---|---|---|
| D1 | **Pre-checks, API up** (`./precheck.sh`). No active orders (`status NOT IN ('Delivered','Cancelled')` = 0). Disk and memory OK. RDS `available`. `MYSQL_SSL=true`, `MYSQL_SSL_CA_PATH` empty and `MYSQL_SESSION_TZ` Z/unset in `.env.production` (read without printing secrets). Note today's dashboard numbers. | Any active order → wait |
| D1b | **Fresh backups:** Azure portal **Backup now** ("before-cutover"). I write down the exact UTC time. | The backup shows "Completed" |
| D2 | **Stop the API:** `docker compose -f docker-compose.prod.yml stop api` | ⏱ **Downtime starts.** Landing and admin stay up. |
| D3 | **Freeze check:** `./connections.sh azure` | Only our own session remains |
| D4 | **Final copy:** `./copy.sh`, which saves `copy_azure_<time>.sql.gz` (**kept forever**) | Clean dump + restore, else **R1** |
| D5 | **Prove identical:** `./compare.sh --live`. Azure is frozen now, so both sides must match exactly. | **Everything identical, or STOP → R1** |
| D6 | **App checks:** `./app-check.sh` | Identical, else **R1** |
| D7 | **Switch:** `./switch-env.sh` | The masked diff shows exactly 3 changed lines |
| D8 | **Migrate,** like a deploy: `docker compose -f docker-compose.prod.yml run --rm --no-deps api npm run db:migrate` | Exit 0, else **R1** |
| D9 | **Start:** `docker compose -f docker-compose.prod.yml up -d api`, then wait for `healthy` | ⏱ **Downtime ends.** Checks below. |
| D10 | **Prove it's on RDS:** `./connections.sh rds` shows `villkro_app`, and `./connections.sh azure` shows nothing from the app | Else **R2** |
| D11 | **Live test (you):** admin login, orders list, dashboard numbers equal to D1. Place 1 test order on the app, the shop accepts it and the alarm rings, then cancel it. I confirm the row is in RDS. | Else **R2** |
| D12 | **Extra copies:** manual RDS snapshot `villkro-after-move-<date>`, and the final dump copied to your laptop with `scp` | 3 copies exist |

**The D9 checks** (the same gates `deploy.yml` uses):
- `/health` through the proxy returns `{"status":"ok","databases":{"mysql":"ok","mongodb":"ok"}}`.
- `POST /api/auth/firebase-verify` with a dummy token returns **401**.
- The logs show the sweepers starting, and there are no errors.
- Sentry is quiet.

### Rollback

| Case | Do | Data lost |
|---|---|---|
| **R1**: before D9 (the API never ran on RDS) | `./rollback-env.sh`, then `up -d api`. Azure never changed. About 2 min. | None |
| **R2**: after D9, before any real customer order | Same as R1. RDS is ignored. | None (only our test order) |
| **R3**: after real orders on RDS | Stop the API, copy RDS → Azure with the same scripts reversed, `compare.sh --live`, `./rollback-env.sh`, start. | None |

---

## App checks: what proves the app "works the same"

`app-check.js` runs inside the API image and uses the app's own modules:
- `src/db/mysql.js` (`pool`, `beginReadCommitted`)
- `src/utils/search.js` (`decideSearchMode`)
- `src/utils/businessTime.js` (`istDateOf`, `istIsToday`)

| App feature | Check | Must equal Azure |
|---|---|---|
| TLS connection (`mysqlSsl.js`) | `Ssl_cipher` through the pool | not empty |
| Time handling (`timezone:'Z'`) | the last 20 orders' `created_at` as JS ISO strings; `NOW()` vs `UTC_TIMESTAMP()` | identical strings; diff 0 |
| IST reports (`CONVERT_TZ`) | orders per IST day for the last 30 days, using `istDateOf` | identical |
| Product search (FULLTEXT) | 5 common terms through `decideSearchMode` → matching product ids | identical |
| Table names / case | a query against every table name the code uses | all succeed |
| Strict mode | `@@sql_mode`, plus one insert of a too-long value inside a rolled-back transaction | error, same as Azure |
| Order-flow transaction | `beginReadCommitted()` → `SELECT … FOR UPDATE` → rollback | works |
| Migration lock | `GET_LOCK('villkro_migrate_test', 5)` → `RELEASE_LOCK` | 1 / 1 |
| Collation | every table's collation plus the database default | identical |
| Key data | areas, shops, products, users, coupons: counts and max ids | identical |

The app itself is proven by the D9 `/health` and Firebase gates, and by your D11 live order.

---

## Phase E — After the move

**Day +1**
- Run `./compare.sh --dump backups/copy_azure_*.sql.gz --target azure`. Identical means nothing wrote
  to Azure after the freeze.
- Check RDS CPU, CPU credits, free memory and connections.
- On the next normal deploy, watch its backup and migrate steps pass.
- Remove Azure's `AllowAll` firewall rule.

**Repo cleanup** (local branch, `npm test` + `npm run lint` in `apps/api`, **no push without your
OK**)
- Replace the "Azure" wording in:
  - `apps/api/src/config/env.js`, `src/db/mysql.js`, `src/db/mysqlSsl.js`
  - `docker-compose.prod.yml`, `README.md`
  - `.env.production.example`, `.env.proddb.example`
  - `scripts/riderDispatchLoadTest.js`
  - `plans/backup-and-restore.md`, `plans/area-rollout-runbook.md`
- `apps/api/public/policies/privacy.html`: the data-processor line becomes "Amazon Web Services
  (RDS), Mumbai, India". **You choose the final wording.**
- Change CI `mysql:8.0` → `mysql:8.4` in `ci.yml`, `deploy.yml` and `backup-verify.yml`.
- Optional: make `MYSQL_POOL_SIZE` actually work (`env.js` never reads it today).

**Day +7 to +14** (with your OK)
1. Take one last Azure dump.
2. Delete the Azure server. Don't just stop it: Azure restarts a stopped server by itself after 30
   days.
3. The dumps on the box and laptop are **kept forever**. They are small (~1–2 MB each).

**Later hardening** (optional)
- Check the RDS certificate (`MYSQL_SSL_CA_PATH` plus the RDS CA bundle mounted in compose).
- CloudWatch alarms.
- An off-box backup bucket.
- An IAM user instead of root.

**Update memory:** the new DB host and `~/rds-migration/` on the box.

---

## Timeline

| When | What | Downtime |
|---|---|---|
| Day 1 | **Safety net S1–S4 first**, then Phase 0 (me) + Phase A (you click) + Phase B | none |
| Day 2 | Phase C practice run | none |
| Day 2 or 3, 2–4 AM IST | Phase D | ~15 min |
| Day +1 | Checks + AllowAll removed | none |
| Day +7 to +14 | Retire Azure | none |

## Why no data is lost

0. **Backups come first.** Azure point-in-time restore is raised to 35 days. On-demand Azure
   backups are taken before the practice run and again before the cutover. Full dumps are kept
   on the box and on your laptop, and one is proven to restore before anything depends on it.
1. The API is stopped and connections are checked **before** the final copy.
2. Every table, all data, the schema and the settings are **proven identical** before the switch.
3. The app is **proven to read the same results** from both databases.
4. A full practice run on real data comes first.
5. Azure stays untouched for 2 weeks, and the final dump is kept in 3 places.
6. The scripts refuse to delete anything on a host that isn't RDS.
7. No deploys run during the move.
