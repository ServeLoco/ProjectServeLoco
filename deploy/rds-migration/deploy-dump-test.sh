#!/usr/bin/env bash
# Step C7: run deploy.yml's backup command exactly as written, against RDS,
# as the app user. If this passes, the first deploy after the move will not
# stop at its backup step.
source "$(dirname "$0")/lib.sh"

# Copied from .github/workflows/deploy.yml ("Back up MySQL before anything
# can touch the schema"). Keep the two in step.
DEPLOY_DUMP_SH='
  export MYSQL_PWD="$MYSQL_PASSWORD"
  exec mysqldump -h "$MYSQL_HOST" -P "${MYSQL_PORT:-3306}" -u "$MYSQL_USER" \
    --ssl-mode=REQUIRED --single-transaction --quick \
    --routines --triggers --events --default-character-set=utf8mb4 \
    "$MYSQL_DATABASE"
'
envf="$(target_env rds)"
out="$TMP_DIR/deploy-dump.$$.sql.gz"
if [ "$TEST_MODE" = 1 ]; then
  (set -a; . "$envf"; set +a; sh -c "$DEPLOY_DUMP_SH") < /dev/null | gzip > "$out"
else
  docker run --rm --env-file "$envf" mysql:8.0 sh -c "$DEPLOY_DUMP_SH" < /dev/null | gzip > "$out"
fi
gzip -t "$out"
bytes="$(stat -c%s "$out")"
[ "$bytes" -ge "$MIN_DUMP_BYTES" ] || die "the deploy's dump is only $bytes bytes — a deploy would stop here"
gunzip -c "$out" | tail -n 1 | grep -q 'Dump completed on' || die "the deploy's dump has no 'Dump completed on' line"
log "OK — the deploy's backup step works on RDS ($bytes bytes)"
