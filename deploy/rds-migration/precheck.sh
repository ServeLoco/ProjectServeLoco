#!/usr/bin/env bash
# Step D1: everything that must be true before the API is stopped.
# Read-only. Exit 0 only when it is safe to start the move.
source "$(dirname "$0")/lib.sh"

bad=0
log "UTC now: $(date -u '+%Y-%m-%d %H:%M:%S') — write this down (Azure point-in-time restore target)"

where="$(prod_points_at)"
log ".env.production points at: $where"
[ "$where" = azure ] || { echo "  expected azure"; bad=1; }
check_prod_env && log "MYSQL_SSL / MYSQL_SSL_CA_PATH / MYSQL_SESSION_TZ are right for RDS"

log "active orders on Azure (must be 0)"
active="$(q azure "SELECT COUNT(*) FROM orders WHERE status NOT IN ('Delivered', 'Cancelled')")"
echo "  $active"
if [ "$active" != 0 ]; then
  q azure "SELECT id, status, created_at FROM orders WHERE status NOT IN ('Delivered', 'Cancelled') ORDER BY id" | sed 's/^/  /'
  bad=1
fi

log "RDS reachable as the app user"
q rds "SELECT CONCAT('  ', CURRENT_USER(), ' on ', VERSION())"

if [ "$TEST_MODE" != 1 ]; then
  log "API container"; "${COMPOSE[@]}" ps api
  log "memory"; free -m
  log "disk"; df -h "$HOME" | tail -1
  log "deployed image: $(api_image)"
fi

[ "$bad" = 0 ] || die "not ready — see above"
log "READY: stop the API next (D2)"
