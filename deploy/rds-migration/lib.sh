#!/usr/bin/env bash
# Shared settings and helpers for moving production MySQL from Azure to RDS.
# Sourced by the other scripts here, never run on its own. The plan they
# implement is plans/aws-rds-migration.md.
#
# On the Lightsail box everything lives outside the repo, so a deploy's
# `git reset --hard` can never touch it:
#   ~/rds-migration/            these scripts
#   ~/rds-migration/rds.env     RDS MYSQL_HOST / MYSQL_USER / MYSQL_PASSWORD (chmod 600)
#   ~/rds-migration/azure.env   the same lines for Azure, saved before the switch
#   ~/rds-migration/backups/    every dump taken during the move — keep them
set -euo pipefail
umask 077

MIG_DIR="${MIG_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
REPO_DIR="${REPO_DIR:-$HOME/ProjectServeLoco}"
ENV_PROD="${ENV_PROD:-$REPO_DIR/apps/api/.env.production}"
API_DIR="${API_DIR:-$REPO_DIR/apps/api}"
AZURE_ENV="$MIG_DIR/azure.env"
RDS_ENV="$MIG_DIR/rds.env"
ENV_BACKUP="$MIG_DIR/env.production.azure-backup"
BACKUP_DIR="$MIG_DIR/backups"
TMP_DIR="$MIG_DIR/tmp"
COMPOSE=(docker compose -f "$REPO_DIR/docker-compose.prod.yml")

# The same client image the deploy's backup step uses (deploy.yml), so every
# dump taken here is the same kind of file a deploy makes.
MYSQL_IMAGE="${MYSQL_IMAGE:-mysql:8.0}"
# The box has ~200 MB free with the whole stack up. Nothing started from here
# may take memory from the live API.
MEM_LIMIT="${MEM_LIMIT:-200m}"
# deploy.yml's floor: a real dump of this database is never smaller.
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-10240}"
# Azure's `serveloco` database default; the RDS copy is created with the same.
DB_COLLATION="utf8mb4_0900_ai_ci"

# The deploy's dump flags, plus:
#   --order-by-primary  rows in key order, so dumps of identical data are identical
#   --hex-blob          binary columns survive byte for byte
#   --set-gtid-purged=OFF --no-tablespaces   nothing RDS would refuse to replay
DUMP_FLAGS=(--single-transaction --quick --routines --triggers --events
  --default-character-set=utf8mb4 --order-by-primary --hex-blob
  --set-gtid-purged=OFF --no-tablespaces)

# MIG_TEST_MODE=1 rehearses these scripts on a laptop against two local
# mysqld processes — "azure" on 127.0.0.1:3307 and "rds" on 127.0.0.1:3308 —
# with the local mysql binaries and node in place of Docker. It only ever
# widens the host check to loopback, so it cannot aim anything at a real server.
TEST_MODE="${MIG_TEST_MODE:-0}"

