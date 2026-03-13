# Pet Necklace Example (Python)

Issues lost-pet necklace certificates for two pets. When a finder taps the NFC
chip and opens the URL, the owner's name and phone number are revealed — but
only the hash is stored on the blockchain (GDPR-safe).

## Core idea

The on-chain hash is `sha256(petName + phone + runId)`. The owner's name and
phone number are stored as hashes (`uv_url_owner_name`, `uv_url_phone`) and
revealed only via the `?owner_name=` and `?phone=` URL parameters.

The update policy is `restricted` so the issuer wallet can push updates
(e.g. a new phone number) without anyone else being able to overwrite the
record.

## What the script does

1. Creates (or restores) a headless Cardano wallet from `wallet.txt`.
2. Funds the wallet from the UVerify testnet faucet on first run.
3. Builds two `CertificateData` objects with `petNecklace` template metadata.
4. Issues both in a single `issue_certificates` call.
5. Polls until the certificates appear on-chain.
6. Prints QR-code URLs to encode on each necklace tag.

## Prerequisites

```bash
pip install -r ../../requirements.txt
```

## Run

```bash
# from uverify-examples/python/
python examples/pet_necklace/main.py
```
