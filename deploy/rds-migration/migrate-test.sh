#!/usr/bin/env bash
# Step C6: run the app's own migration against RDS, as a deploy would, to
# prove the app user can run every future migration. Practice run only.
#
# Run it AFTER compare.sh and app-check.sh: migrate.js re-writes its seed
# rows on every run, so the data no longer matches Azure byte for byte
# afterwards (the real copy on the night starts from an empty database again).
source "$(dirname "$0")/lib.sh"

[ "$(prod_points_at)" = azure ] || die "production already runs on RDS — the next deploy migrates it"
envf="$(target_env rds)"
start=$SECONDS
if [ "$TEST_MODE" = 1 ]; then
  (set -a; . "$envf"; set +a; cd "$API_DIR" && node src/db/migrate.js) < /dev/null
else
  docker run --rm --memory "$MEM_LIMIT" --env-file "$envf" "$(api_image)" node src/db/migrate.js < /dev/null
fi
log "migration on RDS finished OK in $((SECONDS - start))s"