mkdir -p "$BACKUP_DIR" "$TMP_DIR"
cleanup_tmp() { rm -rf "${TMP_DIR:?}"/*."$$"* 2>/dev/null || true; }
trap cleanup_tmp EXIT

die() { echo "ERROR: $*" >&2; exit 2; }
log() { echo "==> $*" >&2; }
now_utc() { date -u +%Y%m%dT%H%M%SZ; }

# Value of KEY in an env file (the last line for it wins, as with --env-file).
env_value() { awk -v k="$2" 'index($0, k "=") == 1 { v = substr($0, length(k) + 2) } END { print v }' "$1"; }
env_keys() { grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' "$1" | tr -d = || true; }

# assert_host azure|rds ENVFILE — the file's MYSQL_HOST really is that server.
# Every script goes through this before it touches a database, so a mixed-up
# env file stops the script instead of writing to the wrong place.
assert_host() {
  local host port
  host="$(env_value "$2" MYSQL_HOST)"
  port="$(env_value "$2" MYSQL_PORT)"
  if [ "$TEST_MODE" = 1 ]; then
    case "$1:$host:${port:-3306}" in
      azure:127.0.0.1:3307 | rds:127.0.0.1:3308) return 0 ;;
    esac
  else
    case "$1:$host" in
      azure:*.mysql.database.azure.com | rds:*.rds.amazonaws.com) return 0 ;;
    esac
  fi
  die "the '$1' settings point at '$host' — that is not the $1 server. Stopping."
}

# Which server .env.production (what the API runs with) points at right now.
prod_points_at() {
  if (assert_host rds "$ENV_PROD") 2>/dev/null; then echo rds
  elif (assert_host azure "$ENV_PROD") 2>/dev/null; then echo azure
  else echo unknown; fi
}

# Saves Azure's connection lines once, while .env.production still holds
# them, so "azure" keeps meaning Azure after the switch (Day +1 check, R3).
ensure_azure_env() {
  [ -f "$AZURE_ENV" ] && return 0
  [ "$(prod_points_at)" = azure ] \
    || die "$AZURE_ENV is missing and .env.production does not point at Azure — restore it from $ENV_BACKUP"
  grep -E '^MYSQL_(HOST|PORT|USER|PASSWORD)=' "$ENV_PROD" > "$AZURE_ENV"
  log "saved Azure's connection settings to $AZURE_ENV"
}

# target_env azure|rds — writes an env file aiming the MySQL client (or the
# API image) at one server and prints its path. Everything except the
# connection lines comes from .env.production, so the database name, SSL and
# time-zone settings are exactly the ones production runs with.
target_env() {
  local target="$1" src out keys
  case "$target" in
    azure) ensure_azure_env; src="$AZURE_ENV" ;;
    rds) [ -f "$RDS_ENV" ] || die "$RDS_ENV is missing (step B2)"; src="$RDS_ENV" ;;
    *) die "unknown target '$target' — use azure or rds" ;;
  esac
  [ -f "$ENV_PROD" ] || die "$ENV_PROD is missing"
  out="$TMP_DIR/$target.$$.env"
  keys="$(env_keys "$src" | paste -sd'|' -)"
  [ -n "$keys" ] || die "$src has no settings"
  { grep -Ev "^($keys)=" "$ENV_PROD" || true; cat "$src"; } > "$out"
  assert_host "$target" "$out"
  echo "$out"
}

# .env.production must use TLS with no CA file (mysqlSsl.js then encrypts
# without pinning Azure's certificate) and UTC sessions (mysql.js timezone).
check_prod_env() {
  local ssl ca tz
  ssl="$(env_value "$ENV_PROD" MYSQL_SSL | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  ca="$(env_value "$ENV_PROD" MYSQL_SSL_CA_PATH)"
  tz="$(env_value "$ENV_PROD" MYSQL_SESSION_TZ)"
  case "$ssl" in 1 | true | require | required) ;; *) die "MYSQL_SSL is '$ssl' in .env.production — expected true" ;; esac
  [ -z "$ca" ] || die "MYSQL_SSL_CA_PATH is '$ca' — that is Azure's CA and would break the RDS connection. Empty it first."
  case "$tz" in '' | Z) ;; *) die "MYSQL_SESSION_TZ is '$tz' — production must use Z (UTC)" ;; esac
}

api_running() {
  [ "$TEST_MODE" = 1 ] && return 1
  "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx api
}

api_image() {
  local tag
  tag="$(cat "$REPO_DIR/.deploy-tag" 2>/dev/null)" || die "no $REPO_DIR/.deploy-tag"
  echo "ghcr.io/serveloco/projectserveloco-api:$tag"
}

# Runs inside the client container (or a local shell in test mode). The
# password travels as MYSQL_PWD from the env file, never on a command line.
CLIENT_SH='prog="$1"; shift
export MYSQL_PWD="$MYSQL_PASSWORD"
if [ "$prog" = mysql ]; then set -- --connect-timeout=10 "$@"; fi
if [ "${USE_DB:-1}" = 1 ]; then set -- "$@" "$MYSQL_DATABASE"; fi
exec "$prog" -h "$MYSQL_HOST" -P "${MYSQL_PORT:-3306}" -u "$MYSQL_USER" --ssl-mode=REQUIRED "$@"'

# client TARGET mysql|mysqldump ARGS... — reads stdin only with STDIN=1;
# USE_DB=0 leaves the database name off (for DROP/CREATE DATABASE).
client() {
  local target="$1" envf use_db="${USE_DB:-1}" stdin="${STDIN:-0}"
  shift
  envf="$(target_env "$target")"
  if [ "$TEST_MODE" = 1 ]; then
    if [ "$stdin" = 1 ]; then
      (set -a; . "$envf"; set +a; USE_DB="$use_db" sh -c "$CLIENT_SH" sh "$@")
    else
      (set -a; . "$envf"; set +a; USE_DB="$use_db" sh -c "$CLIENT_SH" sh "$@") < /dev/null
    fi
  elif [ "$stdin" = 1 ]; then
    docker run --rm -i --memory "$MEM_LIMIT" --env-file "$envf" -e "USE_DB=$use_db" \
      "$MYSQL_IMAGE" sh -c "$CLIENT_SH" sh "$@"
  else
    docker run --rm --memory "$MEM_LIMIT" --env-file "$envf" -e "USE_DB=$use_db" \
      "$MYSQL_IMAGE" sh -c "$CLIENT_SH" sh "$@" < /dev/null
  fi
}

# q TARGET SQL — result rows as tab-separated text, no header.
q() { client "$1" mysql -N -B -e "$2"; }

# The server settings the app's behaviour depends on (see the plan, §1).
SETTINGS_SQL="SELECT 'version', VERSION()
UNION ALL SELECT 'lower_case_table_names', @@lower_case_table_names
UNION ALL SELECT 'server_offset_from_utc', TIMEDIFF(NOW(), UTC_TIMESTAMP())
UNION ALL SELECT 'sql_mode', @@sql_mode
UNION ALL SELECT 'character_set_server', @@character_set_server
UNION ALL SELECT 'collation_server', @@collation_server
UNION ALL SELECT 'database_collation', (SELECT DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE())
UNION ALL SELECT 'require_secure_transport', @@require_secure_transport
UNION ALL SELECT 'transaction_isolation', @@transaction_isolation
UNION ALL SELECT 'innodb_ft_min_token_size', @@innodb_ft_min_token_size
UNION ALL SELECT 'binlog_format', @@binlog_format
UNION ALL SELECT 'event_scheduler', @@event_scheduler
UNION ALL SELECT 'max_connections', @@max_connections
UNION ALL SELECT 'tables', (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE')"
MUST_MATCH=" lower_case_table_names server_offset_from_utc sql_mode character_set_server collation_server database_collation require_secure_transport transaction_isolation innodb_ft_min_token_size binlog_format event_scheduler "

# Prints the settings side by side; returns 1 if any must-match one differs.
settings_table() {
  local a b key av bv mark bad=0
  a="$(q azure "$SETTINGS_SQL")"
  b="$(q rds "$SETTINGS_SQL")"
  while IFS=$'\t' read -r key av; do
    bv="$(printf '%s\n' "$b" | awk -F'\t' -v k="$key" '$1 == k { print $2 }')"
    mark="(info)"
    if [[ "$MUST_MATCH" == *" $key "* ]]; then
      if [ "$av" = "$bv" ]; then mark="ok"; else mark="DIFFERENT"; bad=1; fi
    fi
    printf '  %-26s azure: %-12s rds: %-12s %s\n' "$key" "$av" "$bv" "$mark"
  done <<< "$a"
  return "$bad"
}

# Exact COUNT(*) of every table, "name<TAB>rows", sorted by name. Real counts,
# never information_schema.TABLE_ROWS, which is an estimate (same rule as
# deploy/backup/verify-restore.sh).
counts_of() {
  local tables sql="" name
  tables="$(q "$1" "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME")"
  [ -n "$tables" ] || return 0
  while read -r name; do
    sql="${sql:+$sql UNION ALL }SELECT '$name', COUNT(*) FROM \`$name\`"
  done <<< "$tables"
  q "$1" "$sql" | LC_ALL=C sort
}

# Orphaned rows per foreign key, "fk<TAB>orphans" — the check from
# deploy/backup/verify-restore.sh that catches a restore missing parent rows.
fk_orphans() {
  local gen
  gen="$(q "$1" "SELECT CONCAT('SELECT ''', k.TABLE_NAME, '.', k.COLUMN_NAME, ' -> ', k.REFERENCED_TABLE_NAME, '.', k.REFERENCED_COLUMN_NAME, ''', COUNT(*) FROM \`', k.TABLE_NAME, '\` c LEFT JOIN \`', k.REFERENCED_TABLE_NAME, '\` p ON c.\`', k.COLUMN_NAME, '\` = p.\`', k.REFERENCED_COLUMN_NAME, '\` WHERE c.\`', k.COLUMN_NAME, '\` IS NOT NULL AND p.\`', k.REFERENCED_COLUMN_NAME, '\` IS NULL;') FROM information_schema.KEY_COLUMN_USAGE k WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL")"
  [ -n "$gen" ] || return 0
  printf '%s\n' "$gen" | STDIN=1 client "$1" mysql -N -B
}

# A dump file is only a backup if it is whole: gzip intact, not tiny, and
# ending with the line mysqldump writes only after a clean finish.
check_dump() {
  gzip -t "$1" || die "$1: gzip check failed"
  [ "$(stat -c%s "$1")" -ge "$MIN_DUMP_BYTES" ] || die "$1: under $MIN_DUMP_BYTES bytes — mysqldump died early"
  gunzip -c "$1" | tail -n 3 | grep -q -- '-- Dump completed' || die "$1: no 'Dump completed' line — the dump was cut off"
}

# dump_db TARGET OUT.sql.gz — a consistent snapshot. Only ever reads TARGET.
dump_db() {
  local out="$2"
  if ! client "$1" mysqldump "${DUMP_FLAGS[@]}" | gzip > "$out.part"; then
    rm -f "$out.part"
    die "mysqldump of $1 failed"
  fi
  check_dump "$out.part"
  mv "$out.part" "$out"
  (cd "$(dirname "$out")" && sha256sum "$(basename "$out")" > "$(basename "$out").sha256")
}

# The dump without its comment lines (host, server version, date), which
# differ between two servers that hold identical data.
normalized() { gunzip -c "$1" | grep -v '^-- '; }
fingerprint() { normalized "$1" | sha256sum | cut -c1-64; }

# "table<TAB>sha256" for each table's part of a dump (its schema and rows),
# so a mismatch can name the tables that differ.
table_hashes() {
  local dir="$TMP_DIR/tables-$(basename "$1").$$"
  rm -rf "$dir" && mkdir -p "$dir"
  normalized "$1" | awk -v dir="$dir" '
    /^(DROP TABLE IF EXISTS|CREATE TABLE|INSERT INTO|LOCK TABLES) `/ {
      match($0, /`[^`]+`/); t = substr($0, RSTART + 1, RLENGTH - 2)
    }
    t != "" { print > (dir "/" t) }'
  (cd "$dir" && for f in *; do [ -e "$f" ] && printf '%s\t%s\n' "$f" "$(sha256sum < "$f" | cut -c1-64)"; done) | LC_ALL=C sort
}

# recreate_and_load TARGET DUMP — empties TARGET's app database (same name
# and collation as Azure's), then loads DUMP into it.
recreate_and_load() {
  local target="$1" dump="$2" envf db
  envf="$(target_env "$target")"
  db="$(env_value "$envf" MYSQL_DATABASE)"
  [[ "$db" =~ ^[a-z0-9_]+$ ]] || die "unexpected database name '$db'"
  log "emptying the $target database '$db' ($DB_COLLATION)"
  USE_DB=0 q "$target" "DROP DATABASE IF EXISTS \`$db\`; CREATE DATABASE \`$db\` CHARACTER SET utf8mb4 COLLATE $DB_COLLATION;"
  log "loading $(basename "$dump") into $target"
  gunzip -c "$dump" | STDIN=1 client "$target" mysql
}
