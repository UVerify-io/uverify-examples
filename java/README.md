# UVerify Java Examples

Runnable Java programs that demonstrate how to anchor certificates on Cardano
using the [UVerify Java SDK](https://central.sonatype.com/artifact/io.uverify/uverify-sdk).

Each example is a self-contained [JBang](https://www.jbang.dev) script. No build system required.

## Prerequisites

- Java 17+
- [JBang](https://www.jbang.dev/documentation/guide/latest/installation.html)

```bash
# macOS / Linux (via SDKMan)
sdk install jbang

# macOS (via Homebrew)
brew install jbang
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
jbang Diploma.java
```

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
