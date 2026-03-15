# Document Integrity Example

This example shows how to use UVerify to certify a file's integrity on the Cardano blockchain
using the `documentIntegrity` template.

## The core idea

The SHA-256 fingerprint of the file **is** the certificate hash. Anyone who later receives a
copy of the file can verify it has not been tampered with by dropping it on the certificate
page — UVerify recomputes the hash and compares it to the one recorded on-chain.

Sensitive fields like the filename and author are stored as SHA-256 hashes on-chain
(`uv_url_filename`, `uv_url_author`) to keep them opaque. The plain values are embedded only
in the verification URL as `?filename=` and `?author=` parameters, so the certificate page can
reveal them to the intended verifier.

This makes it ideal for:

- **Academic submissions** — certify a thesis or dissertation before sharing it so an examiner
  can confirm the copy they received is byte-for-byte identical to the original.
- **Legal documents** — anchor contracts, reports, or evidence files so their authenticity can
  be verified independently.
- **Data integrity** — prove that a dataset, audit log, or backup has not been modified since
  a specific date.

## What the script does

1. **Wallet** — On the first run a new preprod wallet is created and its mnemonic is saved to
   `wallet.txt`. The wallet is funded automatically via the UVerify dev faucet. On every
   subsequent run the wallet is restored from `wallet.txt` and the faucet step is skipped.

2. **File** — Reads `sample_thesis.zip` (a placeholder is created if it does not exist),
   computes its SHA-256 hash, and uses that hash as the certificate ID. Replace the file path
   with your actual file — PDF, ZIP, DOCX, or any binary format.

3. **Certificate** — Issues one `documentIntegrity` certificate. The metadata includes the
   thesis title, issuing institution, file location, size, type, and a description shown to
   the verifier.

4. **Privacy** — The filename and author name are stored as SHA-256 hashes on-chain.
   The plain values are appended to the verification URL as `?filename=` and `?author=`
   parameters.

5. **Verification URL** — Prints a shareable link. Anyone who opens it can drop the file into
   the UVerify app to confirm the hash matches.

## Prerequisites

- Node.js 20+
- A running UVerify backend with `FAUCET_ENABLED=true`, **or** a pre-funded `wallet.txt`

## Run

```bash
cd uverify-examples/typescript
npm install
npm run document-integrity
```

## Verification

Open the printed URL in any browser — no wallet or account required. To verify the file, drop
it into the drag-and-drop area on the certificate page; UVerify recomputes the SHA-256 hash
and compares it to the on-chain record.

To verify programmatically:

```bash
sha256sum your-file.zip   # compute the hash locally
curl https://api.preprod.uverify.io/api/v1/verify/<hash>
```

An empty array means no certificate was ever issued for that file. A non-empty array proves the
file existed in its current form at the recorded timestamp.
