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

- Node.js 20+
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
on-chain linked list. The script resolves this in order of priority:

1. `--init-utxo-tx-hash` and `--init-utxo-output-index` CLI flags (explicit override).
2. `tokenizable_certificate_seed_utxo.txt` — written on the first successful auto-detection
   and reused on every subsequent run.
3. Auto-detection: picks the first UTxO from the issuer wallet and saves it to
   `tokenizable_certificate_seed_utxo.txt`.

## Run

```bash
cd uverify-examples/typescript
npm install
```

### Step 1 — Issue a certificate (`create`)

```bash
npm run tokenizable_certificate -- create \
  --asset-name "1g Gold Bar" \
  --document-text "1g of Gold" \
  --issuer-name "Acme Refinery" \
  --description "Certified 1g fine gold bar, serial #AU-00042" \
  --asset-class "Commodity"
```

Or certify a file instead of inline text:

```bash
npm run tokenizable_certificate -- create \
  --asset-name "1g Gold Bar" \
  --document-path "./assay_certificate.pdf" \
  --issuer-name "Acme Refinery"
```

`--recipient-wallet` is optional. When omitted the script uses the address of the managed
`recipient_wallet.txt` (creating and funding it on first run). The script prints the exact
`redeem` command to run after issuance.

### Step 2 — Redeem the certificate (`redeem`)

```bash
npm run tokenizable_certificate -- redeem \
  --asset-name "1g Gold Bar" \
  --key "<sha256-hash-printed-during-create>"
```

The managed `recipient_wallet.txt` signs the claim transaction automatically. If the
recipient wallet has no funds it will be funded automatically before the redeem.

After redemption the linked-list node is updated and the certificate status changes to "redeemed".

## All flags

| Flag | Required | Description |
|---|---|---|
| `--asset-name` | Yes (both) | Human-readable asset name — converted to hex for the on-chain token name. |
| `--document-text` | create only† | Document content to certify — SHA-256 hashed to produce the on-chain key. |
| `--document-path` | create only† | Path to a file to certify — bytes SHA-256 hashed on-chain. |
| `--key` | Yes (redeem) | SHA-256 key printed during `create`. |
| `--recipient-wallet` | No (both) | Bech32 address of the recipient. Defaults to the managed `recipient_wallet.txt`. |
| `--issuer-name` | No (create) | Issuing organisation or individual — stored as certificate metadata. |
| `--description` | No (create) | Description of the certified asset — stored as certificate metadata. |
| `--asset-class` | No (create) | Category (e.g. Commodity, Art, Real Estate) — stored as certificate metadata. |
| `--ipfs-image` | No (create) | IPFS CID of an asset image shown in the certificate UI. |
| `--init-utxo-tx-hash` | No | Override the Init UTxO transaction hash. |
| `--init-utxo-output-index` | No | Override the Init UTxO output index. |

† `--document-text` and `--document-path` are mutually exclusive; exactly one is required for `create`.

## What the script does

### `create`

1. Loads or creates the **issuer** wallet (`wallet.txt`), funding it on first run.
2. Loads or creates the **recipient** wallet (`recipient_wallet.txt`), funding it on first run.
3. Extracts the `ownerPubKeyHash` directly from `--recipient-wallet` (no manual look-up required).
4. Resolves or auto-detects the Init UTxO, saving it to `tokenizable_certificate_seed_utxo.txt`.
5. SHA-256 hashes the document (text or file bytes) to produce the on-chain key.
6. Builds a `certificate` object containing the hash and a metadata JSON with any supplied
   fields (`asset_name`, `issuer_name`, `description`, `asset_class`, `ipfs_image`). The
   backend merges this with the template ID, minting policy ID, and Init UTxO coordinates.
7. Calls `issueTokenizableCertificate` — builds, signs, and submits the insert transaction.
8. Waits for on-chain confirmation, prints the verification URL, and queries the certificate status.

### `redeem`

1. Loads the **recipient** wallet (`recipient_wallet.txt`) as the claimer.
2. Resolves the Init UTxO (same priority order as above).
3. Calls `redeemTokenizableCertificate` — the recipient wallet signs and submits the claim.
4. Waits for on-chain confirmation and prints the final certificate status.

## Verification

Open the verification URL printed after `create` in any browser. No wallet or account required.

To verify programmatically:

```bash
curl "https://api.preprod.uverify.io/api/v1/extension/tokenizable-certificate/status/<key>?initUtxoTxHash=<hash>&initUtxoOutputIndex=<idx>"
```
