# UVerify Python Examples

Runnable Python scripts that demonstrate how to anchor certificates on Cardano
using the [UVerify Python SDK](https://pypi.org/project/uverify-sdk/).

## Prerequisites

- Python 3.8+
- A Cardano wallet library: [PyCardano](https://pycardano.readthedocs.io/) ≥ 0.9.0

```bash
pip install -r requirements.txt
```

## Wallet

Each example looks for a `wallet.txt` file in its own directory.
On first run a fresh 24-word mnemonic is generated, the wallet is funded from
the UVerify testnet faucet, and the phrase is written to `wallet.txt`.
Subsequent runs restore the same wallet.

**Keep `wallet.txt` private — it holds your private key phrase.**

## Running an example

```bash
# from uverify-examples/python/
python examples/diploma/main.py
python examples/digital_product_passport/main.py
python examples/laboratory_report/main.py
python examples/pet_necklace/main.py
python examples/product_verification/main.py
```

## Examples

| Example | Template | Description |
|---------|----------|-------------|
| `diploma` | `diploma` | Batch-issue 3 diplomas for TU Munich graduates |
| `digital_product_passport` | `digitalProductPassport` | Issue a full EU Digital Product Passport |
| `laboratory_report` | `laboratoryReport` | Issue 2 GDPR-safe lab reports with measured values |
| `pet_necklace` | `petNecklace` | Lost-pet necklace with privacy-preserving owner data |
| `product_verification` | `productVerification` | Product authentication certificate with QR-code URL |

## Network

All examples target the **Cardano preprod testnet**.
Verification deep links open at `https://app.preprod.uverify.io/verify/…`.
