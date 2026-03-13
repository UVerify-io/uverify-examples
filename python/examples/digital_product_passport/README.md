# Digital Product Passport Example (Python)

Issues an EU-compliant Digital Product Passport (DPP) for a manufactured product
and anchors it permanently on the Cardano blockchain.

## Core idea

The on-chain hash is `sha256(gtin + serialNumber + runId)`, uniquely identifying
this specific product instance. The serial number is stored as a hash
(`uv_url_serial`) and revealed only via the `?serial=` URL parameter — so the
blockchain never contains the plain serial number.

Material composition keys are prefixed with `mat_`; certification keys with
`cert_` — both are rendered automatically by the `digitalProductPassport`
template.

## What the script does

1. Creates (or restores) a headless Cardano wallet from `wallet.txt`.
2. Funds the wallet from the UVerify testnet faucet on first run.
3. Builds the DPP metadata (sustainability data, materials, certifications).
4. Issues the certificate via `issue_certificates`.
5. Polls until the certificate appears on-chain.
6. Prints the product passport URL.

## Prerequisites

```bash
pip install -r ../../requirements.txt
```

## Run

```bash
# from uverify-examples/python/
python examples/digital_product_passport/main.py
```

## Verification

Open the printed URL in a browser to see the full product passport rendered
by the UVerify certificate page.
