# Backups and restore

Covers what the deploy actually backs up, what it does not, how to restore,
and where the backups should live. Companion to
[`multi-area-tasks.md`](./multi-area-tasks.md) TASK 0 (Phase 0 safety gate).

---

## 1. What exists today

Everything worth backing up is in MySQL.

| | Service | Backed up by the provider | Backed up by us |
|---|---|---|---|
| Everything durable — orders, products, users, **and image metadata** (the `images` table) | Azure Database for MySQL, Flexible Server, `centralindia` | automated backups + point-in-time restore, within the configured retention | `mysqldump` before every migration |
| Analytics only — `analytics_events`, `analytics_sessions`, `analytics_daily` | MongoDB Atlas | n/a | **nothing, deliberately** |

**Mongo is not backed up, on purpose.** It holds analytics and nothing else,
and every collection in it has a TTL index — events and sessions expire after
30 days, daily rollups after a year — so Mongo deletes its own contents on a
schedule. Backing up data the application is actively expiring is not a
backup, it is a way to resurrect rows something decided to drop. The `images`
collection in `seed_demo.js` is vestigial: it is written by the demo seeder
and read by nothing. Real image metadata is the **`images` table in MySQL**,
and it is covered by the dump below.

`deploy.yml` dumps MySQL immediately before it migrates, gzips it to
`$HOME/backups/serveloco_<ts>_<sha>.sql.gz` on the Lightsail box, keeps the
five newest, and refuses to migrate if the dump fails, fails `gzip -t`, or
comes out under 10 KB.

That dump is a **deploy rollback point**, not disaster recovery. It exists so
a migration that goes wrong can be undone, and the checks on it are sized for
that job. Disaster recovery is the provider's automated backups.

### What was wrong with it

1. **Nothing had ever restored one.** `gzip -t` proves a file decompresses.
   It does not prove the file contains a database. `mysqldump` writes
   `FOREIGN_KEY_CHECKS=0` at the top of every dump, so a file cut off halfway
   replays into MySQL without one error message and leaves a schema full of
   rows pointing at parents that are not there.
2. **The dumps sat on the disk they protect.** `$HOME/backups` is on the same
   Lightsail volume as the containers. It survives a bad migration and nothing
   else — not a lost instance, not a full disk, not a wrong `rm`.

---

## 2. What changed

### `deploy/backup/verify-restore.sh`

Restores a dump into a scratch schema on a throwaway MySQL and then checks
what the restore cannot check for itself:

- the gzip trailer and the `Dump completed on` line, which `mysqldump` writes
  only after a clean finish — without it the file is a prefix of a backup;
- every table in `VERIFY_REQUIRED_TABLES` present, every table in
  `VERIFY_NONEMPTY_TABLES` non-empty;
- **every foreign key in the restored schema re-tested against the restored
  rows.** This is the check that catches a dump which restores silently and is
  still missing data;
- `CHECK TABLE ... QUICK` across every table;
- a row-count manifest — real `COUNT(*)`, not
  `information_schema.TABLE_ROWS`, which is an InnoDB estimate that can be off
  by half — compared against the last verified backup, failing on any table
  that shrank more than `VERIFY_DRIFT_PCT` (default 10%).

Exit codes: `0` verified, `1` usage or connection error, `2` the backup failed
a check.

### `deploy/backup/selftest.sh`

The verifier is the only thing between "a file exists in `$HOME/backups`" and
"there is a backup", so it has a test of its own. It dumps a live database,
confirms the dump verifies, then breaks it in each of the three ways a real
backup breaks — truncated mid-write, missing rows from a parent table, a
sudden collapse in row counts — and confirms each is caught, *and caught for
the right reason*. It runs on every API CI build (`ci.yml`), against the
database CI has just migrated.

### `deploy/backup/offbox-upload.sh` and `backup-verify.yml`

Copy the dump to S3 after it is taken, and a weekly job that pulls the
newest one back, restores it, verifies it, and records the manifest as the
baseline for the next week. Both are inert until `BACKUP_S3_BUCKET` is set —
see §4.

---

## 3. Where backups should live

### Do this first: confirm the managed retention

Cheaper than anything else here and worth more:

- **Azure MySQL Flexible Server** — check backup retention on the server
  (Azure portal → the server → *Backup and restore*). The default is 7 days;
  it can go to 35. Enable geo-redundant backup if the tier allows it. Seven
  days is short for a bug that corrupts data quietly: the damage is often
  noticed after the only clean copy has aged out.
Atlas needs no equivalent check — see §1 for why nothing there is worth
retaining.

### Then: off-box copies

Managed backups are not sufficient on their own, for two reasons that have
nothing to do with the provider being unreliable:

1. **Retention is a wall.** Point-in-time restore cannot reach past it. A
   migration bug that corrupts a subset of rows is usually found later than
   that.
2. **The backups share an account with the thing they protect.** An Azure
   subscription that is suspended, closed or compromised takes the server and
   its automated backups together. A copy in a different cloud is the only
   thing that survives that.

**Recommendation: a dedicated S3 bucket, separate from the image bucket.**

