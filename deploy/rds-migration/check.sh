#!/usr/bin/env bash
# Step B4: can the box reach RDS as the app user, the way the app will, and
# does RDS behave like Azure? Read-only on both.
#
#   ./check.sh      exit 0 when every setting the app depends on matches
source "$(dirname "$0")/lib.sh"

log "RDS, signed in as the app user"
q rds "SELECT CONCAT('user: ', CURRENT_USER(), '   version: ', VERSION())"
tls="$(q rds "SHOW SESSION STATUS LIKE 'Ssl_cipher'" | cut -f2)"
[ -n "$tls" ] || die "the connection to RDS is not encrypted"
echo "  TLS cipher: $tls"
echo "  grants:"
q rds "SHOW GRANTS" | sed 's/^/    /'

log "settings the app depends on (Azure vs RDS)"
if settings_table; then
  log "OK — RDS matches Azure on every setting that matters ('tables' fills in after the copy)"
else
  die "a setting differs — fix the parameter group (step A3) before going on"
fi
log "round-trip time from the app: run ./app-check.sh (it measures both servers)"
