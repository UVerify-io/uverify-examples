# Diploma

Issues three university diplomas on-chain using the UVerify `diploma` template.
All certificates are submitted in a single Cardano transaction.

## Prerequisites

- Java 17+
- [JBang](https://www.jbang.dev/documentation/guide/latest/installation.html)

## Run

```bash
jbang Diploma.java
```

On first run a new wallet is generated, funded from the UVerify testnet faucet, and the mnemonic is saved to `wallet.txt`.
Subsequent runs restore the same wallet.

**Keep `wallet.txt` private — it holds your private key phrase.**

## What it does

1. Creates or restores a wallet from `wallet.txt`.
2. Issues diplomas for three fictitious TU Munich graduates via `client.apps.issueDiploma()`.
3. Waits for on-chain confirmation and prints a verification URL for each diploma.

## Network

Targets the **Cardano preprod testnet**.
Verification links open at `https://app.preprod.uverify.io/verify/…`.
