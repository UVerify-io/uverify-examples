# Diploma Example

This example shows how to batch-issue tamper-proof degree certificates on the Cardano
blockchain using UVerify's built-in Diploma template.

## Prerequisites

- [Deno](https://deno.com) 2+
- On the first run only: a backend with `FAUCET_ENABLED=true` **or** a pre-funded `wallet.txt`

## Run

```bash
cd uverify-examples/typescript/diploma

# issue one diploma using the example plan
deno run -A index.ts --plan example.diploma.plan

# issue five diplomas from a custom plan
deno run -A index.ts --plan my-cohort.plan --number 5
```

## Verification

Open a printed URL in any browser — no wallet or account required. The UVerify app shows
the diploma with the recipient's name, degree, institution, and honours.

To verify programmatically, recompute `sha256(studentId)` and call the public API:

```bash
curl https://api.preprod.uverify.io/api/v1/verify/<hash>
```

An empty array means no diploma was ever issued for that student ID. A non-empty array
proves it has been — and shows exactly when and by whom.


## The core idea

Each graduate's student ID is hashed with SHA-256 and recorded permanently on-chain alongside
degree metadata. The hash uniquely identifies the certificate without revealing any personal
data. The recipient's name is stored as a hash on-chain (`uv_url_name`) and revealed only
via a `?name=` URL parameter — so the verification link personalises the certificate page
without exposing the name to everyone who queries the blockchain.

This makes it ideal for:

- **Universities and schools** — issue verifiable graduation records that anyone can check
  instantly, without calling a registrar.
- **Professional certifications** — anchor course completions, licences, or accreditations
  in a tamper-proof, publicly auditable way.
- **Batch issuance** — all certificates for a graduation cohort land in a single transaction,
  minimising cost and on-chain footprint.

## Plan files

Graduates are defined in a JSON plan file using the same field-def format as the sandbox
simulator (`sandbox/simulator/generate.ts`). Each key maps to a field definition:

| Type | Description |
|---|---|
| `static` | Always emits the given value |
| `one-of` | Picks uniformly from a `values` array |
| `random-string` | Generates a string matching a regex template |
| `random-number` | Picks an integer in `[min, max]` |
| `random-bool` | Emits `true` or `false` with equal probability |

`example.diploma.plan` ships with the example and represents a single graduate:

```json
{
  "name":           { "type": "static", "value": "Maria Müller" },
  "studentId":      { "type": "static", "value": "TUM-2021-0042" },
  "degree":         { "type": "static", "value": "Master of Science in Computer Science" },
  "graduationDate": { "type": "static", "value": "2024-06-28" },
  "honors":         { "type": "static", "value": "Summa Cum Laude" },
  "institution":    { "type": "static", "value": "Ohara Institute of Scholarly Arts" }
}
```

Swap `static` for `one-of` or `random-string` to generate synthetic graduates for load
testing. Pass `--number N` to issue multiple certificates in one transaction.

## What the script does

1. **Wallet** — On the first run a new wallet is created and its mnemonic is saved to
   `wallet.txt`. The wallet is funded automatically via the UVerify faucet. On every
   subsequent run the wallet is restored from `wallet.txt` and the faucet step is skipped.

2. **Graduates** — Evaluates the plan file N times (default: 1) to build the batch.

3. **Certificates** — Each certificate hashes the student ID (`sha256(studentId)`) as its
   on-chain fingerprint and encodes degree metadata as JSON, including `uv_url_name` (the
   SHA-256 hash of the recipient's name).

4. **Issuance** — All diplomas are submitted in a single transaction via `issueDiploma`,
   then confirmed on-chain via `waitFor`.

5. **Links** — Prints one verification URL per graduate. The `?name=` parameter causes the
   UVerify app to display the recipient's full name on the certificate page.
