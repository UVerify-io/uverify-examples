# Diploma Example (Python)

Batch-issues three academic diploma certificates for TU Munich graduates in a
single Cardano transaction.

## Core idea

Each graduate's student ID is hashed with SHA-256 to produce the on-chain
fingerprint. The recipient's name is stored as a hash (`uv_url_name`) and
revealed only via the `?name=` URL parameter in the verification link —
so the blockchain never contains plain personal data.

## What the script does

1. Creates (or restores) a headless Cardano wallet from `wallet.txt`.
2. Funds the wallet from the UVerify testnet faucet on first run.
3. Builds three `CertificateData` objects with `diploma` template metadata.
4. Issues all three in a single `issue_certificates` call.
5. Polls until the certificates appear on-chain.
6. Prints verification deep links for each graduate.

## Prerequisites

```bash
pip install -r ../../requirements.txt
```

## Run

```bash
# from uverify-examples/python/
python examples/diploma/main.py
```

## Verification

Open the printed URL in a browser — the UVerify certificate page verifies the
diploma against the Cardano blockchain in real time.
