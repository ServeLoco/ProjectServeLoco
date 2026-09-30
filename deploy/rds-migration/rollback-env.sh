#!/usr/bin/env bash
# Rollback R1 / R2: put the Azure .env.production back. Then start the API:
#   cd ~/ProjectServeLoco && docker compose -f docker-compose.prod.yml up -d api
source "$(dirname "$0")/lib.sh"

[ -f "$ENV_BACKUP" ] || die "no backup at $ENV_BACKUP"
assert_host azure "$ENV_BACKUP"
if [ "$(prod_points_at)" = azure ]; then
  log ".env.production already points at Azure — nothing to do"
  exit 0
fi
keep="$MIG_DIR/env.production.rds-$(now_utc)"
cp -p "$ENV_PROD" "$keep"
cat "$ENV_BACKUP" > "$ENV_PROD"
[ "$(prod_points_at)" = azure ] || die "restore failed — check $ENV_PROD by hand"
log "restored the Azure version (the RDS version is kept in $keep)"
log "next: cd $REPO_DIR && ${COMPOSE[*]} up -d api"
