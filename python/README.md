# UVerify Python Examples

Runnable Python scripts that demonstrate how to anchor certificates on Cardano
using the [UVerify Python SDK](https://pypi.org/project/uverify-sdk/).

Each example is a self-contained script using [PEP 723 inline metadata](https://peps.python.org/pep-0723/). No virtual environment or `pip install` required.

## Prerequisites

- Python 3.9+
- [uv](https://docs.astral.sh/uv/getting-started/installation/)

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## Sandbox

Start the local sandbox before running examples against it:

```bash
cd ..
./sandbox.sh start
```

See the [sandbox README](../README.md#sandbox) for details.

## Running an example

```bash
cd diploma
uv run main.py
```

`uv` reads the dependency list embedded at the top of each script and installs everything automatically.

Each example looks for a `wallet.txt` file in the working directory.
On first run a fresh 24-word mnemonic is generated, the wallet is funded from
the UVerify testnet faucet, and the phrase is written to `wallet.txt`.
Subsequent runs restore the same wallet.

**Keep `wallet.txt` private — it holds your private key phrase.**

## Examples

| Directory | Description |
|---|---|
| [`diploma/`](diploma/) | Batch-issue 3 diplomas for TU Munich graduates |
| [`digital_product_passport/`](digital_product_passport/) | Issue a full EU Digital Product Passport for an EV |
| [`laboratory_report/`](laboratory_report/) | Issue 2 GDPR-safe lab reports with measured values |
| [`certificate_of_insurance/`](certificate_of_insurance/) | Issue a Certificate of Insurance with coverage details |
| [`pet_necklace/`](pet_necklace/) | Lost-pet necklace with privacy-preserving owner data |
| [`product_verification/`](product_verification/) | Product authentication certificate with QR-code URL |
| [`notary/`](notary/) | Certify a file, a service agreement, and song lyrics |
| [`document_integrity/`](document_integrity/) | Anchor a file hash with a drag-and-drop verifier |
| [`tokenizable_certificate/`](tokenizable_certificate/) | Issue a certificate redeemable as a CIP-68 NFT pair |

## Network

All examples target the **Cardano preprod testnet**.
Verification deep links open at `https://app.preprod.uverify.io/verify/…`.
