# Digital Product Passport

Issues a Digital Product Passport (DPP) for an electric vehicle on-chain using the UVerify `digitalProductPassport` template.

## Prerequisites

- Java 17+
- [JBang](https://www.jbang.dev/documentation/guide/latest/installation.html)

## Run

```bash
jbang DigitalProductPassport.java
```

On first run a new wallet is generated, funded from the UVerify testnet faucet, and the mnemonic is saved to `wallet.txt`.
Subsequent runs restore the same wallet.

**Keep `wallet.txt` private — it holds your private key phrase.**

## What it does

1. Creates or restores a wallet from `wallet.txt`.
2. Issues a product passport for a fictitious electric vehicle via `client.apps.issueDigitalProductPassport()`.
3. Waits for on-chain confirmation and prints the verification URL.

## Network

Targets the **Cardano preprod testnet**.
Verification links open at `https://app.preprod.uverify.io/verify/…`.
