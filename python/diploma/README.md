# Diploma

Issues three university diplomas on-chain using the UVerify `diploma` template.
All certificates are submitted in a single Cardano transaction.

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

`uv` reads the dependency list embedded at the top of the script and installs everything automatically.
No virtual environment setup or `pip install` required.

On first run a new wallet is generated, funded from the UVerify testnet faucet, and the mnemonic is saved to `wallet.txt`.
Subsequent runs restore the same wallet.

**Keep `wallet.txt` private — it holds your private key phrase.**

## What it does

1. Creates or restores a wallet from `wallet.txt`.
2. Issues diplomas for three fictitious TU Munich graduates via `client.apps.issue_diploma()`.
3. Waits for on-chain confirmation and prints a verification URL for each diploma.

## Network

Targets the **Cardano preprod testnet**.
Verification links open at `https://app.preprod.uverify.io/verify/…`.
