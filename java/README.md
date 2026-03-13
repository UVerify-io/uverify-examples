# UVerify Java Examples

Runnable Java programs that demonstrate how to anchor certificates on Cardano
using the [UVerify Java SDK](https://central.sonatype.com/artifact/io.uverify/uverify-sdk).

## Prerequisites

- Java 11+
- Maven 3.8+

```bash
mvn compile
```

## Wallet

Each example looks for a `wallet.txt` file in the working directory.
On first run a fresh 24-word mnemonic is generated, the wallet is funded from
the UVerify testnet faucet, and the phrase is written to `wallet.txt`.
Subsequent runs restore the same wallet.

**Keep `wallet.txt` private — it holds your private key phrase.**

## Running an example

```bash
# Diploma
mvn exec:java -Dexec.mainClass=io.uverify.examples.diploma.DiplomaExample

# Digital Product Passport
mvn exec:java -Dexec.mainClass=io.uverify.examples.digitalproductpassport.DigitalProductPassportExample

# Laboratory Report
mvn exec:java -Dexec.mainClass=io.uverify.examples.laboratoryreport.LaboratoryReportExample

# Pet Necklace
mvn exec:java -Dexec.mainClass=io.uverify.examples.petnecklace.PetNecklaceExample

# Product Verification
mvn exec:java -Dexec.mainClass=io.uverify.examples.productverification.ProductVerificationExample
```

## Examples

| Example | Template | Description |
|---------|----------|-------------|
| `diploma` | `diploma` | Batch-issue 3 diplomas for TU Munich graduates |
| `digitalproductpassport` | `digitalProductPassport` | Issue a full EU Digital Product Passport |
| `laboratoryreport` | `laboratoryReport` | Issue 2 GDPR-safe lab reports with measured values |
| `petnecklace` | `petNecklace` | Lost-pet necklace with privacy-preserving owner data |
| `productverification` | `productVerification` | Product authentication certificate with QR-code URL |

## Network

All examples target the **Cardano preprod testnet**.
Verification deep links open at `https://app.preprod.uverify.io/verify/…`.
