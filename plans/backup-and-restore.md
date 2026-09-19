# Backups and restore

Covers what the deploy actually backs up, what it does not, how to restore,
and where the backups should live. Companion to
[`multi-area-tasks.md`](./multi-area-tasks.md) TASK 0 (Phase 0 safety gate).

---

## 1. What exists today

Both databases are managed, and this matters for everything below:

| | Service | Backed up by the provider | Backed up by us |
|---|---|---|---|
| Relational (orders, products, users) | Azure Database for MySQL, Flexible Server, `centralindia` | automated backups + point-in-time restore, within the configured retention | `mysqldump` before every migration |
| Image metadata (`images`) | MongoDB Atlas | depends on the cluster tier | nothing, until this change |

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
2. **Mongo was not backed up at all.** Every product photo in S3 is addressed
   through a row in the Atlas `images` collection. Lose the collection and the
   bucket is a pile of unreferenced keys.
3. **The dumps sat on the disk they protect.** `$HOME/backups` is on the same
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

### `deploy/backup/dump-mongo.sh`

`mongodump --archive --gzip` of the Atlas database, alongside the MySQL dump.

Deliberately **not** a deploy gate. The deploy is gated on what the deploy can
destroy, and `migrate.js` touches MySQL only; failing a release over the
image-metadata dump would trade an outage for a backup this deploy cannot
harm. A failure warns, and the weekly verification is what notices if they
stop arriving.

> `mongodump` was split out of the MongoDB server package in 4.4. The script
> probes the image for it before dumping and names the fix
> (`MONGO_TOOLS_IMAGE`) rather than producing a half-written archive. Confirm
> on the first deploy that `mongo:7.0` on the box carries the database tools.

### `deploy/backup/offbox-upload.sh` and `backup-verify.yml`

Copy both dumps to S3 after they are taken, and a weekly job that pulls the
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
- **MongoDB Atlas** — check the cluster tier. Shared tiers (M0/M2/M5) have no
  continuous cloud backup; the `mongodump` this change adds may be the only
  copy of `images` that exists.

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

### Restore Mongo

```bash
docker run --rm -i --env-file ./apps/api/.env.production mongo:7.0 sh -c '
  exec mongorestore --uri="$MONGODB_URI" --archive --gzip \
    --nsFrom="$MONGODB_DATABASE.*" --nsTo="${MONGODB_DATABASE}_restored.*"
' < ~/backups/serveloco_<ts>_<sha>.mongo.gz
```

Same reasoning: restore beside the live database, then switch
`MONGODB_DATABASE`.

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
- First deploy after this change: confirm `mongo:7.0` on the box carries
  `mongodump`, and that the Mongo archive is a sane size.
