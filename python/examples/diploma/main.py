"""Diploma example — batch-issue 3 academic certificates on Cardano preprod."""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from uverify_sdk import DiplomaInput, UVerifyClient, UVerifyTimeoutError, wait_for
from utils.wallet import create_wallet

WALLET_FILE = Path(__file__).parent / "wallet.txt"
INSTITUTION = "Technical University of Munich"

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

diplomas = [
    DiplomaInput(
        student_id="TUM-2021-0042",
        name="Maria Müller",
        degree="Master of Science in Computer Science",
        institution=INSTITUTION,
        graduation_date="2024-06-28",
        honors="Summa Cum Laude",
    ),
    DiplomaInput(
        student_id="TUM-2021-0117",
        name="Felix Schmidt",
        degree="Master of Science in Computer Science",
        institution=INSTITUTION,
        graduation_date="2024-06-28",
    ),
    DiplomaInput(
        student_id="TUM-2021-0284",
        name="Layla Hassan",
        degree="Master of Science in Electrical Engineering",
        institution=INSTITUTION,
        graduation_date="2024-06-28",
        honors="Magna Cum Laude",
    ),
]

print(f"Issuing {len(diplomas)} diplomas …")
for d in diplomas:
    print(f"  • {d.name} — {d.degree}")

try:
    result = client.apps.issue_diploma(address, diplomas)
    print("\nTransaction submitted. Waiting for on-chain confirmation …")

    first_hash = result.certificates[0].hash
    wait_for(
        lambda: client.verify(first_hash) or False,
        timeout_ms=300_000,
    )
    print("All diplomas confirmed on-chain.\n")

    print("Verification deep links (share with each graduate):")
    for cert in result.certificates:
        print(f"  {cert.name}: {cert.verify_url}")

    print("\nDone. All diplomas are permanently anchored on Cardano.")

except UVerifyTimeoutError:
    print(
        "\nTimed out waiting for confirmation. The transaction may still be processing.\n"
        "Re-run the script to check again or increase the timeout if this happens repeatedly."
    )
    sys.exit(1)
