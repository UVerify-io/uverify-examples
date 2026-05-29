# Notary Example

This example shows how to use UVerify to create tamper-proof, blockchain-anchored
proofs of existence for any digital content — without storing the content itself on-chain.

## Prerequisites

- [Deno](https://deno.com) 2+
- On the first run only: a backend with `FAUCET_ENABLED=true` **or** a pre-funded `wallet.txt`

## Run

```bash
cd uverify-examples/typescript/notary

# notarise one item using the example plan
deno run -A index.ts --plan example.notary.plan

# notarise three different items in one transaction
deno run -A index.ts --plan example.notary.plan --number 3
```

## Verification

Open the printed URL in any browser — no wallet or account required. The UVerify app shows
when the hash was first recorded, which address issued it, and the attached metadata.

To verify programmatically, recompute the SHA-256 hash of the original content and call
the public API:

```bash
curl https://api.preprod.uverify.io/api/v1/verify/<hash>
```

An empty array means the content has never been certified. A non-empty array proves it has.

## The core idea

You hash your content (text, document, image, …) with SHA-256 and record that fingerprint
permanently on the Cardano blockchain. The content never leaves your hands, but anyone who
later holds the same content can recompute the hash and check whether it was registered
on-chain — and when.

This makes it ideal for:

- **Legal contracts** — prove that a contract existed in a specific form on a specific date,
  before any dispute arose.
- **Creative works** — establish authorship priority for song lyrics, manuscripts, or art
  without filing a formal copyright registration.
- **Documents and certificates** — anchor any text, PDF, or structured document so its
  authenticity can be verified independently by anyone.

## Plan files

Notarisation data is defined in a JSON plan file using the same field-def format as the
sandbox simulator (`sandbox/simulator/generate.ts`). Each key maps to a field definition:

| Type | Description |
|---|---|
| `static` | Always emits the given value |
| `one-of` | Picks uniformly from a `values` array |
| `random-string` | Generates a string matching a regex template |
| `random-number` | Picks an integer in `[min, max]` |
| `random-bool` | Emits `true` or `false` with equal probability |

The plan **must** include a `content` field — this is the text whose SHA-256 hash is
recorded on-chain as the certificate fingerprint. All other fields are stored as on-chain
metadata alongside the hash:

```json
{
  "content": { "type": "static", "value": "This is the document text to certify." },
  "type":    { "type": "static", "value": "document" },
  "author":  { "type": "static", "value": "Alice Smith" },
  "date":    { "type": "static", "value": "2025-01-15" }
}
```

`example.notary.plan` ships with the example. Swap `static` for `one-of` or `random-string`
to generate synthetic content for load testing. Pass `--number N` to notarise N different
evaluations in one transaction.

### Certifying files

To certify a binary file, hash it externally and use the hex digest as the `content` value:

```bash
sha256sum myfile.pdf   # prints the 64-char hex hash
```

Then set `"content": { "type": "static", "value": "<hex-hash>" }` in your plan and open the
verification URL to confirm it is recorded on-chain. The verifier recomputes the hash of
the file they received and compares it to the blockchain record.

## What the script does

1. **Wallet** — On the first run a new wallet is created and its mnemonic is saved to
   `wallet.txt`. The wallet is funded automatically via the UVerify faucet. On every
   subsequent run the wallet is restored from `wallet.txt` and the faucet step is skipped.

2. **Items** — Evaluates the plan file N times (default: 1). For each evaluation, the
   `content` field is SHA-256 hashed to produce the certificate fingerprint; all other
   fields become on-chain metadata.

3. **Issuance** — All certificates are submitted in a single transaction via
   `issueCertificates`, then confirmed on-chain via `waitFor`.

4. **Links** — Prints one verification URL per notarised item.
