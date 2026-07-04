# UVerify Sandbox

A self-contained local development environment for UVerify backed by a local Cardano devnet.

The sandbox starts from a pre-built chain snapshot that already has the UVerify contracts deployed and funded — no bootstrap required.

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | 24 |
| [uv](https://docs.astral.sh/uv/) | any recent |

Make sure Docker is running before you start. `uv` installs the CLI dependencies automatically on first run.

Optional: [Deno](https://deno.com) 2+ for the [simulator](simulator/README.md) and Node.js 18+ for scaffolding custom UI templates.

---

## Quick start

```bash
# 1 — Clone the repo (if you haven't already)
git clone https://github.com/UVerify-io/uverify-examples.git
cd uverify-examples

# 2 — Start the sandbox
uv run sandbox.py start
```

That's it. All services start automatically from the pre-built snapshot.

---

## Commands

| Command | Description |
|---------|-------------|
| `uv run sandbox.py start` | Start all sandbox services |
| `uv run sandbox.py start --clean` | Wipe all data and start fresh from the snapshot |
| `uv run sandbox.py start --keria` | Also start the KERI identity stack (witnesses, vLEI server, KERIA agent, vLEI verifier) |
| `uv run sandbox.py stop` | Stop all sandbox services |
| `uv run sandbox.py restart [--keria]` | Restart all sandbox services |
| `uv run sandbox.py info` | Show service status and URLs |
| `uv run sandbox.py templates` | List registered custom UI templates |
| `uv run sandbox.py template add <Name>` | Scaffold and register a custom UI template |
| `uv run sandbox.py template rm <name>` | Remove a custom UI template |
| `uv run sandbox.py simulate …` | Generate and submit certificates in bulk, recording fees (see [simulator/README.md](simulator/README.md)) |

---

## Service URLs

| Service | URL |
|---------|-----|
| UVerify UI | http://localhost:3000 |
| UVerify Backend | http://localhost:9090 |
| API docs (Swagger) | http://localhost:9090/swagger-ui/index.html |
| Yaci Viewer (block explorer) | http://localhost:3001 |
| Yaci Store REST API | http://localhost:8080 |
| Yaci Store (Swagger) | http://localhost:8080/swagger-ui/index.html |
| Yano devnet API | http://localhost:7070/q/swagger-ui |

With `--keria` these are added:

| Service | URL |
|---------|-----|
| KERIA admin API | http://localhost:3901 |
| vLEI Verifier | http://localhost:7676 |
| vLEI Server | http://localhost:7723 |

---

## How it works

`uv run sandbox.py start` runs the following sequence:

1. If the chainstate volume is not yet populated, seeds it from the RocksDB snapshot (see below)
2. Starts all Docker Compose services
3. Waits for the yano block producer to be ready
4. Advances the devnet chain to wall-clock time (KES catch-up)

This means the sandbox works correctly regardless of how long ago the snapshot was taken.


---

## Environment configuration

All settings live in `.env`. The most common values you might want to change:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PASSWORD` | `sandbox_password` | PostgreSQL password |
| `FAUCET_MNEMONIC` | `abandon … art` | Devnet faucet wallet |
| `CONNECTED_GOODS_EXTENSION_ENABLED` | `false` | Enable the Connected Goods extension |

> **Warning:** The mnemonic phrases in `.env` are publicly known test wallets used only on the local devnet. **Never use them on mainnet or preprod.**

---

## Custom UI templates

```bash
uv run sandbox.py template add MyBadge   # scaffold + register
uv run sandbox.py restart                # rebuild the UI with the template
```

Template sources live in `sandbox/custom-ui-templates/` and are mounted into the UI builder container.

---

## Resetting the sandbox

```bash
uv run sandbox.py start --clean
```

This stops all services, wipes all persisted data (chainstate, PostgreSQL, indexes), and starts fresh from the bundled snapshot.

---

## Troubleshooting

**Port conflict**

If any port is already in use, edit the `ports:` mappings in `docker-compose.yml` and update the corresponding variables in `.env`.

**yaci-store not showing recent transactions**

yaci-store occasionally stops syncing after a prolonged yano disconnection. Restart it:

```bash
docker compose -f sandbox/docker-compose.yml restart yaci-store
```

**View logs for a specific service**

```bash
docker compose -f sandbox/docker-compose.yml logs -f uverify-backend
docker compose -f sandbox/docker-compose.yml logs -f yaci-store
docker compose -f sandbox/docker-compose.yml logs -f yano
```
