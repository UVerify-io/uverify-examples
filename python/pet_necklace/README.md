# Pet Necklace

Issues lost-pet necklace certificates on-chain using the UVerify `petNecklace` template.
The owner's phone number is hashed before being stored, so the blockchain record is privacy-preserving.

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
2. Issues certificates for two fictitious pets via `client.issue_certificates()`.
3. Waits for on-chain confirmation and prints the NFC/QR verification URL to encode on each necklace tag.

## Network

Targets the **Cardano preprod testnet**.
Verification links open at `https://app.preprod.uverify.io/verify/…`.
