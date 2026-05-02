# Tokenizable Certificate

Issues a tokenizable certificate on Cardano — a certificate that can later be redeemed as a CIP-68 NFT pair by the designated recipient.

## Prerequisites

- Java 17+
- [JBang](https://www.jbang.dev/documentation/guide/latest/installation.html)

## Run

### Create a certificate

```bash
jbang TokenizableCertificate.java create \
  --asset-name "MyDiploma2025" \
  --document-text "Alice Smith completed the Advanced Blockchain course." \
  --issuer-name "TU Munich" \
  --description "Blockchain course completion certificate" \
  --init-utxo-tx-hash <tx-hash> \
  --init-utxo-output-index <index>
```

The `--init-utxo-tx-hash` and `--init-utxo-output-index` flags are required on the first run.
Find a UTxO in your issuer wallet via the Yaci chain viewer at `http://localhost:3001`.
Once provided, the coordinates are saved to `seed_utxo.txt` and reused automatically.

You may also pass `--document-path <path>` instead of `--document-text` to certify a file.

### Redeem (mint the NFT)

After `create` prints the redeem command, run it:

```bash
jbang TokenizableCertificate.java redeem \
  --asset-name "MyDiploma2025" \
  --key <sha256-hex-from-create>
```

## Wallets

| File | Purpose |
|---|---|
| `wallet.txt` | Issuer wallet — signs and pays for the create transaction |
| `recipient_wallet.txt` | Recipient wallet — receives the NFT on redeem |
| `seed_utxo.txt` | Saved seed UTxO coordinates (written after first `--init-utxo-*` flags) |

On first run both wallets are generated, funded, and saved automatically.

**Keep these files private — they hold private key phrases.**

## Options

| Flag | Required | Description |
|---|---|---|
| `--asset-name` | Yes | Base name for the NFT asset (UTF-8) |
| `--document-text` | create only | Plain text to certify (mutually exclusive with `--document-path`) |
| `--document-path` | create only | Path to a file to certify (mutually exclusive with `--document-text`) |
| `--key` | redeem only | SHA-256 hash printed by the create command |
| `--recipient-wallet` | No | Bech32 address to receive the NFT (defaults to managed recipient wallet) |
| `--init-utxo-tx-hash` | First create | Tx hash of the one-shot seed UTxO |
| `--init-utxo-output-index` | First create | Output index of the seed UTxO |
| `--issuer-name` | No | Issuer name stored in certificate metadata |
| `--description` | No | Description stored in certificate metadata |
| `--asset-class` | No | Asset class stored in certificate metadata |
| `--ipfs-image` | No | IPFS CID of the NFT image |

## Network

Targets the **Cardano preprod testnet**.
Verification links open at `https://app.preprod.uverify.io/verify/…`.
