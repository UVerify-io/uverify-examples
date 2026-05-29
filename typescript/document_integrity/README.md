# Document Integrity Example

This example shows how to certify a file's integrity on the Cardano blockchain using
the `documentIntegrity` template.

## Prerequisites

- [Deno](https://deno.com) 2+
- On the first run only: a backend with `FAUCET_ENABLED=true` **or** a pre-funded `wallet.txt`

## Run

```bash
cd uverify-examples/typescript/document_integrity

# certify sample_thesis.zip with metadata from the example plan
deno run -A index.ts --plan example.doc.plan

# certify a specific file with custom metadata
deno run -A index.ts --plan my-document.plan --file /path/to/my-document.pdf
```

## Verification

Open the printed URL in any browser — no wallet or account required. To verify the file,
drop it into the drag-and-drop area on the certificate page; UVerify recomputes the SHA-256
hash and compares it to the on-chain record.

To verify programmatically:

```bash
sha256sum your-file.zip   # compute the hash locally
curl https://api.preprod.uverify.io/api/v1/verify/<hash>
```

An empty array means no certificate was ever issued for that file. A non-empty array proves
the file existed in its current form at the recorded timestamp.

## The core idea

The SHA-256 fingerprint of the file **is** the certificate hash. Anyone who later receives a
copy of the file can verify it has not been tampered with by dropping it on the certificate
page — UVerify recomputes the hash and compares it to the one recorded on-chain.

Sensitive fields like the filename and author are stored as SHA-256 hashes on-chain
(`uv_url_filename`, `uv_url_author`) to keep them opaque. The plain values are embedded only
in the verification URL as `?filename=` and `?author=` parameters, so the certificate page
can reveal them to the intended verifier.

This makes it ideal for:

- **Academic submissions** — certify a thesis or dissertation before sharing it so an
  examiner can confirm the copy they received is byte-for-byte identical to the original.
- **Legal documents** — anchor contracts, reports, or evidence files so their authenticity
  can be verified independently.
- **Data integrity** — prove that a dataset, audit log, or backup has not been modified since
  a specific date.

## Plan files

The plan defines the certificate **metadata** — not the file content. The file to certify is
provided separately via `--file <path>` (defaults to `sample_thesis.zip`).

Plan fields:

| Field | Description |
|---|---|
| `title` | Document title shown on the certificate page |
| `issuer` | Issuing organisation or individual |
| `author` | Author name (stored as SHA-256 hash on-chain, revealed via `?author=`) |
| `filename` | File name (stored as SHA-256 hash on-chain, revealed via `?filename=`) |
| `location` | Canonical URL where the file can be retrieved |
| `file_hint` | Human-readable hint about the file format |
| `description` | Instructions shown to the verifier on the certificate page |

Each field supports any plan field-def type (`static`, `one-of`, `random-string`, etc.),
using the same format as the sandbox simulator (`sandbox/simulator/generate.ts`).

`example.doc.plan` ships with the example:

```json
{
  "title":    { "type": "static", "value": "Master's thesis: …" },
  "issuer":   { "type": "static", "value": "Technical University of Musterstadt" },
  "author":   { "type": "static", "value": "Fabian Bormann" },
  "filename": { "type": "static", "value": "sample_thesis.zip" }
}
```

## What the script does

1. **Wallet** — On the first run a new wallet is created and its mnemonic is saved to
   `wallet.txt`. The wallet is funded automatically via the UVerify faucet. On every
   subsequent run the wallet is restored from `wallet.txt` and the faucet step is skipped.

2. **File** — Reads the file specified by `--file` (or `sample_thesis.zip`). If the file
   does not exist a placeholder is created for demo purposes. Replace it with your actual
   file — PDF, ZIP, DOCX, or any binary format.

3. **Metadata** — Evaluates the plan file once to produce the certificate metadata.

4. **Certificate** — Issues one `documentIntegrity` certificate. The SHA-256 hash of the
   file bytes is the on-chain fingerprint. Filename and author are hashed before storage.

5. **Verification URL** — Prints a shareable link with `?filename=` and `?author=`
   pre-populated so the verifier sees the correct document details.
