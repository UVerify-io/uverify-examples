# Notary

Anchors three different content types on Cardano in a single session:

- A file (`sample_document.txt`) — certifies the SHA-256 hash of arbitrary binary content.
- A service agreement — certifies a dynamically generated contract text block.
- Song lyrics — certifies creative work to establish a timestamped proof of existence.

## Prerequisites

- Java 17+
- [JBang](https://www.jbang.dev/documentation/guide/latest/installation.html)

## Run

```bash
jbang Notary.java
```

On first run a new wallet is generated, funded from the UVerify testnet faucet, and the mnemonic is saved to `wallet.txt`.
Subsequent runs restore the same wallet.

If `sample_document.txt` is not present in the working directory, a placeholder file is created automatically.

**Keep `wallet.txt` private — it holds your private key phrase.**

## What it does

1. Creates or restores a wallet from `wallet.txt`.
2. Certifies `sample_document.txt` via `client.issueCertificates()` and prints the verification URL.
3. Certifies a service agreement text block and prints its verification URL.
4. Certifies song lyrics and prints the verification URL.

## Network

Targets the **Cardano preprod testnet**.
Verification links open at `https://app.preprod.uverify.io/verify/…`.
