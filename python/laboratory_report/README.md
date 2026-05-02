# Laboratory Report

Issues two GDPR-safe laboratory reports on-chain using the UVerify `laboratoryReport` template.
Patient identifiers are hashed before being stored on the blockchain.

## Prerequisites

- Python 3.9+
- [uv](https://docs.astral.sh/uv/getting-started/installation/)

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## Run

```bash
uv run main.py
```

On first run a new wallet is generated, funded from the UVerify testnet faucet, and the mnemonic is saved to `wallet.txt`.
Subsequent runs restore the same wallet.

**Keep `wallet.txt` private — it holds your private key phrase.**

## What it does

1. Creates or restores a wallet from `wallet.txt`.
2. Issues lab reports for two fictitious patients via `client.apps.issue_laboratory_report()`.
3. Waits for on-chain confirmation and prints the verification URL for each report.

## Network

Targets the **Cardano preprod testnet**.
Verification links open at `https://app.preprod.uverify.io/verify/…`.
