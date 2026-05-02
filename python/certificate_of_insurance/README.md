# Certificate of Insurance

Issues a Certificate of Insurance (COI) on-chain using the UVerify `certificateOfInsurance` template.

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
2. Issues a certificate of insurance for a fictitious general liability policy via `client.apps.issue_certificate_of_insurance()`.
3. Waits for on-chain confirmation and prints the verification URL to share with the certificate holder or auditors.

## Network

Targets the **Cardano preprod testnet**.
Verification links open at `https://app.preprod.uverify.io/verify/…`.
