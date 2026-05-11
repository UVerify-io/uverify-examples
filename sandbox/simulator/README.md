# UVerify Sandbox Simulator

Two Deno scripts for load-testing and exploring the UVerify sandbox:

- **`generate.ts`** — creates batches of metadata files from a field plan
- **`submit.ts`** — submits those files as on-chain certificates and records tx hashes and fees

The easiest way to run the simulator is through `sandbox.py`, which orchestrates both scripts for you.

## Quick start via `sandbox.py`

```bash
# From a plan file (generate then submit)
uv run sandbox.py simulate \
  --template productVerification \
  --plan sandbox/simulator/plan.vin.json \
  --amount 500 \
  --batch-size 5

# Synthetic load test (no plan file needed)
uv run sandbox.py simulate \
  --template productVerification \
  --number 100 \
  --batch-size 10
```

`sandbox.py simulate` options:

| Flag | Required | Description |
|---|---|---|
| `--template` | yes | UVerify template ID (e.g. `productVerification`) |
| `--plan` | one of | Path to a plan JSON file |
| `--number` | one of | Number of synthetic certificates (no plan needed) |
| `--amount` | with `--plan` | Number of metadata files to generate |
| `--batch-size` | no | Certificates per transaction (default: 1) |
| `--output` | no | Directory for generated files (default: `simulator/output`) |

`--plan` and `--number` are mutually exclusive.

## Running the scripts directly

If you prefer to run the Deno scripts manually:

```bash
cd sandbox/simulator

# 1. Copy and edit the example plan
cp plan.example.json plan.json

# 2. Generate metadata files
deno run --allow-read --allow-write generate.ts \
  --data plan.json \
  --amount 500 \
  --destination ./output

# 3. Submit them as certificates (5 per transaction)
deno run -A submit.ts \
  --template productVerification \
  --input ./output \
  --batch-size 5
```

`plan*.json` files are gitignored (except `plan.example.json`), so your custom plans stay local.

## Plan file format

A plan is a JSON object where each key becomes a metadata field and the value describes how to generate it. Copy `plan.example.json` to `plan.json` or `plan.<use-case>.json` and adjust the fields and types for your scenario.

### Field types

#### `static`

Always emits the same value. The `value` can be a `string`, `number`, or `boolean`.

```json
{ "type": "static", "value": "Acme Corp" }
{ "type": "static", "value": 1 }
{ "type": "static", "value": true }
```

#### `random-bool`

Emits `true` or `false` with equal probability.

```json
{ "type": "random-bool" }
```

#### `random-number`

Emits a random integer in `[min, max]` inclusive.

```json
{ "type": "random-number", "range": { "min": 2015, "max": 2025 } }
```

#### `random-string`

Emits a string generated from a regex-like template.

```json
{ "type": "random-string", "regex": "[A-Z]{2}[0-9]{6}-[A-Z]{4}" }
```

Supported syntax:

| Token | Meaning |
|---|---|
| `[A-Z]` `[0-9]` `[abc]` | Character class with ranges or literals |
| `.` | Any alphanumeric character |
| `{n}` | Repeat exactly n times |
| `{n,m}` | Repeat between n and m times (random) |
| `+` | One or more (up to 10) |
| `*` | Zero or more (up to 9) |
| literal | Emitted as-is (e.g. the `-` in `[A-Z]{2}-[0-9]{4}`) |

#### `one-of`

Samples uniformly from a fixed list of values.

```json
{ "type": "one-of", "values": ["active", "pending", "archived"] }
```

## `generate.ts` options

| Flag | Required | Description |
|---|---|---|
| `--data` | yes | Path to the plan JSON file |
| `--amount` | yes | Number of metadata files to generate |
| `--destination` | yes | Output directory (created if missing) |

Each output file is named by the SHA-256 of its JSON content. Files with identical content are de-duplicated automatically.

## `submit.ts` options

| Flag | Required | Description |
|---|---|---|
| `--template` | yes | UVerify template ID (e.g. `productVerification`) |
| `--input` | one of | Directory of pre-generated metadata files |
| `--number` | one of | Generate N synthetic certificates on the fly |
| `--batch-size` | no | Certificates per transaction (default: 1) |

`--input` and `--number` are mutually exclusive.

### Wallet and faucet

On first run a wallet mnemonic is generated and saved to `wallet.txt`. The sandbox faucet is called automatically to fund it. Keep `wallet.txt` safe — subsequent runs reuse the same wallet.

### Re-entrancy

`submit.ts` writes `results.json` after every confirmed transaction. If a run is interrupted, re-running the same command skips already-submitted certificate hashes and picks up where it left off.

### Output — `results.json`

```json
{
  "summary": {
    "totalTransactions": 10,
    "totalCertificates": 50,
    "totalFeeLovelace": 2500000,
    "totalFeeAda": 2.5
  },
  "transactions": [
    {
      "txHash": "abc123…",
      "certHashes": ["def456…", "…"],
      "feeLovelace": 250000,
      "feeAda": 0.25
    }
  ]
}
```
