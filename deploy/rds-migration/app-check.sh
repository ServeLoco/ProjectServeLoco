#!/usr/bin/env bash
# Steps C3 / D6: does the app read the same things from RDS as from Azure?
# Runs app-check.js inside the deployed API image — the app's own pool, TLS,
# time zone, search and report code — once per server, and diffs the results.
#
#   ./app-check.sh              both servers, diffed. Exit 0 when identical.
#   ./app-check.sh --rds-extra  RDS only: also the write test (C4) and the
#                               30-connection pool test (C5)
source "$(dirname "$0")/lib.sh"

extra=0
case "${1:-}" in
  '') ;;
  --rds-extra) extra=1 ;;
  *) die "usage: $0 [--rds-extra]" ;;
esac

# Reads are bounded to the rows RDS has, so newer rows on a still-live Azure
# (practice run) don't count as differences.
bounds="$(q rds "SELECT CONCAT_WS(',',
  CONCAT('orders=', (SELECT IFNULL(MAX(id), 0) FROM orders)),
  CONCAT('products=', (SELECT IFNULL(MAX(id), 0) FROM products)),
  CONCAT('users=', (SELECT IFNULL(MAX(id), 0) FROM users)),
  CONCAT('shops=', (SELECT IFNULL(MAX(id), 0) FROM shops)),
  CONCAT('areas=', (SELECT IFNULL(MAX(id), 0) FROM areas)),
  CONCAT('categories=', (SELECT IFNULL(MAX(id), 0) FROM categories)),
  CONCAT('coupons=', (SELECT IFNULL(MAX(id), 0) FROM coupons)))")"
log "bounds from RDS: $bounds"

run_app_check() { # TARGET ARGS...
  local target="$1" envf
  shift
  envf="$(target_env "$target")"
  if [ "$TEST_MODE" = 1 ]; then
    (set -a; . "$envf"; set +a; cd "$API_DIR" && node "$MIG_DIR/app-check.js" "$@") < /dev/null
  else
    docker run --rm --memory "$MEM_LIMIT" --env-file "$envf" \
      -v "$MIG_DIR/app-check.js:/usr/src/app/app-check.js:ro" \
      "$(api_image)" node app-check.js "$@" < /dev/null
  fi
}
block() { sed -n "/^$1_BEGIN\$/,/^$1_END\$/p" "$2" | sed '1d;$d'; }

stamp="$(now_utc)"
if [ "$extra" = 1 ]; then
  out="$BACKUP_DIR/app-check_rds-extra_$stamp.txt"
  run_app_check rds --max-ids "$bounds" --write --pool > "$out"
  block TARGET "$out"
  block INFO "$out"
  log "saved: $out"
  exit 0
fi

for t in azure rds; do
  log "running on $t"
  run_app_check "$t" --max-ids "$bounds" > "$BACKUP_DIR/app-check_${t}_$stamp.txt"
  block TARGET "$BACKUP_DIR/app-check_${t}_$stamp.txt" | sed 's/^/  /'
  echo "  round trip: $(block INFO "$BACKUP_DIR/app-check_${t}_$stamp.txt" | tr -d '\n ' | grep -o '"round_trip_ms":{[^}]*}')"
done

log "differences in what the app reads (Azure -> RDS):"
if diff -u --label azure --label rds \
     <(block SAME "$BACKUP_DIR/app-check_azure_$stamp.txt") \
     <(block SAME "$BACKUP_DIR/app-check_rds_$stamp.txt"); then
  log "RESULT: IDENTICAL — the app reads the same data the same way from both"
else
  log "RESULT: DIFFERENT — see above (full output in $BACKUP_DIR/app-check_*_$stamp.txt)"
  exit 2
fi
