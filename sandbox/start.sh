#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# UVerify Sandbox — start.sh
#
# Usage:
#   ./start.sh           # first run: full bootstrap
#   ./start.sh --no-bootstrap  # subsequent runs: start services only
#
# Prerequisites: Docker, Node.js ≥ 20, npm
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

NO_BOOTSTRAP=false
for arg in "$@"; do
  [[ "$arg" == "--no-bootstrap" ]] && NO_BOOTSTRAP=true
done

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[sandbox]${RESET} $*"; }
success() { echo -e "${GREEN}[sandbox]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[sandbox]${RESET} $*"; }

# ── Step 0: Ensure .env exists ────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  info "No .env found — copying .env.example to .env"
  cp .env.example .env
  warn "Review .env and adjust mnemonics / passwords if desired, then re-run."
fi

# ── Step 1: Start infrastructure (yaci node + PostgreSQL) ─────────────────────
info "Starting infrastructure (yaci node + PostgreSQL)…"
docker compose up -d yaci-node postgres

# ── Step 2: Start backend (proxy hash may be empty on first run — that's OK) ──
info "Starting UVerify backend…"
docker compose up -d uverify-backend

# ── Step 3: Bootstrap (first run only) ────────────────────────────────────────
if [[ "$NO_BOOTSTRAP" == false ]]; then
  # Check whether the proxy hash has already been set from a previous run.
  PROXY_TX_HASH_VALUE="$(grep -E '^PROXY_TX_HASH=' .env | cut -d= -f2 || true)"

  if [[ -z "$PROXY_TX_HASH_VALUE" ]]; then
    info "Running bootstrap (fund wallets, INIT proxy, deploy library)…"

    if [[ ! -d bootstrap/node_modules ]]; then
      info "Installing bootstrap dependencies…"
      npm --prefix bootstrap install --silent
    fi

    npm --prefix bootstrap run bootstrap
  else
    info "Proxy already configured (PROXY_TX_HASH=${PROXY_TX_HASH_VALUE:0:16}…) — skipping bootstrap."
    info "Use --no-bootstrap to suppress this check on future starts."
  fi
else
  info "--no-bootstrap flag set — skipping bootstrap."
fi

# ── Step 4: Start UI ───────────────────────────────────────────────────────────
info "Starting UVerify UI…"
docker compose up -d uverify-ui

success ""
success "╔══════════════════════════════════════════════════╗"
success "║   UVerify Sandbox is running!                    ║"
success "╠══════════════════════════════════════════════════╣"
success "║   UI       →  http://localhost:3000              ║"
success "║   Backend  →  http://localhost:9090              ║"
success "║   API docs →  http://localhost:9090/swagger-ui   ║"
success "║   Devnet   →  http://localhost:8080              ║"
success "╚══════════════════════════════════════════════════╝"
success ""
info "To stop the sandbox:  docker compose down"
info "To reset completely:  docker compose down -v && rm -f .env"
