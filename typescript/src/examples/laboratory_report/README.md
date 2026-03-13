# Laboratory Report Example

This example shows how to batch-issue tamper-proof laboratory reports on the Cardano
blockchain using UVerify's built-in Laboratory Report template.

## The core idea

Each report is identified by `sha256(reportId)` — a stable, non-reversible fingerprint that
uniquely represents the report without exposing any patient data on-chain. Patient name and
report ID are stored as SHA-256 hashes (`uv_url_name`, `uv_url_report_id`); the plain values
are shared privately via `?name=` and `?report_id=` URL parameters in the verification deep
link. Measured values are attached with an `a_` prefix and rendered as a structured table on
the certificate page.

An optional `auditable` flag controls transparency: when `true`, a banner explains that the
values are publicly readable on-chain.

This makes it ideal for:

- **Diagnostic labs** — issue verifiable, tamper-proof results that patients and doctors can
  authenticate independently without calling the lab.
- **Clinical trials** — anchor study measurements to the blockchain for auditable, long-term
  record keeping.
- **Environmental monitoring** — certify water, air, or soil analysis results in a publicly
  verifiable format.

## What the script does

1. **Wallet** — On the first run a new preprod wallet is created and its mnemonic is saved to
   `wallet.txt`. The wallet is funded automatically via the UVerify dev faucet. On every
   subsequent run the wallet is restored from `wallet.txt` and the faucet step is skipped.

2. **Reports** — Defines two lab reports, each with a patient name, a report ID, measured
   values (prefixed `a_`), and an `auditable` flag.

3. **Privacy** — Patient name and report ID are hashed before being stored on-chain. The
   plain values are embedded only in the private verification deep link shared with the
   patient.

4. **Issuance** — Both reports are submitted in a single transaction via `issueCertificates`,
   then confirmed on-chain via `waitFor`.

5. **Deep links** — Prints one verification URL per patient. The `?name=` and `?report_id=`
   parameters cause the UVerify app to display the patient's name and report ID on the
   certificate page.

## Prerequisites

- Node.js 20+
- A running UVerify backend with `FAUCET_ENABLED=true`, **or** a pre-funded `wallet.txt`

## Run

```bash
cd uverify-examples/typescript
npm install
npm run laboratory-report
```

## Verification

Share the printed deep link directly with the patient. Opening it in any browser — no wallet
or account required — shows the full lab report with measured values, lab name, and contact.

To verify programmatically, recompute `sha256(reportId)` and call the public API:

```bash
curl https://api.preprod.uverify.io/api/v1/verify/<hash>
```

An empty array means no report was ever issued for that report ID. A non-empty array proves
it has been anchored — and shows exactly when and by which lab.
