# Certificate of Insurance Example

This example shows how to issue a tamper-proof Certificate of Insurance (COI) on the Cardano
blockchain using UVerify's built-in COI template.

## The core idea

A Certificate of Insurance proves that a named party holds active insurance coverage. Anchoring
it on-chain makes the document independently verifiable by any certificate holder or auditor —
without calling the insurer or relying on a centralised registry.

This makes it ideal for:

- **Contractors** — provide proof of general liability, workers' compensation, or umbrella
  coverage to clients or government bodies before starting a project.
- **Landlords and property managers** — verify that tenants or service providers maintain
  required coverage without managing paper certificates.
- **Supply chain compliance** — confirm that vendors and subcontractors hold the policies your
  contracts require.

## What the script does

1. **Wallet** — On the first run a new preprod wallet is created and its mnemonic is saved to
   `wallet.txt`. The wallet is funded automatically via the UVerify dev faucet. On every
   subsequent run the wallet is restored from `wallet.txt` and the faucet step is skipped.

2. **COI data** — Defines a sample certificate for *TechBuild GmbH*, a contractor proving
   coverage to the City of Musterstadt before a public works project. Includes policy number,
   insurer, insured, certificate holder, effective and expiration dates, and four coverage types.

3. **Issuance** — Calls `client.apps.issueCertificateOfInsurance()` which builds the
   certificate hash and metadata automatically, then submits the transaction.

4. **Verification URL** — Prints a shareable link to send to the certificate holder or auditors.

## Prerequisites

- Node.js 20+
- A running UVerify backend with `FAUCET_ENABLED=true`, **or** a pre-funded `wallet.txt`

## Run

```bash
cd uverify-examples/typescript
npm install
npm run certificate-of-insurance
```

## Verification

Open the printed URL in any browser — no wallet or account required. The UVerify app shows the
full COI with all coverage amounts, effective dates, and parties.

To verify programmatically, call the public API with the certificate hash returned by
`issueCertificateOfInsurance`:

```bash
curl https://api.preprod.uverify.io/api/v1/verify/<hash>
```

An empty array means no COI was ever issued for that policy. A non-empty array proves it was —
and shows exactly when.
