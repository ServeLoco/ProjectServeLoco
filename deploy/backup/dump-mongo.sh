#!/usr/bin/env bash
#
# Dump MongoDB Atlas (image metadata) to a gzipped archive.
#
#   ./dump-mongo.sh <output.mongo.gz> [path/to/.env.production]
#
# The deploy has backed up MySQL since the migration gate went in, and has
# never backed up Mongo. MySQL is the only database migrate.js touches, so
# that is the right thing to *gate the deploy on* — but it is not a backup of
# the platform. `images` lives in Atlas, and every product photo in S3 is
# addressed through a row in it: lose the collection and the bucket is a pile
# of unreferenced keys.
#
#   MONGO_TOOLS_IMAGE   image carrying mongodump (default: mongo:7.0)
#
# Exit codes: 0 dumped · 1 usage · 2 dump failed.
set -euo pipefail

OUT="${1:-}"
ENV_FILE="${2:-./apps/api/.env.production}"
[ -n "$OUT" ] || { echo "usage: $0 <output.mongo.gz> [env-file]" >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "::error::no env file at $ENV_FILE" >&2; exit 2; }

IMAGE="${MONGO_TOOLS_IMAGE:-mongo:7.0}"

# mongodump was split out of the server package in MongoDB 4.4. Whether a given
# server image still bundles the database tools is not something to discover
# from a half-written archive at 3am, so it is checked before the dump runs and
# the failure names the fix.
if ! docker run --rm --entrypoint sh "$IMAGE" -c 'command -v mongodump >/dev/null'; then
  echo "::error::$IMAGE has no mongodump — set MONGO_TOOLS_IMAGE to an image that does" >&2
  exit 2
fi

# Credentials stay inside the container (--env-file) and off the process list:
# the URI is expanded by the container's shell, not written into this command.
if ! docker run --rm --env-file "$ENV_FILE" --entrypoint sh "$IMAGE" -c '
       exec mongodump --uri="$MONGODB_URI" --db="$MONGODB_DATABASE" \
         --archive --gzip --readPreference=secondaryPreferred
     ' > "$OUT"; then
  rm -f "$OUT"
  echo "::error::mongodump failed" >&2
  exit 2
fi

# An archive with no collections in it is a few dozen bytes and reports success.
BYTES="$(stat -c%s "$OUT")"
if [ "$BYTES" -lt "${MONGO_MIN_DUMP_BYTES:-1024}" ]; then
  echo "::error::mongo archive is only $BYTES bytes — treating as a failed dump" >&2
  rm -f "$OUT"
  exit 2
fi

echo "Mongo backup written: $OUT ($BYTES bytes)"
