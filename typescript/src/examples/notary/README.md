# Notary Example

This example shows how to use UVerify to create tamper-proof, blockchain-anchored
proofs of existence for any digital content — without storing the content itself on-chain.

## The core idea

You hash your document (file, text, image, …) with SHA-256 and record that fingerprint
permanently on the Cardano blockchain. The document never leaves your hands, but anyone
who later holds the same file can recompute the hash and check whether it was registered
on-chain — and when.

This makes it ideal for:

- **Legal contracts** — prove that a contract existed in a specific form on a specific date,
  before any dispute arose.
- **Creative works** — establish authorship priority for song lyrics, manuscripts, or art
  without filing a formal copyright registration.
- **Documents and certificates** — anchor any PDF, image, or structured document so its
  authenticity can be verified independently by anyone.

## What the script does

1. **Wallet** — On the first run a new preprod wallet is created and its mnemonic is saved to
   `wallet.txt`. The wallet is funded automatically via the UVerify dev faucet. On every
   subsequent run the wallet is restored from `wallet.txt` and the faucet step is skipped.

2. **File** — Reads `sample_document.txt` from disk, hashes its bytes with SHA-256, and
   records the hash on-chain. Replace `sample_document.txt` with any file you like — a PDF,
   an image, an audio file — the script hashes raw bytes so the format does not matter.

3. **Legal contract** — Hashes a sample service agreement (plain text) and records it with
   metadata: `contract_type`, a UUID `contract_id`, and the current date. In a real workflow
   you would replace the template with the actual signed contract text.

4. **Song lyrics** — Hashes an original song text and records it with metadata: `genre`,
   `author`, and `date`. Any third party can later verify that you held this exact text on
   this date by recomputing the hash.

After each transaction is confirmed on-chain the script prints a direct verification link:

```
https://app.preprod.uverify.io/verify/<hash>
```

## Prerequisites

- Node.js 20+
- A running UVerify backend with `FAUCET_ENABLED=true`, **or** a pre-funded `wallet.txt`

## Run

```bash
cd uverify-examples/typescript
npm install
npx tsx src/examples/notary
```

## Verification

Open the printed URL in any browser — no wallet or account required. The UVerify app shows
when the hash was first recorded, which address issued it, and the attached metadata.

To verify programmatically, recompute the SHA-256 hash of the original content and call the
public API:

```bash
curl https://api.preprod.uverify.io/api/v1/verify/<hash>
```

An empty array means the content has never been certified. A non-empty array proves it has.
