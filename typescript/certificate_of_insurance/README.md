# Certificate of Insurance Example

This example shows how to issue tamper-proof Certificates of Insurance (COI) on the Cardano
blockchain using UVerify's built-in COI template.

## Prerequisites

- [Deno](https://deno.com) 2+
- On the first run only: a backend with `FAUCET_ENABLED=true` **or** a pre-funded `wallet.txt`

## Run

```bash
cd uverify-examples/typescript/certificate_of_insurance

# issue one COI using the example plan
deno run -A index.ts --plan example.coi.plan

# issue three COIs from a custom plan (one transaction each)
deno run -A index.ts --plan example.coi.plan --number 3
```

## Verification

Open a printed URL in any browser — no wallet or account required. The UVerify app shows
the full COI with all coverage amounts, effective dates, and parties.

To verify programmatically, call the public API with the certificate hash:

```bash
curl https://api.preprod.uverify.io/api/v1/verify/<hash>
```

An empty array means no COI was ever issued for that policy. A non-empty array proves it
was — and shows exactly when.

## The core idea

A Certificate of Insurance proves that a named party holds active insurance coverage.
Anchoring it on-chain makes the document independently verifiable by any certificate holder
or auditor — without calling the insurer or relying on a centralised registry.

This makes it ideal for:

- **Contractors** — provide proof of general liability, workers' compensation, or umbrella
  coverage to clients or government bodies before starting a project.
- **Landlords and property managers** — verify that tenants or service providers maintain
  required coverage without managing paper certificates.
- **Supply chain compliance** — confirm that vendors and subcontractors hold the policies
  your contracts require.

## Plan files

COI data is defined in a JSON plan file using the same field-def format as the sandbox
simulator (`sandbox/simulator/generate.ts`). Each key maps to a field definition:

| Type | Description |
|---|---|
| `static` | Always emits the given value |
| `one-of` | Picks uniformly from a `values` array |
| `random-string` | Generates a string matching a regex template |
| `random-number` | Picks an integer in `[min, max]` |
| `random-bool` | Emits `true` or `false` with equal probability |

Coverage limits use a `cov_` prefix. The prefix is stripped when the `coverages` object
is assembled before calling the SDK:

```json
{
  "policyNumber":          { "type": "static", "value": "AI-GL-2025-049891" },
  "insurer":               { "type": "static", "value": "Acme Insurance AG" },
  "insured":               { "type": "static", "value": "TechBuild GmbH" },
  "effectiveDate":         { "type": "static", "value": "2025-01-01" },
  "expirationDate":        { "type": "static", "value": "2027-01-01" },
  "cov_general_liability": { "type": "static", "value": "2,000,000" },
  "cov_umbrella":          { "type": "static", "value": "5,000,000" }
}
```

`example.coi.plan` ships with the example. Swap `static` for `one-of` or `random-string`
to generate synthetic certificates for load testing. Pass `--number N` to issue multiple
certificates — each in its own transaction.

## What the script does

1. **Wallet** — On the first run a new wallet is created and its mnemonic is saved to
   `wallet.txt`. The wallet is funded automatically via the UVerify faucet. On every
   subsequent run the wallet is restored from `wallet.txt` and the faucet step is skipped.

2. **Plan** — Evaluates the plan file N times (default: 1) to build the certificate batch.

3. **Issuance** — Each COI is submitted in its own transaction via
   `issueCertificateOfInsurance`, then confirmed on-chain via `waitFor`. The `coverages`
   nested object is assembled from all `cov_*` plan fields.

4. **Links** — Prints one verification URL per certificate.
