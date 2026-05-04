#!/usr/bin/env bash
#
# bootstrap.sh — Regenerate the uverify-base-state snapshot from a fresh chain.
#
# This is a developer-only script. End users never need to run it.
# Run it when the snapshot needs to be rebuilt (e.g. after a contract upgrade,
# genesis parameter change, or bootstrap datum reconfiguration).
#
# Prerequisites:
#   - Docker running with sandbox images built
#   - node + npm available (for sign.js)
#   - bootstrap/.env containing SIGNER_MNEMONIC (the service user's mnemonic)
#   - npm install already run inside bootstrap/
#
# Usage:
#   cd uverify-examples
#   ./sandbox/bootstrap.sh

set -euo pipefail

SANDBOX_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP_DIR="$SANDBOX_DIR/bootstrap"
ENV_FILE="$SANDBOX_DIR/.env"
PROJECT="sandbox"
CHAINSTATE_VOLUME="${PROJECT}_yaci_chainstate"

SERVICE_USER="addr_test1qqgmew8y57fsfc3me40zha3gjplehxv0gwgz7sw3mdpenqgs8flgvgd7y0mwwkk5p96a8hfdptxrawepr2evqhl2aj3sr9vgye"
FAUCET="addr_test1qqqt0pru382hy9vjlsxv3ye02z50sfvt8xunscg5pgden77z73dpdfng2ctw2ekqplqgrljelz7h4dneac27nn3qx3rqqpavzj"

YANO_HEALTH="http://localhost:7070/q/health/ready"
BACKEND_HEALTH="http://localhost:9090/actuator/health"

_compose() {
  (cd "$SANDBOX_DIR" && docker compose "$@")
}

_wait_url() {
  local url="$1" label="$2"
  printf "  Waiting for %s" "$label"
  local n=0
  until curl -sf "$url" > /dev/null 2>&1; do
    n=$((n + 1))
    if [ "$n" -ge 90 ]; then
      printf "\n  Timed out waiting for %s.\n" "$label" >&2
      exit 1
    fi
    printf "."
    sleep 2
  done
  printf " ready.\n"
}

# sign.js emits "Wallet address: ..." before the JSON — strip it.
_sign_tx() {
  local unsigned_tx="$1"
  local output
  output=$(cd "$BOOTSTRAP_DIR" && node sign.js "$unsigned_tx")
  echo "$output" | python3 -c "
import sys, json
text = sys.stdin.read()
obj = json.loads(text[text.index('{'):])
print(obj['transaction'])
"
}

