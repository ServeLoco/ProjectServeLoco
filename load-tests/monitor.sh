#!/usr/bin/env bash
# Server-side monitor — run this ON the Lightsail server (via SSH) DURING a
# load test. Displays a live htop-style dashboard refreshing every 2 seconds.
#
# Usage (on the server):
#   bash load-tests/monitor.sh
#   bash load-tests/monitor.sh 1   # refresh every 1 second
#
# What to watch:
#   - API CPU near 100%            -> Node process is CPU-bound (first ceiling)
#   - MEM keeps climbing           -> memory leak / too many open sockets
#   - MySQL connections near 30    -> DB pool exhausted, requests start queuing
#   - TCP ESTAB near your VU count -> all virtual users are connected

INTERVAL="${1:-2}"
MYSQL_PASS="${MYSQL_ROOT_PASSWORD:-}"

# Colors
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
CLEAR='\033[H\033[2J'

warn_color() {
  local val="$1" warn="$2" crit="$3" unit="$4"
  local num="${val//%/}"; num="${num// */}"
  if awk "BEGIN{exit !($num >= $crit)}" 2>/dev/null; then
    echo -e "${RED}${val}${unit}${RESET}"
  elif awk "BEGIN{exit !($num >= $warn)}" 2>/dev/null; then
    echo -e "${YELLOW}${val}${unit}${RESET}"
  else
    echo -e "${GREEN}${val}${unit}${RESET}"
  fi
}

bar() {
  local pct="${1//%/}"; pct="${pct// */}"
  local filled=$(awk "BEGIN{printf \"%d\", $pct/5}" 2>/dev/null || echo 0)
  local empty=$((20 - filled))
  local bar=""
  for ((i=0;i<filled;i++)); do bar+="█"; done
  for ((i=0;i<empty;i++));  do bar+="░"; done
  if   awk "BEGIN{exit !($pct >= 90)}" 2>/dev/null; then echo -e "${RED}[${bar}]${RESET} ${pct}%"
  elif awk "BEGIN{exit !($pct >= 60)}" 2>/dev/null; then echo -e "${YELLOW}[${bar}]${RESET} ${pct}%"
  else echo -e "${GREEN}[${bar}]${RESET} ${pct}%"
  fi
}

while true; do
  # ── collect data ──────────────────────────────────────────────────────────
  STATS=$(docker stats --no-stream --format \
    '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}' \
    2>/dev/null)

  API_LINE=$(echo "$STATS" | grep -i "api" | head -1)
  API_CPU=$(echo "$API_LINE"  | cut -d'|' -f2)
  API_MEM=$(echo "$API_LINE"  | cut -d'|' -f3)
  API_MEMP=$(echo "$API_LINE" | cut -d'|' -f4)
  API_NET=$(echo "$API_LINE"  | cut -d'|' -f5)

  NGINX_LINE=$(echo "$STATS" | grep -i "proxy\|nginx" | head -1)
  NGX_CPU=$(echo "$NGINX_LINE" | cut -d'|' -f2)
  NGX_MEM=$(echo "$NGINX_LINE" | cut -d'|' -f3)

  THREADS=$(docker compose -f docker-compose.prod.yml exec -T mysql \
    mysql -uroot -p"${MYSQL_PASS}" -N -e \
    "SHOW STATUS LIKE 'Threads_connected';" 2>/dev/null | awk '{print $2}')

  TCP_ESTAB=$(ss -tan 2>/dev/null | grep -c ':3000.*ESTAB' || echo 0)
  LOAD=$(uptime 2>/dev/null | grep -oP 'load average: \K[^,]+')
  UPTIME=$(uptime -p 2>/dev/null | sed 's/up //')

  # ── render dashboard ──────────────────────────────────────────────────────
  echo -ne "$CLEAR"
  echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${CYAN}║        ServeLoco  Load Test Monitor                 ║${RESET}"
  echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════╝${RESET}"
  echo -e "  ${BOLD}Time:${RESET} $(date '+%H:%M:%S')   ${BOLD}Uptime:${RESET} ${UPTIME}   ${BOLD}Load avg (1m):${RESET} ${LOAD}"
  echo ""
  echo -e "  ${BOLD}── API Container ───────────────────────────────────────${RESET}"
  printf  "  %-18s %s\n" "CPU usage:" "$(bar "${API_CPU:-0}")"
  printf  "  %-18s %s\n" "Memory usage:" "$(bar "${API_MEMP:-0}")"
  printf  "  %-18s ${CYAN}%s${RESET}\n" "Memory (raw):" "${API_MEM:-?}"
  printf  "  %-18s ${CYAN}%s${RESET}\n" "Network I/O:" "${API_NET:-?}"
  echo ""
  echo -e "  ${BOLD}── Nginx Proxy ─────────────────────────────────────────${RESET}"
  printf  "  %-18s %s\n" "CPU usage:" "$(bar "${NGX_CPU:-0}")"
  printf  "  %-18s ${CYAN}%s${RESET}\n" "Memory (raw):" "${NGX_MEM:-?}"
  echo ""
  echo -e "  ${BOLD}── Database (MySQL) ─────────────────────────────────────${RESET}"
  printf  "  %-18s " "Active connections:"
  warn_color "${THREADS:-?}" 20 28 "/30 (pool limit)"
  echo ""
  echo -e "  ${BOLD}── Network ──────────────────────────────────────────────${RESET}"
  printf  "  %-18s " "TCP :3000 ESTAB:"
  warn_color "${TCP_ESTAB}" 200 400 " connections"
  echo ""
  echo -e "  ${BOLD}── Legend ───────────────────────────────────────────────${RESET}"
  echo -e "  ${GREEN}■ Green${RESET} = healthy   ${YELLOW}■ Yellow${RESET} = getting warm   ${RED}■ Red${RESET} = at limit"
  echo ""
  echo -e "  Press ${BOLD}Ctrl+C${RESET} to stop"

  sleep "$INTERVAL"
done
