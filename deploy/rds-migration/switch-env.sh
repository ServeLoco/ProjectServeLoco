#!/usr/bin/env bash
# Step D7: point the API at RDS. Changes only the connection lines that
# rds.env holds (MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD) in
# apps/api/.env.production, after saving the Azure version.
# Undo with ./rollback-env.sh.
source "$(dirname "$0")/lib.sh"

[ "$(prod_points_at)" = azure ] || die ".env.production does not point at Azure (already switched?) — nothing changed"
check_prod_env
ensure_azure_env
[ -f "$RDS_ENV" ] || die "$RDS_ENV is missing"
assert_host rds "$(target_env rds)"

keys="$(env_keys "$RDS_ENV")"
for k in MYSQL_HOST MYSQL_USER MYSQL_PASSWORD; do
  grep -qx "$k" <<< "$keys" || die "rds.env has no $k"
  grep -q "^$k=" "$ENV_PROD" || die ".env.production has no $k line to replace"
done
while read -r k; do
  [[ "$k" == MYSQL_* ]] || die "rds.env may only hold MYSQL_ settings, found $k"
done <<< "$keys"

if [ -f "$ENV_BACKUP" ]; then
  log "keeping the existing Azure backup: $ENV_BACKUP"
else
  cp -p "$ENV_PROD" "$ENV_BACKUP"
  log "saved the Azure version: $ENV_BACKUP"
fi

new="$TMP_DIR/env.production.$$"
# Values go through the environment, not argv, so the password never shows
# up in the process list.
REPLACE_KEYS="$(paste -sd' ' - <<< "$keys")" RDS_FILE="$RDS_ENV" awk '
  BEGIN {
    n = split(ENVIRON["REPLACE_KEYS"], ks, " ")
    while ((getline line < ENVIRON["RDS_FILE"]) > 0) {
      i = index(line, "="); if (i > 1) val[substr(line, 1, i - 1)] = substr(line, i + 1)
    }
  }
  {
    i = index($0, "="); k = (i > 1) ? substr($0, 1, i - 1) : ""
    if (k in val) { print k "=" val[k]; next }
    print
  }' "$ENV_PROD" > "$new"

# Exactly what was meant, nothing more: every rds.env setting now holds its
# RDS value, and every other line is byte-for-byte the Azure version.
key_re="^($(paste -sd'|' - <<< "$keys"))="
cmp -s <(grep -Ev "$key_re" "$ENV_PROD") <(grep -Ev "$key_re" "$new") \
  || die "an unrelated line would change — .env.production left untouched"
while read -r k; do
  [ "$(env_value "$new" "$k")" = "$(env_value "$RDS_ENV" "$k")" ] \
    || die "$k did not take the RDS value — .env.production left untouched"
done <<< "$keys"
cat "$new" > "$ENV_PROD"   # same file, same owner and permissions

log "switched $(grep -c . <<< "$keys") settings in .env.production (password hidden):"
diff <(grep -v '^MYSQL_PASSWORD=' "$ENV_BACKUP") <(grep -v '^MYSQL_PASSWORD=' "$ENV_PROD") | grep '^[<>]' | sed 's/^/  /' || true
echo "  MYSQL_PASSWORD: changed (hidden)"
[ "$(prod_points_at)" = rds ] || die "after the edit .env.production does not point at RDS — run ./rollback-env.sh"
log "next (D8): cd $REPO_DIR && ${COMPOSE[*]} run --rm --no-deps api npm run db:migrate"