_build_and_submit() {
  local label="$1" url="$2" body="$3" tx_field="$4"
  printf "  Building %s transaction" "$label"
  local response unsigned_tx n=0
  # Retry until the backend has indexed the required UTxOs (it re-syncs from
  # scratch after each restart so initial calls may fail while indexing catches up).
  until response=$(curl -sf -X POST "$url" -H "Content-Type: application/json" -d "$body") && \
        unsigned_tx=$(echo "$response" | python3 -c "
import sys, json
d = json.load(sys.stdin)
tx = d.get('$tx_field')
if not tx:
    raise ValueError('empty tx field')
print(tx)
" 2>/dev/null); do
    n=$((n + 1))
    if [ "$n" -ge 60 ]; then
      printf "\n  Timed out waiting for %s build.\n" "$label" >&2
      exit 1
    fi
    printf "."
    sleep 5
  done
  printf " signing..."
  local signed_tx
  signed_tx=$(_sign_tx "$unsigned_tx")
  printf " submitting..."
  curl -sf -X POST http://localhost:9090/api/v1/transaction/submit \
    -H "Content-Type: application/json" \
    -d "{\"transaction\":\"$signed_tx\",\"witnessSet\":\"\"}" > /dev/null
  printf " done.\n"
  echo "$response"
}

# ── Step 0: preflight ─────────────────────────────────────────────────────────

if [ ! -f "$BOOTSTRAP_DIR/.env" ]; then
  printf "Error: %s/.env not found.\n" "$BOOTSTRAP_DIR" >&2
  printf "Create it with SIGNER_MNEMONIC set to the service user mnemonic.\n" >&2
  exit 1
fi

if ! command -v node > /dev/null 2>&1; then
  printf "Error: node is not installed or not in PATH.\n" >&2
  exit 1
fi

if [ ! -d "$BOOTSTRAP_DIR/node_modules" ]; then
  printf "Installing sign.js dependencies...\n"
  (cd "$BOOTSTRAP_DIR" && npm install)
fi

# ── Step 1: clean environment ─────────────────────────────────────────────────

printf "\n=== UVerify Snapshot Bootstrap ===\n\n"
printf "Step 1: Cleaning environment...\n"
_compose down -v

# Reset proxy settings in .env so the backend starts without a stale reference
sed -i.bak 's|^PROXY_TX_HASH=.*|PROXY_TX_HASH=|' "$ENV_FILE"
sed -i.bak 's|^PROXY_OUTPUT_INDEX=.*|PROXY_OUTPUT_INDEX=0|' "$ENV_FILE"
rm -f "${ENV_FILE}.bak"
printf "  .env reset.\n"

# ── Step 2: start services ────────────────────────────────────────────────────

printf "\nStep 2: Starting services...\n"
# Only start the services needed for bootstrap transactions.
# yaci-store and yaci-viewer are not required and would block here.
_compose up -d yano postgres uverify-backend
printf "\n"
_wait_url "$YANO_HEALTH" "yano"
printf "  Starting block producer..."
curl -s -X POST http://localhost:7070/api/v1/node/start > /dev/null || true
printf " done.\n"
printf "  Waiting for block producer"
n=0
until curl -sf -X POST http://localhost:7070/api/v1/devnet/epochs/catch-up > /dev/null 2>&1; do
  n=$((n + 1))
  if [ "$n" -ge 60 ]; then
    printf "\n  Timed out waiting for block producer.\n" >&2
    exit 1
  fi
  printf "."
  sleep 2
done
printf " ready, chain advanced.\n"
_wait_url "$BACKEND_HEALTH" "uverify-backend"

# ── Step 3: fund wallets ──────────────────────────────────────────────────────

printf "\nStep 3: Funding wallets...\n"
printf "  Service user: large UTxO + collateral UTxOs..."
for ada in 1000000 20 20 20 5; do
  curl -sf -X POST http://localhost:7070/api/v1/devnet/fund \
    -H "Content-Type: application/json" \
    -d "{\"address\":\"$SERVICE_USER\",\"ada\":\"$ada\"}" > /dev/null
  sleep 1
done
printf " done.\n"

printf "  Faucet address..."
for ada in 1000000 20; do
  curl -sf -X POST http://localhost:7070/api/v1/devnet/fund \
    -H "Content-Type: application/json" \
    -d "{\"address\":\"$FAUCET\",\"ada\":\"$ada\"}" > /dev/null
  sleep 1
done
printf " done.\n"

# Wait for UTxOs to be indexed
sleep 5

# ── Step 4: INIT proxy ────────────────────────────────────────────────────────

printf "\nStep 4: Initialising proxy contract...\n"
printf "  Building INIT transaction..."
INIT_RESPONSE=$(curl -sf -X POST http://localhost:9090/api/v1/transaction/build \
  -H "Content-Type: application/json" \
  -d '{"type":"INIT"}')

UNSIGNED_TX=$(echo "$INIT_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['unsignedProxyTransaction'])")
PROXY_TX_HASH=$(echo "$INIT_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['proxyTxHash'])")
PROXY_OUTPUT_INDEX=$(echo "$INIT_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['proxyOutputIndex'])")

printf " signing..."
SIGNED_TX=$(_sign_tx "$UNSIGNED_TX")
printf " submitting..."
curl -sf -X POST http://localhost:9090/api/v1/transaction/submit \
  -H "Content-Type: application/json" \
  -d "{\"transaction\":\"$SIGNED_TX\",\"witnessSet\":\"\"}" > /dev/null
printf " done.\n"

printf "  Proxy: %s (output %s)\n" "$PROXY_TX_HASH" "$PROXY_OUTPUT_INDEX"

# Update .env with the proxy reference
sed -i.bak "s|^PROXY_TX_HASH=.*|PROXY_TX_HASH=$PROXY_TX_HASH|" "$ENV_FILE"
sed -i.bak "s|^PROXY_OUTPUT_INDEX=.*|PROXY_OUTPUT_INDEX=$PROXY_OUTPUT_INDEX|" "$ENV_FILE"
rm -f "${ENV_FILE}.bak"
printf "  .env updated.\n"

# ── Step 5: restart backend to apply new proxy settings ───────────────────────

printf "\nStep 5: Restarting backend to apply proxy settings...\n"
_compose up -d uverify-backend
_wait_url "$BACKEND_HEALTH" "uverify-backend"

# Allow the INIT tx to be indexed before proceeding
sleep 5

# ── Step 6: deploy proxy library ─────────────────────────────────────────────

printf "\nStep 6: Deploying proxy library...\n"
_build_and_submit "library deploy" \
  http://localhost:9090/api/v1/library/deploy/proxy \
  '{}' \
  "unsignedTransaction"

sleep 5

# ── Step 7: create bootstrap datum ───────────────────────────────────────────

printf "\nStep 7: Creating bootstrap datum...\n"
_build_and_submit "bootstrap datum" \
  http://localhost:9090/api/v1/transaction/build \
  '{
    "type": "BOOTSTRAP",
    "bootstrap_datum": {
      "name": "uverify",
      "whitelisted_addresses": [],
      "fee": 0,
      "fee_interval": 10,
      "fee_receiver_addresses": [],
      "ttl": 2526955802000,
      "transaction_limit": 1000,
      "batch_size": 200
    }
  }' \
  "unsignedTransaction"

