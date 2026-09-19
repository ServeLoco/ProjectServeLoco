#!/usr/bin/env bash
#
# Copy backup files off the deploy box to S3.
#
#   ./offbox-upload.sh <file> [file ...]
#
# $HOME/backups on the Lightsail instance is on the same disk as the thing it
# protects: it survives a bad migration, and nothing else. A lost instance, a
# full disk or a wrong `rm` takes the database and all five dumps together.
#
# Credentials come from the environment and are deliberately NOT the ones in
# apps/api/.env.production — that key belongs to the running API for image
# uploads, and a key that can delete backups should not be sitting on the box
# the backups are protecting. The deploy passes these in for the length of the
# SSH session and they are never written to disk.
#
#   BACKUP_S3_BUCKET             destination bucket (unset = skip, not fail)
#   BACKUP_S3_PREFIX             key prefix (default: serveloco)
#   BACKUP_S3_REGION             default: ap-south-1
#   BACKUP_AWS_ACCESS_KEY_ID     write-only key: PutObject, no Delete
#   BACKUP_AWS_SECRET_ACCESS_KEY
#   BACKUP_AWSCLI_IMAGE          default: amazon/aws-cli:2
#
# Exit codes: 0 uploaded or deliberately skipped · 1 usage · 2 upload failed.
set -euo pipefail

[ $# -gt 0 ] || { echo "usage: $0 <file> [file ...]" >&2; exit 1; }

# An unconfigured box must not fail the deploy: the local dump has already been
# taken and verified by this point, so the deploy is no less safe than it was
# before off-box copies existed. It is loud about it, though.
if [ -z "${BACKUP_S3_BUCKET:-}" ]; then
  echo "::warning::BACKUP_S3_BUCKET is not set — backups stay on this box only"
  exit 0
fi

PREFIX="${BACKUP_S3_PREFIX:-serveloco}"
REGION="${BACKUP_S3_REGION:-ap-south-1}"
DAY="$(date -u +%Y/%m/%d)"

aws_cli() {
  docker run --rm \
    -e AWS_ACCESS_KEY_ID="${BACKUP_AWS_ACCESS_KEY_ID:-}" \
    -e AWS_SECRET_ACCESS_KEY="${BACKUP_AWS_SECRET_ACCESS_KEY:-}" \
    -e AWS_DEFAULT_REGION="$REGION" \
    -v "$UPLOAD_DIR:/data:ro" \
    "${BACKUP_AWSCLI_IMAGE:-amazon/aws-cli:2}" "$@"
}

for f in "$@"; do
  [ -f "$f" ] || { echo "::error::no such file: $f" >&2; exit 2; }

  UPLOAD_DIR="$(cd "$(dirname "$f")" && pwd)"
  BASE="$(basename "$f")"
  KEY="$PREFIX/$DAY/$BASE"
  LOCAL_BYTES="$(stat -c%s "$f")"

  # --only-show-errors keeps the progress spinner out of the Actions log without
  # hiding a failure.
  if ! aws_cli s3 cp "/data/$BASE" "s3://$BACKUP_S3_BUCKET/$KEY" \
         --sse AES256 --only-show-errors; then
    echo "::error::upload failed for $BASE — the backup exists only on this box" >&2
    exit 2
  fi

  # An upload that reported success and stored a zero-byte object is the same
  # class of failure as a dump that reported success and wrote nothing, so the
  # stored size is read back rather than assumed.
  REMOTE_BYTES="$(aws_cli s3api head-object \
                    --bucket "$BACKUP_S3_BUCKET" --key "$KEY" \
                    --query ContentLength --output text 2>/dev/null || echo "")"
  if [ "$REMOTE_BYTES" != "$LOCAL_BYTES" ]; then
    echo "::error::$BASE uploaded as $REMOTE_BYTES bytes, expected $LOCAL_BYTES" >&2
    exit 2
  fi

  echo "Off-box: s3://$BACKUP_S3_BUCKET/$KEY ($LOCAL_BYTES bytes)"
done
