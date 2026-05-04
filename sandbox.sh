#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SANDBOX_DIR="$SCRIPT_DIR/sandbox"
PROJECT="sandbox"
CHAINSTATE_VOLUME="${PROJECT}_yaci_chainstate"

_compose() {
  (cd "$SANDBOX_DIR" && docker compose "$@")
}

# Marker file written after a successful seed. Avoids spinning up a container
# for the check, which can leave orphaned containers on macOS Docker Desktop.
SEED_MARKER="$SANDBOX_DIR/.chainstate-seeded"

_chainstate_populated() {
  [ -f "$SEED_MARKER" ] && docker volume inspect "$CHAINSTATE_VOLUME" > /dev/null 2>&1
}

_seed_chainstate() {
  printf "  Seeding chainstate from snapshot..."
  docker run --rm \
    -v "${CHAINSTATE_VOLUME}:/chainstate" \
    uverify/sandbox-node:latest \
    sh -c "cp -a /app/snapshots/uverify-base-state/checkpoint/. /chainstate/"
  touch "$SEED_MARKER"
  printf " done.\n"
}

_wait_for_yano() {
  printf "  Waiting for block producer"
  local n=0
  until curl -sf http://localhost:7070/q/health/ready > /dev/null 2>&1; do
    n=$((n + 1))
    if [ "$n" -ge 90 ]; then
      printf "\n  Timed out waiting for yano.\n" >&2
      return 1
    fi
    printf "."
    sleep 2
  done
  printf " ready.\n"
}

_catch_up() {
  printf "  Advancing chain to wall-clock time..."
  curl -sf -X POST http://localhost:7070/api/v1/devnet/epochs/catch-up > /dev/null
  printf " done.\n"
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
  printf "  %-26s  %s\n" "UVerify UI"          "http://localhost:3000"
  printf "  %-26s  %s\n" "UVerify Backend"     "http://localhost:9090"
  printf "  %-26s  %s\n" "API docs (Swagger)"  "http://localhost:9090/swagger-ui/index.html"
  printf "  %-26s  %s\n" "Chain viewer"        "http://localhost:3001"
  printf "  %-26s  %s\n" "Yaci Store API"      "http://localhost:8080"
  printf "  %-26s  %s\n" "Yaci Store (Swagger)" "http://localhost:8080/swagger-ui/index.html"
  printf "  %-26s  %s\n" "Yano devnet API"     "http://localhost:7070/q/swagger-ui"
  printf "\n"
}

_start() {
  if [ "${1:-}" = "--clean" ]; then
    printf "Cleaning sandbox data...\n"
    _compose down -v
    docker volume rm "${CHAINSTATE_VOLUME}" 2>/dev/null || true
    rm -f "$SEED_MARKER"
    printf "\n"
  fi

  if ! _chainstate_populated; then
    _seed_chainstate
  fi

  printf "Starting UVerify sandbox...\n"
  _compose up -d --remove-orphans
  printf "\n"
  _wait_for_yano
  _catch_up
  printf "\n"
  _print_urls
  printf "  All services are starting. Some may take up to a minute to become fully ready.\n"
  printf "  Run './sandbox.sh info' at any time to check status.\n\n"
}

case "${1:-}" in
  start)
    _start "${2:-}"
    ;;
  stop)
    printf "Stopping UVerify sandbox...\n"
    _compose down
    printf "Done.\n"
    ;;
  restart)
    printf "Restarting UVerify sandbox...\n"
    _compose down
    printf "\n"
    _start
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
    printf "    start           Start all sandbox services\n"
    printf "    start --clean   Wipe all data and start fresh from the snapshot\n"
    printf "    stop            Stop all sandbox services\n"
    printf "    restart         Restart all sandbox services\n"
    printf "    info            Show service status and URLs\n"
    printf "\n"
    exit 1
    ;;
esac
