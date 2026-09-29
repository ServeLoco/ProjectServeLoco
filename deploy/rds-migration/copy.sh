#!/usr/bin/env bash
# Copy the app database Azure -> RDS (steps C1 and D4), or back (rollback R3).
#
#   ./copy.sh --dump FILE   load an existing dump into RDS (C1: the S3 backup)
#   ./copy.sh               dump Azure now, then load it into RDS (D4: API stopped)
#   ./copy.sh --reverse     RDS -> Azure. Rollback R3 only; asks you to confirm
#
# The target database is emptied and re-created first, so running this twice
# is safe. Azure is only ever read, unless --reverse is given. It refuses to
# overwrite RDS once production runs on it.
source "$(dirname "$0")/lib.sh"

mode=forward
dump=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dump) dump="${2:?--dump needs a file}"; shift 2 ;;
    --reverse) mode=reverse; shift ;;
    *) die "usage: $0 [--dump FILE | --reverse]" ;;
  esac
done

start=$SECONDS
if [ "$mode" = forward ]; then
  src=azure dst=rds
  [ "$(prod_points_at)" = azure ] \
    || die "production already runs on RDS — copying Azure over it would destroy newer data"
else
  src=rds dst=azure
  [ -z "$dump" ] || die "--dump can't be combined with --reverse"
  [ "$(prod_points_at)" = rds ] || die "--reverse is for rolling back from RDS, but production is not on RDS"
  ! api_running || die "stop the API first: ${COMPOSE[*]} stop api"
  echo "This REPLACES the Azure database with the RDS one (rollback R3)."
  read -rp "Type REPLACE AZURE to continue: " answer
  [ "$answer" = "REPLACE AZURE" ] || die "not confirmed — nothing changed"
  log "safety dump of Azure before it is replaced"
  dump_db azure "$BACKUP_DIR/azure_before_reverse_$(now_utc).sql.gz"
fi

if [ -z "$dump" ]; then
  dump="$BACKUP_DIR/copy_${src}_$(now_utc).sql.gz"
  log "dumping $src (read-only) -> $dump"
  dump_db "$src" "$dump"
  next="./compare.sh --live"
else
  [ -f "$dump" ] || die "no such file: $dump"
  check_dump "$dump"
  next="./compare.sh --dump $dump"
fi

recreate_and_load "$dst" "$dump"
log "copy done in $((SECONDS - start))s. Next: $next"
