#!/usr/bin/env bash
# Safety net S3 (and any time you want one): a full dump of the working Azure
# database. Only reads Azure; the API keeps running.
#
#   ./backup-azure.sh [label]   ->  backups/<label>_<UTC time>.sql.gz  (+ .sha256)
source "$(dirname "$0")/lib.sh"

label="${1:-pre_move}"
[[ "$label" =~ ^[a-z0-9_-]+$ ]] || die "label may only use a-z 0-9 _ -"
out="$BACKUP_DIR/${label}_$(now_utc).sql.gz"

log "dumping Azure (read-only) -> $out"
start=$SECONDS
dump_db azure "$out"
log "done in $((SECONDS - start))s — $(stat -c%s "$out") bytes, sha256 $(cut -c1-64 "$out.sha256")"
log "copy it off the box (S4), from your laptop:"
echo "  scp -i <key.pem> ubuntu@<box>:$out $out.sha256 ~/villkro-db-backups/ && (cd ~/villkro-db-backups && sha256sum -c $(basename "$out").sha256)"
echo "$out"
