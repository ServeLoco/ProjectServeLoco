#!/usr/bin/env bash
#
# Restore a mysqldump into a scratch schema and prove it is actually a backup.
#
#   ./verify-restore.sh <dump.sql.gz> [--compare-to prev.json] [--manifest-out out.json]
#
# A dump that gunzips is not a backup. A dump that restores is not a backup
# either: mysqldump writes FOREIGN_KEY_CHECKS=0, so a file truncated halfway
# through replays without a single error and leaves dangling references behind.
# This restores the file and then checks what the restore cannot check for
# itself — every table present, every foreign key satisfied, every table's row
# count in line with the last verified backup.
#
# Connection to the scratch server comes from the environment so the same
# script runs against a MySQL service container in CI and a throwaway
# `docker run mysql:8.0` on a box:
#
#   VERIFY_MYSQL_HOST (default 127.0.0.1)
#   VERIFY_MYSQL_PORT (default 3306)
#   VERIFY_MYSQL_USER (default root)
#   VERIFY_MYSQL_PASSWORD
#
# Exit codes: 0 verified · 1 usage/connection error · 2 the backup failed a check.
set -euo pipefail

FAIL_EXIT=2

# Tables whose loss would not be noticed until someone needed them. The dump
# restoring is meaningless if any of these is missing or empty.
# Overridable (space-separated) so the round-trip self-test can run against a
# freshly migrated CI database, which has the seeded tables but no orders yet.
read -r -a REQUIRED_TABLES <<< "${VERIFY_REQUIRED_TABLES:-areas admins users products categories orders order_items settings store_modes}"
read -r -a NONEMPTY_TABLES <<< "${VERIFY_NONEMPTY_TABLES:-areas users products categories orders order_items settings store_modes}"

# A table that shrinks more than this against the last verified backup is
# treated as data loss rather than as normal churn. Deletes do happen
# (cancelled carts, pruned notifications), so this is a band, not equality.
DRIFT_PCT="${VERIFY_DRIFT_PCT:-10}"

# A gzipped dump of a real schema is never this small; a few hundred bytes
# means mysqldump died before it wrote anything but the header.
MIN_DUMP_BYTES="${VERIFY_MIN_DUMP_BYTES:-10240}"

die()  { echo "::error::$*" >&2; exit "$FAIL_EXIT"; }
usage(){ echo "usage: $0 <dump.sql.gz> [--compare-to prev.json] [--manifest-out out.json]" >&2; exit 1; }

DUMP=""; COMPARE_TO=""; MANIFEST_OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --compare-to)   COMPARE_TO="${2:-}"; shift 2 ;;
    --manifest-out) MANIFEST_OUT="${2:-}"; shift 2 ;;
    -h|--help)      usage ;;
    -*)             echo "unknown option: $1" >&2; usage ;;
    *)              [ -n "$DUMP" ] && usage; DUMP="$1"; shift ;;
  esac
done
[ -n "$DUMP" ] || usage
[ -f "$DUMP" ] || die "no such dump: $DUMP"

HOST="${VERIFY_MYSQL_HOST:-127.0.0.1}"
PORT="${VERIFY_MYSQL_PORT:-3306}"
USER="${VERIFY_MYSQL_USER:-root}"
export MYSQL_PWD="${VERIFY_MYSQL_PASSWORD:-}"

# Scratch schema name carries the PID so two verifications can share a server.
SCRATCH="verify_restore_$$"

# --connect-timeout bounds every call, including the one the EXIT trap makes:
# without it an unreachable host turns a failed verification into a job that
# hangs until the CI timeout kills it.
mysql_do() {
  mysql -h "$HOST" -P "$PORT" -u "$USER" --default-character-set=utf8mb4 \
    --connect-timeout="${VERIFY_CONNECT_TIMEOUT:-10}" "$@"
}
# -N -B gives tab-separated rows with no header and no box drawing, which is
# the only output shape worth parsing.
scratch_q() { mysql_do -N -B "$SCRATCH" -e "$1"; }

