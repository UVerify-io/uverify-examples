# Certificate of Insurance

Issues a Certificate of Insurance (COI) on-chain using the UVerify `certificateOfInsurance` template.

## Prerequisites

- Java 17+
- [JBang](https://www.jbang.dev/documentation/guide/latest/installation.html)

## Run

```bash
jbang CertificateOfInsurance.java
```

On first run a new wallet is generated, funded from the UVerify testnet faucet, and the mnemonic is saved to `wallet.txt`.
Subsequent runs restore the same wallet.

**Keep `wallet.txt` private — it holds your private key phrase.**

## What it does

1. Creates or restores a wallet from `wallet.txt`.
2. Issues a certificate of insurance for a fictitious general liability policy via `client.apps.issueCertificateOfInsurance()`.
3. Waits for on-chain confirmation and prints the verification URL to share with the certificate holder or auditors.

## Network

Targets the **Cardano preprod testnet**.
Verification links open at `https://app.preprod.uverify.io/verify/…`.
