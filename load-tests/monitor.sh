#!/usr/bin/env bash
# Server-side monitor — run this ON the Lightsail server (via SSH) DURING a
# load test. Client-side numbers (k6/artillery) tell you latency and errors;
# this tells you WHY — which resource saturates first.
#
# Usage (on the server):
#   bash monitor.sh           # samples every 2s until Ctrl-C
#
# What to watch:
#   - CPU near 100% on the api container  -> single Node process is CPU-bound
#     (this app runs one process, no cluster) -> the first ceiling you'll hit.
#   - MEM climbing and not releasing       -> connection/memory leak or too many
#     open sockets (each socket costs memory).
#   - MySQL "Threads_connected" near 30    -> DB pool exhausted (connectionLimit
#     default is 30); requests queue behind it.

set -u
INTERVAL="${1:-2}"

echo "ts,api_cpu%,api_mem,mysql_threads_connected,established_conns"
while true; do
  TS=$(date +%H:%M:%S)

  # Per-container CPU / mem (docker compose service names: api, mysql, ...).
  STATS=$(docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' 2>/dev/null \
            | grep -i api | head -1)
  API_CPU=$(echo "$STATS" | awk '{print $2}')
  API_MEM=$(echo "$STATS" | awk '{print $3}')

  # MySQL active connections (proxy for DB pool pressure).
  THREADS=$(docker compose -f docker-compose.prod.yml exec -T mysql \
            mysql -uroot -p"${MYSQL_ROOT_PASSWORD:-}" -N -e \
            "SHOW STATUS LIKE 'Threads_connected';" 2>/dev/null | awk '{print $2}')

  # Established TCP connections to the API port (rough concurrent-client count).
  CONNS=$(ss -tan 2>/dev/null | grep -c ':3000.*ESTAB')

  echo "${TS},${API_CPU:-?},${API_MEM:-?},${THREADS:-?},${CONNS:-?}"
  sleep "$INTERVAL"
done
