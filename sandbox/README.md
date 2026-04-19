# UVerify Sandbox

A self-contained local development environment for UVerify backed by a local Cardano devnet.

The sandbox starts from a pre-built chain snapshot that already has the UVerify contracts deployed and funded — no bootstrap required.

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | 24 |

Make sure Docker is running before you start.

---

## Quick start

```bash
# 1 — Clone the repo (if you haven't already)
git clone https://github.com/UVerify-io/uverify-examples.git
cd uverify-examples/sandbox

# 2 — Start the sandbox
docker compose up -d
```

That's it. All services start automatically from the pre-built snapshot.

---

## Service URLs

| Service | URL |
|---------|-----|
| UVerify UI | http://localhost:3000 |
| UVerify Backend | http://localhost:9090 |
| API docs (Swagger) | http://localhost:9090/swagger-ui |
| Yaci Viewer (block explorer) | http://localhost:3001 |
| Yaci Store REST API | http://localhost:8080 |
| Yano devnet API | http://localhost:7070/q/swagger-ui |

---

## How it works

On startup Docker Compose runs the following sequence:

1. **seed-chainstate** — copies the bundled RocksDB snapshot into the `yaci_chainstate` volume (skipped if the volume is already populated)
2. **yano** — starts the local Cardano block producer from the seeded chainstate
3. **postgres** — starts PostgreSQL and creates the `uverify` and `yaci_store` schemas
4. **uverify-backend** — starts the UVerify backend pointed at the local devnet
5. **yaci-store** — starts the chain indexer and syncs forward from the snapshot
6. **yaci-viewer** — starts the block explorer
7. **uverify-ui** — starts the UVerify frontend

---

## Environment configuration

All settings live in `.env`. The most common values you might want to change:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PASSWORD` | `sandbox_password` | PostgreSQL password |
| `FAUCET_MNEMONIC` | `abandon … art` | Devnet faucet wallet |
| `CONNECTED_GOODS_EXTENSION_ENABLED` | `false` | Enable the Connected Goods extension |

> **Warning:** The mnemonic phrases in `.env.example` are publicly known test wallets used only on the local devnet. **Never use them on mainnet or preprod.**

---

## Resetting the sandbox

```bash
# Stop all containers and wipe all persisted data
docker compose down -v

# Start fresh from the snapshot
docker compose up -d
```

The chainstate is automatically re-seeded from the bundled snapshot on the next start.

---

## Troubleshooting

**Port conflict**

If any port is already in use, edit the `ports:` mappings in `docker-compose.yml` and update the corresponding variables in `.env`.

**yaci-store not showing recent transactions**

yaci-store occasionally stops syncing after a prolonged yano disconnection. Restart it:

```bash
docker compose restart yaci-store
```

**View logs for a specific service**

```bash
docker compose logs -f uverify-backend
docker compose logs -f yaci-store
docker compose logs -f yano
```