sleep 5

# ── Step 8: take snapshot ─────────────────────────────────────────────────────

printf "\nStep 8: Taking snapshot...\n"
curl -s -X DELETE "http://localhost:7070/api/v1/devnet/snapshot/uverify-base-state" > /dev/null 2>&1 || true
curl -sf -X POST http://localhost:7070/api/v1/devnet/snapshot \
  -H "Content-Type: application/json" \
  -d '{"name":"uverify-base-state"}' > /dev/null
printf "  Snapshot taken.\n"

sleep 2

# ── Step 9: copy snapshot files out of the container ─────────────────────────

printf "\nStep 9: Copying snapshot to %s/yano/snapshots/...\n" "$SANDBOX_DIR"
SNAPSHOT_HOST_DIR="$SANDBOX_DIR/yano/snapshots"
SNAPSHOT_TARGET="$SNAPSHOT_HOST_DIR/uverify-base-state"

rm -rf "$SNAPSHOT_TARGET"
mkdir -p "$SNAPSHOT_HOST_DIR"
docker cp "bloxbean-yano:/app/snapshots/uverify-base-state" "$SNAPSHOT_HOST_DIR/"
printf "  Snapshot saved.\n"

# ── Done ──────────────────────────────────────────────────────────────────────

printf "\n=== Bootstrap complete ===\n"
printf "\n"
printf "  PROXY_TX_HASH=%s\n" "$PROXY_TX_HASH"
printf "  PROXY_OUTPUT_INDEX=%s\n" "$PROXY_OUTPUT_INDEX"
printf "\n"
printf "  The .env and snapshot files are up to date.\n"
printf "  Rebuild the yano Docker image to bundle the new snapshot:\n"
printf "\n"
printf "    docker build -t uverify/sandbox-node:latest %s/yano/\n" "$SANDBOX_DIR"
printf "\n"
