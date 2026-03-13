# Laboratory Report Example (Python)

Issues two GDPR-safe clinical lab reports for patients in a single Cardano
transaction.

## Core idea

The on-chain hash is `sha256(reportId + runId)`, uniquely identifying each
report. Patient name and report ID are stored as hashes on-chain
(`uv_url_name`, `uv_url_report_id`) and revealed only via URL parameters —
the blockchain never contains plaintext personal data.

Measured values are stored with an `a_` prefix (e.g. `a_glucose`) which the
`laboratoryReport` template recognises and renders as a results table.

## What the script does

1. Creates (or restores) a headless Cardano wallet from `wallet.txt`.
2. Funds the wallet from the UVerify testnet faucet on first run.
3. Builds two `CertificateData` objects with `laboratoryReport` metadata.
4. Issues both in a single `issue_certificates` call.
5. Polls until the certificates appear on-chain.
6. Prints verification deep links for each patient.

## Prerequisites

```bash
pip install -r ../../requirements.txt
```

## Run

```bash
# from uverify-examples/python/
python examples/laboratory_report/main.py
```
