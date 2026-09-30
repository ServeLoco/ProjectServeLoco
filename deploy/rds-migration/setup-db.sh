#!/usr/bin/env bash
# Step B3: create the app database and the app user on RDS.
#
#   ./setup-db.sh        asks for the RDS master password (hidden)
#
# Needs rds.env (step B2). The master password comes from Secrets Manager
# and is only typed into the hidden prompt; the app password is the one
# generated into rds.env. Neither reaches a command line. Safe to re-run: it
# re-applies the password and the grants.
source "$(dirname "$0")/lib.sh"

MASTER_USER="${MASTER_USER:-villkroadmin}"
envf="$(target_env rds)"
host="$(env_value "$envf" MYSQL_HOST)"
port="$(env_value "$envf" MYSQL_PORT)"
db="$(env_value "$envf" MYSQL_DATABASE)"
app_user="$(env_value "$envf" MYSQL_USER)"
app_pw="$(env_value "$envf" MYSQL_PASSWORD)"
[[ "$db" =~ ^[a-z0-9_]+$ ]] || die "unexpected MYSQL_DATABASE '$db'"
[[ "$app_user" =~ ^[a-z0-9_]+$ ]] || die "unexpected MYSQL_USER '$app_user' in rds.env"
[[ "$app_pw" =~ ^[0-9a-f]{48}$ ]] || die "MYSQL_PASSWORD in rds.env must be the 48-character value from 'openssl rand -hex 24' (step B2)"

# The grants the app needs (plan §2): everything migrate.js does, the
# restore, and the deploy's mysqldump (PROCESS, TRIGGER, EVENT). No SUPER.
sql="CREATE DATABASE IF NOT EXISTS \`$db\` CHARACTER SET utf8mb4 COLLATE $DB_COLLATION;
CREATE USER IF NOT EXISTS '$app_user'@'%' IDENTIFIED BY '$app_pw' REQUIRE SSL;
ALTER USER '$app_user'@'%' IDENTIFIED BY '$app_pw' REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES,
      CREATE TEMPORARY TABLES, LOCK TABLES, SHOW VIEW, TRIGGER, EVENT
   ON \`$db\`.* TO '$app_user'@'%';
GRANT PROCESS ON *.* TO '$app_user'@'%';"

read -rsp "RDS master password for $MASTER_USER (hidden, from Secrets Manager): " MYSQL_PWD
echo >&2
[ -n "$MYSQL_PWD" ] || die "empty password"
export MYSQL_PWD

log "creating database '$db' and user '$app_user' on $host"
if [ "$TEST_MODE" = 1 ]; then
  printf '%s\n' "$sql" | mysql -h "$host" -P "${port:-3306}" -u "$MASTER_USER" --ssl-mode=REQUIRED
else
  printf '%s\n' "$sql" | docker run --rm -i --memory "$MEM_LIMIT" -e MYSQL_PWD "$MYSQL_IMAGE" \
    mysql -h "$host" -P "${port:-3306}" -u "$MASTER_USER" --ssl-mode=REQUIRED
fi
unset MYSQL_PWD

log "signing in as $app_user to check"
q rds "SELECT CURRENT_USER(), VERSION()"
q rds "SHOW GRANTS"
log "done. Next: ./check.sh"
