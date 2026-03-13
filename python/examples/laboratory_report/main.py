"""Laboratory Report example — issue 2 GDPR-safe lab reports on Cardano preprod."""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from uverify_sdk import LaboratoryReportInput, UVerifyClient, UVerifyTimeoutError, wait_for
from utils.wallet import create_wallet

WALLET_FILE = Path(__file__).parent / "wallet.txt"
LAB_NAME = "Berlin Medical Diagnostics GmbH"
LAB_CONTACT = "results@bmd-lab.example"

is_new = not WALLET_FILE.exists()
if is_new:
    address, mnemonic, sign_message, sign_tx = create_wallet()
else:
    address, _, sign_message, sign_tx = create_wallet(WALLET_FILE.read_text().strip())
    mnemonic = None

client = UVerifyClient(sign_message=sign_message, sign_tx=sign_tx)

if is_new:
    WALLET_FILE.write_text(mnemonic)
    print("Created new wallet:", address)
    print("Mnemonic saved to wallet.txt. Keep this file safe.\n")
    result = client.fund_wallet(address)
    print(f"Funded by tx: {result.tx_hash}")
    print("Waiting 90 s for funding to confirm on-chain …")
    time.sleep(90)
else:
    print("Restored wallet:", address, "\n")

reports = [
    LaboratoryReportInput(
        report_id="BMD-2024-10-00123",
        patient_name="Sophie Wagner",
        lab_name=LAB_NAME,
        contact=LAB_CONTACT,
        auditable=True,
        values={
            "glucose": "5.4 mmol/L",
            "hba1c": "5.7%",
            "cholesterol": "4.9 mmol/L",
            "hdl": "1.8 mmol/L",
            "ldl": "2.6 mmol/L",
            "triglycerides": "1.2 mmol/L",
        },
    ),
    LaboratoryReportInput(
        report_id="BMD-2024-10-00124",
        patient_name="Thomas Richter",
        lab_name=LAB_NAME,
        contact=LAB_CONTACT,
        auditable=False,
        values={
            "creatinine": "82 μmol/L",
            "urea": "5.8 mmol/L",
            "egfr": "91 mL/min/1.73m²",
            "uric_acid": "340 μmol/L",
            "sodium": "141 mmol/L",
            "potassium": "4.1 mmol/L",
        },
    ),
]

print(f"Issuing {len(reports)} lab reports in a single transaction …")
for r in reports:
    print(f"  • {r.report_id} — {r.patient_name}")

try:
    result = client.apps.issue_laboratory_report(address, reports)
    print("\nTransaction submitted. Waiting for on-chain confirmation …")

    first_hash = result.certificates[0].hash
    wait_for(
        lambda: client.verify(first_hash) or False,
        timeout_ms=300_000,
    )
    print("All reports confirmed on-chain.\n")

    print("Verification deep links (share with each patient):")
    for cert in result.certificates:
        print(f"  {cert.patient_name} / {cert.report_id}")
        print(f"    {cert.verify_url}\n")

    print("Done. All lab reports are permanently anchored on Cardano.")

except UVerifyTimeoutError:
    print(
        "\nTimed out waiting for confirmation. The transaction may still be processing.\n"
        "Re-run the script to check again or increase the timeout if this happens repeatedly."
    )
    sys.exit(1)
