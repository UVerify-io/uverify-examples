# Document Integrity

Anchors the SHA-256 fingerprint of a file on Cardano so anyone with the file can verify it has not been tampered with.
Uses the UVerify `documentIntegrity` template, which renders a drag-and-drop verifier on the verification page.

## Prerequisites

- Python 3.9+
- [uv](https://docs.astral.sh/uv/getting-started/installation/)

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## Run

```bash
uv run main.py
```

On first run a new wallet is generated, funded from the UVerify testnet faucet, and the mnemonic is saved to `wallet.txt`.
Subsequent runs restore the same wallet.

If `sample_thesis.zip` is not present in the working directory, a placeholder file is created automatically.

**Keep `wallet.txt` private — it holds your private key phrase.**

## What it does

1. Creates or restores a wallet from `wallet.txt`.
2. Reads `sample_thesis.zip` (or creates a placeholder) and computes its SHA-256 hash.
3. Issues a certificate via `client.issue_certificates()` with metadata including file size, type, and a description for the verifier.
4. Waits for on-chain confirmation and prints a shareable verification URL.

## Network

Targets the **Cardano preprod testnet**.
Verification links open at `https://app.preprod.uverify.io/verify/…`.
