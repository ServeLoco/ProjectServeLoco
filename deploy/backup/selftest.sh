#!/usr/bin/env bash
#
# Round-trip test for verify-restore.sh, against a real MySQL.
#
#   ./selftest.sh <database>
#
# The verifier is the only thing standing between "a file exists in
# $HOME/backups" and "there is a backup", so it needs a test of its own: a
# check that silently stopped checking would look exactly like a passing
# build. This dumps a live database, confirms the dump verifies, then breaks
# the dump in each way a real backup breaks and confirms each one is caught.
#
# Connection comes from the same VERIFY_MYSQL_* variables verify-restore.sh
# uses, so CI configures one thing.
set -euo pipefail

DB="${1:-}"
[ -n "$DB" ] || { echo "usage: $0 <database>" >&2; exit 1; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFY="$HERE/verify-restore.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

HOST="${VERIFY_MYSQL_HOST:-127.0.0.1}"
PORT="${VERIFY_MYSQL_PORT:-3306}"
USER="${VERIFY_MYSQL_USER:-root}"
export MYSQL_PWD="${VERIFY_MYSQL_PASSWORD:-}"

CONNECT_TIMEOUT="${VERIFY_CONNECT_TIMEOUT:-10}"
my()   { mysql -h "$HOST" -P "$PORT" -u "$USER" --default-character-set=utf8mb4 \
           --connect-timeout="$CONNECT_TIMEOUT" "$@"; }
# No --connect-timeout here: mysqldump does not accept it.
dump() { mysqldump -h "$HOST" -P "$PORT" -u "$USER" --single-transaction --quick \
           --routines --triggers --events --default-character-set=utf8mb4 "$1" | gzip > "$2"; }

FAILURES=0
# expect <wanted-exit> <wanted-message-substring|-> <label> -- <verify args...>
# The message matters as much as the exit code: every rejection exits 2, so a
# check that fired for the wrong reason would otherwise pass this test.
expect() {
  local want="$1" msg="$2" label="$3"; shift 4
  local got=0
  "$VERIFY" "$@" > "$WORK/log" 2>&1 || got=$?
  if [ "$got" != "$want" ]; then
    echo "  FAIL $label — expected exit $want, got $got"
    sed 's/^/       /' "$WORK/log"
    FAILURES=$((FAILURES + 1))
    return
  fi
  if [ "$msg" != "-" ] && ! grep -qF "$msg" "$WORK/log"; then
    echo "  FAIL $label — exit $want as expected, but not for the expected reason (\"$msg\")"
    sed 's/^/       /' "$WORK/log"
    FAILURES=$((FAILURES + 1))
    return
  fi
  echo "  ok   $label"
}

echo "== round-trip against $DB"
dump "$DB" "$WORK/good.sql.gz"
expect 0 "VERIFIED" "a good dump verifies" -- "$WORK/good.sql.gz" --manifest-out "$WORK/good.json"

# 1. mysqldump died partway through: valid gzip, no trailer.
RAW="$(zcat "$WORK/good.sql.gz" | wc -c)"
# head closes the pipe early, so zcat takes a SIGPIPE that pipefail would
# otherwise turn into a failed test run.
{ zcat "$WORK/good.sql.gz" || true; } | head -c $((RAW * 60 / 100)) | gzip > "$WORK/truncated.sql.gz"
expect 2 "the dump was truncated" "a truncated dump is rejected" -- "$WORK/truncated.sql.gz"

# 2. A dump that restores without a single error but has lost rows from a
#    parent table. This is the case the restore itself cannot catch, because
#    mysqldump disables foreign key checks while it replays.
my -e "DROP DATABASE IF EXISTS ${DB}_selftest_orphan;
       CREATE DATABASE ${DB}_selftest_orphan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
zcat "$WORK/good.sql.gz" | my "${DB}_selftest_orphan"
my "${DB}_selftest_orphan" -e "SET FOREIGN_KEY_CHECKS=0;
                               DELETE FROM categories ORDER BY id DESC LIMIT 1;"
dump "${DB}_selftest_orphan" "$WORK/orphan.sql.gz"
expect 2 "orphaned rows" "orphaned rows are rejected" -- "$WORK/orphan.sql.gz"
my -e "DROP DATABASE ${DB}_selftest_orphan;"

# 3. A complete, consistent, referentially intact dump of far too little data.
my -e "DROP DATABASE IF EXISTS ${DB}_selftest_drift;
       CREATE DATABASE ${DB}_selftest_drift CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
zcat "$WORK/good.sql.gz" | my "${DB}_selftest_drift"
# Some, not all: deleting the table outright would trip the non-empty check
# first and this test would pass without ever exercising the drift comparison.
my "${DB}_selftest_drift" -e "DELETE FROM products ORDER BY id DESC LIMIT 4;"
dump "${DB}_selftest_drift" "$WORK/drift.sql.gz"
expect 2 "row counts dropped" "a sudden row-count drop is rejected" -- "$WORK/drift.sql.gz" --compare-to "$WORK/good.json"
my -e "DROP DATABASE ${DB}_selftest_drift;"

if [ "$FAILURES" -gt 0 ]; then
  echo "::error::$FAILURES of 4 backup self-tests failed"
  exit 2
fi
echo "== all 4 backup self-tests passed"
