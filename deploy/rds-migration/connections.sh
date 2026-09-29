#!/usr/bin/env bash
# Who is connected to a server right now.
#   D3  ./connections.sh azure   after the API stops: nothing from the app may remain
#   D10 ./connections.sh rds     after the API starts: the app user is here
#       ./connections.sh azure   ...and no longer on Azure
source "$(dirname "$0")/lib.sh"

target="${1:?usage: $0 azure|rds}"
rows="$(q "$target" "SELECT USER, SUBSTRING_INDEX(HOST, ':', 1), COUNT(*) FROM information_schema.PROCESSLIST
  WHERE ID <> CONNECTION_ID() AND USER NOT IN ('system user', 'event_scheduler', 'rdsadmin', 'azure_superuser')
  GROUP BY USER, SUBSTRING_INDEX(HOST, ':', 1) ORDER BY USER")"
if [ -z "$rows" ]; then
  log "$target: no connections besides this check"
else
  log "$target connections (user, from, count):"
  printf '%s\n' "$rows" | sed 's/^/  /'
fi
