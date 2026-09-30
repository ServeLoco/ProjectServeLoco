#!/usr/bin/env bash
# Prove two copies of the app database are identical (steps C2, D5, Day +1).
#
#   ./compare.sh --live                  Azure vs RDS, both read now.
#                                        Only meaningful with the API stopped.
#   ./compare.sh --dump FILE [--target rds|azure]
#                                        a dump vs one live server (default rds)
#
# Identical means all of:
#   - the server settings the app depends on
#   - the exact row count of every table (--live)
#   - the same orphaned-foreign-key counts (normally zero)
#   - one fingerprint of all data and schema: both sides dumped the same way,
#     comment lines dropped, sha256
# Exit 0 only when everything matches. Read-only on both servers.
source "$(dirname "$0")/lib.sh"

mode="" file="" target=rds
while [ $# -gt 0 ]; do
  case "$1" in
    --live) mode=live; shift ;;
    --dump) mode=dump; file="${2:?--dump needs a file}"; shift 2 ;;
    --target) target="${2:?}"; shift 2 ;;
    *) die "usage: $0 --live | --dump FILE [--target rds|azure]" ;;
  esac
done
[ -n "$mode" ] || die "usage: $0 --live | --dump FILE [--target rds|azure]"
start=$SECONDS
bad=0

log "1. settings the app depends on"
settings_table || bad=1

if [ "$mode" = live ]; then
  log "2. exact row count of every table"
  ca="$TMP_DIR/counts-azure.$$"; cr="$TMP_DIR/counts-rds.$$"
  counts_of azure > "$ca"
  counts_of rds > "$cr"
  while IFS=$'\t' read -r t a r; do
    if [ "$a" = "$r" ]; then mark=ok; else mark=DIFFERENT; bad=1; fi
    printf '  %-28s azure: %-9s rds: %-9s %s\n' "$t" "$a" "$r" "$mark"
  done < <(LC_ALL=C join -t $'\t' -a1 -a2 -e MISSING -o 0,1.2,2.2 "$ca" "$cr")
  echo "  tables: azure $(grep -c . "$ca" || true), rds $(grep -c . "$cr" || true)"
  sides=(azure rds)
else
  [ -f "$file" ] || die "no such file: $file"
  check_dump "$file"
  log "2. row counts on $target"
  counts_of "$target" | awk -F'\t' '{ printf "  %-28s %s\n", $1, $2; n++; s += $2 } END { printf "  %d tables, %d rows\n", n, s }'
  sides=("$target")
fi

log "3. orphaned foreign keys"
declare -A orphans
for s in "${sides[@]}"; do
  orphans[$s]="$(fk_orphans "$s" | awk -F'\t' '$2 != 0' || true)"
  if [ -z "${orphans[$s]}" ]; then echo "  $s: none"; else echo "  $s:"; printf '%s\n' "${orphans[$s]}" | sed 's/^/    /'; fi
done
if [ "$mode" = live ] && [ "${orphans[azure]}" != "${orphans[rds]}" ]; then
  echo "  DIFFERENT"; bad=1
fi

log "4. fingerprint of all data and schema"
if [ "$mode" = live ]; then
  a="$TMP_DIR/fp-azure.$$.sql.gz"; dump_db azure "$a"; a_name=azure
else
  a="$file"; a_name="$(basename "$file")"
fi
b="$TMP_DIR/fp-$target.$$.sql.gz"; dump_db "$target" "$b"
fa="$(fingerprint "$a")"; fb="$(fingerprint "$b")"
echo "  $a_name: $fa"
echo "  $target: $fb"
if [ "$fa" = "$fb" ]; then
  echo "  ok"
else
  bad=1
  keep="$BACKUP_DIR/mismatch_$(now_utc)"
  mkdir -p "$keep" && cp "$a" "$keep/a.sql.gz" && cp "$b" "$keep/b.sql.gz"
  echo "  DIFFERENT — both dumps kept in $keep"
  echo "  tables that differ:"
  LC_ALL=C join -t $'\t' -a1 -a2 -e MISSING -o 0,1.2,2.2 <(table_hashes "$a") <(table_hashes "$b") \
    | awk -F'\t' '$2 != $3 { print "    " $1 ($2 == "MISSING" || $3 == "MISSING" ? " (missing on one side)" : "") }'
fi

echo
if [ "$bad" = 0 ]; then
  log "RESULT: IDENTICAL ($((SECONDS - start))s)"
else
  log "RESULT: DIFFERENT — do NOT switch. Roll back (R1) and find the cause."
  exit 2
fi
