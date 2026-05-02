# Product Verification

Issues a product authentication certificate on-chain using the UVerify `productVerification` template.
The resulting verification URL can be encoded as a QR code on the product label.

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
2. Builds a SHA-256 fingerprint from the manufacturer, serial number, and a random run ID.
3. Issues a product authentication certificate via `client.issue_certificates()`.
4. Waits for on-chain confirmation and prints the QR-code URL for the product label.

## Network

Targets the **Cardano preprod testnet**.
Verification links open at `https://app.preprod.uverify.io/verify/…`.
