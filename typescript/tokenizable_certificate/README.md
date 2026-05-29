# Tokenizable Certificate Example

This example shows how to issue and redeem a tokenizable certificate. It's an on-chain entry
like a regular UVerify certificate, but also inserts an item into a sorted linked list that
allows a whitelisted recipient to mint a CIP-68 NFT pair.

## The core idea

Unlike a standard UVerify certificate that is a plain on-chain record, a tokenizable
certificate mints a CIP-68 **user token** (label-222) for the recipient and a matching
**reference token** (label-100) locked in the contract. This makes the certificate
*transferable* and *redeemable*:

- The holder can prove ownership by holding the user NFT, which represents a real-world certificate.
- They can redeem the certificate (burn the user token) to remove the linked-list node from the contract.

This is useful for:

- **Event tickets** — attendees hold a verifiable certificate of attendance that they can redeem for an NFT souvenir.
- **Conditional access** — users receive a certificate after completing a task (e.g. KYC, course completion) that they can redeem for an access token.
- **Physical asset ownership** — buyers receive a certificate of ownership that they can redeem for a transferable token representing the asset.

## Prerequisites

- [Deno](https://deno.com) 2+
- A UVerify backend running with `TOKENIZABLE_CERTIFICATE_EXTENSION_ENABLED=true`
  (on preprod this is enabled by default).

## Wallets

The script manages **two wallets** automatically:

| File | Role |
|---|---|
| `wallet.txt` | Issuer — pays fees and signs the issuance transaction. |
| `recipient_wallet.txt` | Recipient — receives the CIP-68 user NFT and signs the redeem transaction. |

Both are created and funded via the UVerify dev faucet on first run. Mnemonics are saved
locally — keep these files safe.

## Seed UTxO

The tokenizable certificate contract requires a unique **Init UTxO** to bootstrap the
on-chain linked list. You must supply the Init UTxO on the first run via CLI flags. Find a
UTxO in your issuer wallet using the Yaci chain viewer at `http://localhost:3001` after the
issuer wallet is funded.

The resolved UTxO is saved to `seed_utxo.txt` and reused on every subsequent run. Pass
`--init-utxo-tx-hash` and `--init-utxo-output-index` again to override it.

## Run

### Step 1 — Issue a certificate (`create`)

```bash
cd uverify-examples/typescript/tokenizable_certificate

# using a plan file (recommended)
deno run -A index.ts create \
  --plan example.tokenizable.plan \
  --init-utxo-tx-hash <tx-hash> \
  --init-utxo-output-index <index>

# or pass all fields as CLI flags
deno run -A index.ts create \
  --asset-name "1g Gold Bar" \
  --document-text "1g of Gold" \
  --init-utxo-tx-hash <tx-hash> \
  --init-utxo-output-index <index> \
  --issuer-name "Acme Refinery" \
  --description "Certified 1g fine gold bar, serial #AU-00042" \
  --asset-class "Commodity"
```

Issue multiple certificates in sequence with `--number N`:

```bash
deno run -A index.ts create \
  --plan example.tokenizable.plan \
  --number 3 \
  --init-utxo-tx-hash <tx-hash> \
  --init-utxo-output-index <index>
```

`--recipient-wallet` is optional. When omitted the script uses the address of the managed
`recipient_wallet.txt` (creating and funding it on first run). The script prints the exact
`redeem` command to run after issuance.

### Step 2 — Redeem the certificate (`redeem`)

```bash
deno run -A index.ts redeem \
  --asset-name "1g Gold Bar" \
  --key "<sha256-hash-printed-during-create>"
```

The managed `recipient_wallet.txt` signs the claim transaction automatically.

After redemption the linked-list node is updated and the certificate status changes to "redeemed".

## Plan files

Certificate data for the `create` command is defined in a JSON plan file using the same
field-def format as the sandbox simulator (`sandbox/simulator/generate.ts`). Plan fields:

| Field | Description |
|---|---|
| `assetName` | Human-readable asset name — converted to hex for the on-chain token |
| `documentText` | Document content to certify — SHA-256 hashed to produce the on-chain key |
| `issuerName` | Issuing organisation or individual (stored as metadata) |
| `description` | Description of the certified asset (stored as metadata) |
| `assetClass` | Category e.g. Commodity, Art, Real Estate (stored as metadata) |
| `ipfsImage` | IPFS CID of an asset image shown in the certificate UI (stored as metadata) |

CLI flags override plan values when both are provided. `--document-path` (file to certify)
can be used instead of the plan's `documentText` field.

`example.tokenizable.plan` ships with the example:

```json
{
  "assetName":    { "type": "static", "value": "1g Gold Bar" },
  "documentText": { "type": "static", "value": "1g of fine gold, serial #AU-00042" },
  "issuerName":   { "type": "static", "value": "Acme Refinery" },
  "description":  { "type": "static", "value": "Certified 1g fine gold bar, serial #AU-00042" },
  "assetClass":   { "type": "static", "value": "Commodity" }
}
```

## All flags

| Flag | Command | Description |
|---|---|---|
| `--plan` | create | Path to a plan JSON file. Provides default values for all data fields. |
| `--number` | create | Issue N certificates in N transactions (default: 1). |
| `--asset-name` | both | Human-readable asset name. |
| `--document-text` | create | Document content — SHA-256 hashed to produce the on-chain key. |
| `--document-path` | create | Path to a file — bytes SHA-256 hashed on-chain. |
| `--key` | redeem | SHA-256 key printed during `create`. |
| `--recipient-wallet` | both | Bech32 address of the recipient. Defaults to managed `recipient_wallet.txt`. |
| `--issuer-name` | create | Issuing organisation or individual — stored as certificate metadata. |
| `--description` | create | Description of the certified asset — stored as certificate metadata. |
| `--asset-class` | create | Category (e.g. Commodity, Art, Real Estate) — stored as certificate metadata. |
| `--ipfs-image` | create | IPFS CID of an asset image shown in the certificate UI. |
| `--init-utxo-tx-hash` | both | Override the Init UTxO transaction hash (required on first run). |
| `--init-utxo-output-index` | both | Override the Init UTxO output index (required on first run). |

## What the script does

### `create`

1. Loads or creates the **issuer** wallet (`wallet.txt`), funding it on first run.
2. Loads or creates the **recipient** wallet (`recipient_wallet.txt`), funding it on first run.
3. Resolves the Init UTxO from CLI flags or `seed_utxo.txt`.
4. Evaluates the plan file (if `--plan` is provided) and merges with CLI flags.
5. SHA-256 hashes the document (text or file bytes) to produce the on-chain key.
6. Calls `issueTokenizableCertificate` — builds, signs, and submits the insert transaction.
7. Waits for on-chain confirmation, prints the verification URL, and queries the certificate status.

### `redeem`

1. Loads the **recipient** wallet (`recipient_wallet.txt`) as the claimer.
2. Resolves the Init UTxO from CLI flags or `seed_utxo.txt`.
3. Calls `redeemTokenizableCertificate` — the recipient wallet signs and submits the claim.
4. Waits for on-chain confirmation and prints the final certificate status.

## Verification

Open the verification URL printed after `create` in any browser. No wallet or account required.

To verify programmatically:

```bash
curl "https://api.preprod.uverify.io/api/v1/extension/tokenizable-certificate/status/<key>?initUtxoTxHash=<hash>&initUtxoOutputIndex=<idx>"
```
