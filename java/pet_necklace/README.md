# Pet Necklace

Issues a lost-pet necklace certificate on-chain using the UVerify `petNecklace` template.
The owner's phone number is hashed before being stored, so the blockchain record is privacy-preserving.

## Prerequisites

- Java 17+
- [JBang](https://www.jbang.dev/documentation/guide/latest/installation.html)

## Run

```bash
jbang PetNecklace.java
```

On first run a new wallet is generated, funded from the UVerify testnet faucet, and the mnemonic is saved to `wallet.txt`.
Subsequent runs restore the same wallet.

**Keep `wallet.txt` private — it holds your private key phrase.**

## What it does

1. Creates or restores a wallet from `wallet.txt`.
2. Issues a certificate for a fictitious pet (Buddy the Golden Retriever) via `client.issueCertificates()`.
3. Waits for on-chain confirmation and prints the NFC/QR verification URL to encode on the necklace tag.

## Network

Targets the **Cardano preprod testnet**.
Verification links open at `https://app.preprod.uverify.io/verify/…`.
