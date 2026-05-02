#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SANDBOX_DIR="$SCRIPT_DIR/sandbox"

_compose() {
  (cd "$SANDBOX_DIR" && docker compose "$@")
}

_print_status() {
  local entry container name raw label

  printf "\n"
  printf "  %-26s  %s\n" "Service" "Status"
  printf "  %-26s  %s\n" "─────────────────────────" "──────────"

  for entry in \
    "uverify-sandbox-ui:UVerify UI" \
    "uverify-sandbox-backend:UVerify Backend" \
    "uverify-sandbox-yaci-viewer:Chain viewer" \
    "uverify-sandbox-yaci-store:Yaci Store" \
    "uverify-sandbox-postgres:PostgreSQL" \
    "bloxbean-yano:Yano devnet"
  do
    container="${entry%%:*}"
    name="${entry##*:}"
    raw=$(docker inspect --format '{{.State.Status}}' "$container" 2>/dev/null) || raw=""
    case "$raw" in
      running) label="running" ;;
      exited)  label="stopped" ;;
      "")      label="not found" ;;
      *)       label="$raw" ;;
    esac
    printf "  %-26s  %s\n" "$name" "$label"
  done

  printf "\n"
}

_print_urls() {
  printf "  %-26s  %s\n" "Service" "URL"
  printf "  %-26s  %s\n" "─────────────────────────" "──────────────────────────────────────────"
  printf "  %-26s  %s\n" "UVerify UI"           "http://localhost:3000"
  printf "  %-26s  %s\n" "UVerify Backend"      "http://localhost:9090"
  printf "  %-26s  %s\n" "API docs (Swagger)"   "http://localhost:9090/swagger-ui"
  printf "  %-26s  %s\n" "Chain viewer"         "http://localhost:3001"
  printf "  %-26s  %s\n" "Yaci Store API"       "http://localhost:8080"
  printf "  %-26s  %s\n" "Yano devnet API"      "http://localhost:7070/q/swagger-ui"
  printf "\n"
}

case "${1:-}" in
  start)
    echo "Starting UVerify sandbox ..."
    _compose up -d
    printf "\n"
    _print_urls
    echo "  All services are starting. Some may take up to a minute to become ready."
    echo "  Run './sandbox.sh info' at any time to check status."
    printf "\n"
    ;;
  stop)
    echo "Stopping UVerify sandbox ..."
    _compose down
    echo "Done."
    ;;
  restart)
    echo "Restarting UVerify sandbox ..."
    _compose down
    _compose up -d
    printf "\n"
    _print_urls
    echo "  Run './sandbox.sh info' at any time to check status."
    printf "\n"
    ;;
  info)
    _print_status
    _print_urls
    ;;
  *)
    printf "\n"
    printf "  Usage: ./sandbox.sh <command>\n"
    printf "\n"
    printf "  Commands:\n"
    printf "    start      Start all sandbox services\n"
    printf "    stop       Stop all sandbox services\n"
    printf "    restart    Restart all sandbox services\n"
    printf "    info       Show service URLs and running status\n"
    printf "\n"
    exit 1
    ;;
esac