| | |
|---|---|
| Bucket | new, e.g. `villkro-backups-prod` — **not** `villkro-images-prod` |
| Region | `ap-south-1`, same as the image bucket |
| Credentials | a new IAM user with `s3:PutObject` on this bucket and nothing else — no `DeleteObject`, no read on the image bucket |
| Versioning | on |
| Object Lock | governance mode, 30 days — an attacker with the deploy key still cannot destroy history |
| Lifecycle | Standard → Glacier Instant Retrieval at 30 days → expire at 365 |
| Encryption | SSE-S3 (`--sse AES256`), which the upload script sets |

Why S3 rather than Azure Blob, despite MySQL being on Azure: AWS credentials,
the SDK and an operational bucket are already in this stack, the box itself is
on AWS, and keeping the backups in a *different* cloud from the database is
the point, not an accident.

The key is deliberately not the one in `apps/api/.env.production`. That key
belongs to the running API for image uploads and can delete objects; a key
that can reach backups should not be sitting on the box the backups protect.
The deploy passes the backup credentials in for the length of the SSH session,
so they are never written to the box's disk.

Rejected: **GitHub Actions artifacts** — 90-day cap, no lifecycle control, and
the dump would have to pass through a runner. Fine for a manifest, not a DR
target.

**Cost.** A gzipped dump of this database is small — a synthetic copy with 500
orders and 1,001 order items compresses to 25 KB; the schema alone is 8.6 KB.
Even at several deploys a day with a production-sized dataset this is cents a
month, and the Glacier transition makes the tail effectively free. Cost is not
a reason to keep backups on the box.

### Setup

Create the bucket and IAM user as above, then add these repository secrets:

| Secret | Used by |
|---|---|
| `BACKUP_S3_BUCKET` | deploy upload + weekly verification |
| `BACKUP_S3_PREFIX` | optional, default `serveloco` |
| `BACKUP_S3_REGION` | optional, default `ap-south-1` |
| `BACKUP_AWS_ACCESS_KEY_ID` / `BACKUP_AWS_SECRET_ACCESS_KEY` | deploy upload — write-only key |
| `BACKUP_VERIFY_AWS_ACCESS_KEY_ID` / `BACKUP_VERIFY_AWS_SECRET_ACCESS_KEY` | weekly verification — read-only key, plus write on the manifest prefix |

Until `BACKUP_S3_BUCKET` exists, the upload logs a warning and the deploy
continues, and the weekly job does nothing. Nothing in the deploy path breaks
while this is unconfigured.

---

## 4. Restoring

### Verify a dump before you trust it

```bash
VERIFY_MYSQL_HOST=… VERIFY_MYSQL_USER=… VERIFY_MYSQL_PASSWORD=… \
  ./deploy/backup/verify-restore.sh ~/backups/serveloco_<ts>_<sha>.sql.gz
```

Against a scratch server, not production. On the box, the simplest scratch
server is a throwaway container:

```bash
docker run -d --name scratch-mysql -e MYSQL_ROOT_PASSWORD=scratch -p 3307:3306 mysql:8.0
VERIFY_MYSQL_PORT=3307 VERIFY_MYSQL_PASSWORD=scratch \
  ./deploy/backup/verify-restore.sh <dump>
docker rm -f scratch-mysql
```

### Restore MySQL

The deploy dumps a single database, so the file carries **no `CREATE
DATABASE`**. The target schema must exist first, with the right charset, or
the restore lands in latin1 and every name with a non-ASCII character is
silently mangled:

```sql
CREATE DATABASE serveloco_restored
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
# API down first — old code against a restored schema is the failure mode
# the deploy's migration gate exists to prevent.
docker compose -f docker-compose.prod.yml stop api

zcat ~/backups/serveloco_<ts>_<sha>.sql.gz \
  | docker run --rm -i --env-file ./apps/api/.env.production mysql:8.0 sh -c '
      export MYSQL_PWD="$MYSQL_PASSWORD"
      exec mysql -h "$MYSQL_HOST" -P "${MYSQL_PORT:-3306}" -u "$MYSQL_USER" \
        --ssl-mode=REQUIRED --default-character-set=utf8mb4 serveloco_restored'
```

Restore into a *new* schema and cut over by pointing `MYSQL_DATABASE` at it,
rather than overwriting `serveloco` in place. The overwrite has no undo, and
the rename is instant if the restore turns out to be wrong.

### Point-in-time instead

For anything the dumps are too coarse for — a bad `UPDATE` at a known minute —
use Azure's point-in-time restore rather than a dump. It restores to a **new
server**, which is the safe shape: the live server keeps serving while you
compare.

---

## 5. Still open

These need production or staging credentials and are not done:

- TASK 0.1–0.6 and 0.8–0.9 in `multi-area-tasks.md` — the migration rehearsal
  against a restored copy of production. The tooling here is what 0.1 asked
  for; running it against a real production dump has not happened.
- Azure MySQL retention and Atlas tier confirmed and raised (§3).
- The backup bucket, its IAM users and the repository secrets created (§3).
