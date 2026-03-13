# Product Verification Example (Python)

Issues a product authentication certificate anchored on Cardano. The resulting
URL is encoded as a QR code on the product label — scanning it takes the
customer to an immutable, blockchain-verified product page.

## Core idea

The on-chain hash is `sha256(manufacturer + serialNumber + runId)`, uniquely
identifying this product unit. The update policy is `first` — the initial
issuance is permanent and cannot be overwritten.

## What the script does

1. Creates (or restores) a headless Cardano wallet from `wallet.txt`.
2. Funds the wallet from the UVerify testnet faucet on first run.
3. Builds one `CertificateData` with `productVerification` template metadata.
4. Issues the certificate via `issue_certificates`.
5. Polls until the certificate appears on-chain.
6. Prints the product authentication URL to encode as a QR code.

## Prerequisites

```bash
pip install -r ../../requirements.txt
```

## Run

```bash
# from uverify-examples/python/
python examples/product_verification/main.py
```