cleanup() { mysql_do -e "DROP DATABASE IF EXISTS \`$SCRATCH\`" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> dump: $DUMP"

# ── 1. The file itself ───────────────────────────────────────────────────────
gzip -t "$DUMP" || die "gzip integrity check failed — the dump is corrupt"

BYTES="$(stat -c%s "$DUMP")"
[ "$BYTES" -ge "$MIN_DUMP_BYTES" ] \
  || die "dump is only $BYTES bytes (floor $MIN_DUMP_BYTES) — mysqldump died early"

# mysqldump writes this as its last line only after a clean finish. Without it
# the file is a prefix of a backup, and a prefix restores without complaint.
zcat "$DUMP" | tail -5 | grep -q 'Dump completed on' \
  || die "no 'Dump completed on' trailer — the dump was truncated"

echo "    $BYTES bytes, gzip OK, trailer present"

# ── 2. Restore into a scratch schema ─────────────────────────────────────────
mysql_do -e "SELECT 1" >/dev/null 2>&1 || { echo "cannot reach MySQL at $HOST:$PORT as $USER" >&2; exit 1; }

# The deploy dumps a single database, so the file carries no CREATE DATABASE.
# The charset has to be set here or the restore silently lands in latin1.
mysql_do -e "DROP DATABASE IF EXISTS \`$SCRATCH\`;
             CREATE DATABASE \`$SCRATCH\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "==> restoring into $SCRATCH"
RESTORE_LOG="$(mktemp)"
if ! zcat "$DUMP" | mysql_do "$SCRATCH" 2>"$RESTORE_LOG"; then
  sed 's/^/    /' "$RESTORE_LOG" >&2
  rm -f "$RESTORE_LOG"
  die "restore failed"
fi
# Warnings are not fatal on their own, but they are how a charset or sql_mode
# mismatch announces itself, so they go in the log rather than to /dev/null.
grep -v 'Using a password' "$RESTORE_LOG" | grep -q . \
  && { echo "    restore warnings:"; grep -v 'Using a password' "$RESTORE_LOG" | sed 's/^/      /'; }
rm -f "$RESTORE_LOG"

# ── 3. Schema shape ──────────────────────────────────────────────────────────
TABLE_COUNT="$(scratch_q "SELECT COUNT(*) FROM information_schema.TABLES
                          WHERE TABLE_SCHEMA='$SCRATCH' AND TABLE_TYPE='BASE TABLE'")"
[ "$TABLE_COUNT" -gt 0 ] || die "restored schema has no tables"
echo "==> restored $TABLE_COUNT tables"

for t in "${REQUIRED_TABLES[@]}"; do
  present="$(scratch_q "SELECT COUNT(*) FROM information_schema.TABLES
                        WHERE TABLE_SCHEMA='$SCRATCH' AND TABLE_NAME='$t'")"
  [ "$present" = "1" ] || die "required table '$t' is missing from the backup"
done

for t in "${NONEMPTY_TABLES[@]}"; do
  n="$(scratch_q "SELECT COUNT(*) FROM \`$t\`")"
  [ "$n" -gt 0 ] || die "table '$t' restored empty — a backup of production is never empty here"
done
echo "    required tables present and non-empty"

# ── 4. Referential integrity ─────────────────────────────────────────────────
# The one check the restore cannot do for itself. Every FK in the restored
# schema is re-tested against the restored rows; a dump cut mid-file passes
# everything above this line and fails here.
FK_SQL="$(scratch_q "
  SELECT CONCAT(
    'SELECT ''', k.TABLE_NAME, '.', k.COLUMN_NAME, ' -> ',
    k.REFERENCED_TABLE_NAME, '.', k.REFERENCED_COLUMN_NAME, ''' AS fk, COUNT(*) AS orphans FROM \`',
    k.TABLE_NAME, '\` c LEFT JOIN \`', k.REFERENCED_TABLE_NAME, '\` p ON c.\`', k.COLUMN_NAME,
    '\` = p.\`', k.REFERENCED_COLUMN_NAME, '\` WHERE c.\`', k.COLUMN_NAME,
    '\` IS NOT NULL AND p.\`', k.REFERENCED_COLUMN_NAME, '\` IS NULL;')
  FROM information_schema.KEY_COLUMN_USAGE k
  WHERE k.TABLE_SCHEMA='$SCRATCH' AND k.REFERENCED_TABLE_NAME IS NOT NULL;")"

FK_TOTAL=0; FK_BAD=0
if [ -n "$FK_SQL" ]; then
  while IFS=$'\t' read -r fk orphans; do
    [ -n "${fk:-}" ] || continue
    FK_TOTAL=$((FK_TOTAL + 1))
    if [ "$orphans" != "0" ]; then
      echo "::error::$orphans orphaned rows on $fk" >&2
      FK_BAD=$((FK_BAD + 1))
    fi
  done < <(printf '%s\n' "$FK_SQL" | mysql_do -N -B "$SCRATCH")
fi
[ "$FK_BAD" -eq 0 ] || die "$FK_BAD of $FK_TOTAL foreign keys have orphaned rows in the restored data"
echo "==> $FK_TOTAL foreign keys satisfied, 0 orphans"

# ── 5. InnoDB-level check ────────────────────────────────────────────────────
# The table list is assembled here rather than with GROUP_CONCAT: that function
# silently truncates at group_concat_max_len (1024 bytes by default), which is
# roughly 40 table names — a verifier that quietly stops checking two thirds of
# the schema is worse than no verifier.
mapfile -t ALL_TABLES < <(scratch_q "SELECT TABLE_NAME FROM information_schema.TABLES
                                     WHERE TABLE_SCHEMA='$SCRATCH' AND TABLE_TYPE='BASE TABLE'
                                     ORDER BY TABLE_NAME")
[ "${#ALL_TABLES[@]}" -eq "$TABLE_COUNT" ] \
  || die "listed ${#ALL_TABLES[@]} tables but information_schema counts $TABLE_COUNT"

CHECK_LIST=""
for t in "${ALL_TABLES[@]}"; do
  CHECK_LIST="${CHECK_LIST:+$CHECK_LIST, }\`$t\`"
done
CHECK_OUT="$(scratch_q "CHECK TABLE $CHECK_LIST QUICK;" | awk -F'\t' '$3=="status" && $4!="OK"')"
[ -z "$CHECK_OUT" ] || { echo "$CHECK_OUT" >&2; die "CHECK TABLE reported a problem"; }
echo "==> CHECK TABLE clean"

# ── 6. Row-count manifest ────────────────────────────────────────────────────
# Real COUNT(*), not information_schema.TABLE_ROWS — that column is an InnoDB
# estimate and can be off by half, which is exactly the size of the error this
# is meant to catch.
COUNT_SQL=""
for t in "${ALL_TABLES[@]}"; do
  COUNT_SQL="${COUNT_SQL:+$COUNT_SQL UNION ALL }SELECT '$t' AS t, COUNT(*) AS n FROM \`$t\`"
done
COUNTS="$(scratch_q "$COUNT_SQL ORDER BY t;")"
COUNTED="$(printf '%s\n' "$COUNTS" | grep -c .)"
[ "$COUNTED" -eq "$TABLE_COUNT" ] \
  || die "counted $COUNTED tables but the schema has $TABLE_COUNT"

ORDERS_BYTES="$(scratch_q "SELECT COALESCE(DATA_LENGTH + INDEX_LENGTH, 0)
                           FROM information_schema.TABLES
                           WHERE TABLE_SCHEMA='$SCRATCH' AND TABLE_NAME='orders';")"

MANIFEST="${MANIFEST_OUT:-${DUMP%.sql.gz}.manifest.json}"
{
  printf '{\n'
  printf '  "dump": "%s",\n' "$(basename "$DUMP")"
  printf '  "dump_bytes": %s,\n' "$BYTES"
  printf '  "verified_at": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '  "table_count": %s,\n' "$TABLE_COUNT"
  printf '  "foreign_keys_checked": %s,\n' "$FK_TOTAL"
  printf '  "orders_bytes": %s,\n' "$ORDERS_BYTES"
  printf '  "row_counts": {\n'
  printf '%s\n' "$COUNTS" | awk -F'\t' 'NF==2 {
      if (NR > 1) printf ",\n"; printf "    \"%s\": %s", $1, $2
    } END { printf "\n" }'
  printf '  }\n}\n'
} > "$MANIFEST"
echo "==> manifest: $MANIFEST"

# ── 7. Drift against the last verified backup ────────────────────────────────
if [ -n "$COMPARE_TO" ]; then
  [ -f "$COMPARE_TO" ] || die "--compare-to file not found: $COMPARE_TO"
  command -v python3 >/dev/null 2>&1 || die "--compare-to needs python3 to read the manifests"
  # shellcheck disable=SC2016  # the manifests are read by python, not the shell
  DRIFT="$(DRIFT_PCT="$DRIFT_PCT" python3 -c '
import json, os, sys
prev = json.load(open(sys.argv[1]))["row_counts"]
now  = json.load(open(sys.argv[2]))["row_counts"]
pct  = float(os.environ["DRIFT_PCT"])
bad  = []
for t, was in prev.items():
    if t not in now:
        bad.append(f"{t}: table present in the previous backup, missing from this one")
        continue
    # Growth is never the alarm; only a drop past the band is.
    if was > 0 and now[t] < was * (1 - pct / 100):
        bad.append(f"{t}: {was} -> {now[t]} rows ({100 * (was - now[t]) / was:.1f}% drop)")
if bad:
    print("\n".join(bad))
    sys.exit(1)
' "$COMPARE_TO" "$MANIFEST" 2>&1)" || {
    printf '%s\n' "$DRIFT" | while IFS= read -r line; do echo "    $line"; done >&2
    die "row counts dropped more than ${DRIFT_PCT}% against $(basename "$COMPARE_TO")"
  }
  echo "==> no row-count drift beyond ${DRIFT_PCT}% vs $(basename "$COMPARE_TO")"
fi

echo "==> VERIFIED: $(basename "$DUMP") restores to a complete, referentially intact database"
