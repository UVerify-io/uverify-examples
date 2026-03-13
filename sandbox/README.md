# UVerify Sandbox

A self-contained local development environment for UVerify, built on top of [YACI DevKit](https://github.com/bloxbean/yaci-devkit) — a Docker-based Cardano devnet.

Running `./start.sh` automatically:

1. Starts a local Cardano devnet (YACI DevKit) + PostgreSQL
2. Starts the UVerify backend (pointed at the devnet)
3. Funds the service wallet from the devnet faucet
4. Initialises the proxy contract (INIT transaction)
5. Deploys the UVerify library contracts
6. Starts the UVerify UI

No real ADA or Cardano keys are required — everything runs locally.

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | 24 |
| [Node.js](https://nodejs.org/) | 20 |
| npm | 9 |

Make sure Docker is running before you start.

---

## Quick start

```bash
# 1 — Clone the repo (if you haven't already)
git clone https://github.com/UVerify-io/uverify-examples.git
cd uverify-examples/sandbox

# 2 — Copy the environment file
cp .env.example .env

# 3 — Run the sandbox
./start.sh
```

The first run takes a few minutes while Docker pulls images and the bootstrap
script initialises the chain. Subsequent runs are much faster:

```bash
./start.sh --no-bootstrap   # skip bootstrap when already initialised
```

---

## Service URLs

| Service | URL |
|---------|-----|
| UVerify UI | http://localhost:3000 |
| UVerify Backend | http://localhost:9090 |
| API docs (Swagger) | http://localhost:9090/swagger-ui |
| YACI DevKit admin | http://localhost:10000 |
| YACI Store REST API | http://localhost:8090 |
| Ogmios WebSocket | ws://localhost:1337 |

---

## Running examples against the sandbox

Set the following environment variables before running any example:

```bash
export UVERIFY_BASE_URL=http://localhost:9090
export VERIFY_BASE_URL=http://localhost:3000/verify
```

Or set them inline:

```bash
UVERIFY_BASE_URL=http://localhost:9090 npm run your-example
```

---

## Environment configuration

All settings live in `.env` (generated from `.env.example` on first run).
The most common values you might want to change are:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PASSWORD` | `sandbox_password` | PostgreSQL password |
| `SERVICE_ACCOUNT_MNEMONIC` | (test phrase) | Pays for INIT + library deploy |
| `FAUCET_MNEMONIC` | `abandon … art` | Backend faucet wallet |
| `CONNECTED_GOODS_EXTENSION_ENABLED` | `false` | Enable the Connected Goods extension |

> **Warning:** The mnemonic phrases in `.env.example` are publicly known
> test wallets used only on the local devnet. **Never use them on mainnet or preprod.**

Values that are managed automatically by the bootstrap script and should not
be edited by hand:

- `SERVICE_USER_ADDRESS` — derived from `SERVICE_ACCOUNT_MNEMONIC`
- `PROXY_TX_HASH` / `PROXY_OUTPUT_INDEX` — set after the INIT transaction

---

## What the bootstrap does

The `bootstrap/src/bootstrap.ts` script runs once per clean environment:

1. **Derive addresses** — derives the service and (optional) faucet wallet
   addresses from their mnemonics using Mesh.js.
2. **Fund wallets** — calls the YACI DevKit faucet API to top up the wallets
   with devnet ADA.
3. **INIT proxy** — calls `POST /api/v1/transaction/build` (`type: INIT`),
   signs the returned unsigned CBOR with Mesh.js, and submits it.
4. **Update `.env`** — writes `PROXY_TX_HASH` and `PROXY_OUTPUT_INDEX` and
   restarts the backend container so it picks up the new values.
5. **Deploy library** — calls `POST /api/v1/library/deploy/proxy`, signs and
   submits the library deploy transaction.

---

## Resetting the sandbox

```bash
# Stop containers and wipe all persisted data (chain state + DB)
docker compose down -v

# Remove the generated .env so bootstrap runs again on the next start
rm -f .env
```

Then run `./start.sh` again for a clean slate.

---

## Troubleshooting

**`./start.sh` fails with "permission denied"**

```bash
chmod +x start.sh
```

**Bootstrap fails with "YACI DevKit did not become ready"**

The devnet container can take 60–90 s on the first pull. If it times out,
check the container logs:

```bash
docker compose logs yaci-devkit
```

**Backend fails to connect to the devnet after restart**

Make sure `application-devnet.yml` is present in the `sandbox/` directory. It
is mounted into the backend container and activates the `devnet` Spring profile
which overrides the chain sync settings (start slot = 0, protocol magic = 42).

**`PROXY_TX_HASH` is set but the bootstrap runs anyway**

Add `--no-bootstrap` to skip the check entirely:

```bash
./start.sh --no-bootstrap
```

**Transaction confirmation timeout**

The YACI devnet produces a block roughly every 5 seconds. If confirmation
polling times out (90 attempts × 3 s = 4.5 min), check whether the backend is
still connected to the devnet:

```bash
docker compose logs uverify-backend | tail -50
```

**Port conflict**

If any port is already in use, edit the `ports:` mappings in
`docker-compose.yml` and update the corresponding variables in `.env`
(e.g. change `BLOCKFROST_BASE_URL` if you remap port 8090).
