"""Pet Necklace example — GDPR-safe lost-pet certificates on Cardano preprod."""

import hashlib
import json
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from uverify_sdk import CertificateData, UVerifyClient, UVerifyTimeoutError, wait_for
from utils.wallet import create_wallet

WALLET_FILE = Path(__file__).parent / "wallet.txt"
VERIFY_URL = "https://app.preprod.uverify.io/verify"
CEXPLORER_TX_URL = "https://preprod.cexplorer.io/tx"


def sha256hex(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


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

pets = [
    {
        "petName": "Luna",
        "ownerName": "Emma Schneider",
        "phone": "+49 30 12345678",
        "species": "Dog",
        "breed": "Golden Retriever",
        "note": "Very friendly! Please call if found.",
    },
    {
        "petName": "Mochi",
        "ownerName": "Jonas Weber",
        "phone": "+49 89 98765432",
        "species": "Cat",
        "breed": "Siamese",
        "note": "Indoor cat — please do not let outside.",
    },
]

run_id = str(uuid.uuid4())

certs = []
for p in pets:
    data_hash = sha256hex(p["petName"] + p["phone"] + run_id)
    metadata: dict = {
        "uverify_template_id": "petNecklace",
        "uverify_update_policy": "restricted",
        "pet_name": p["petName"],
        "uv_url_owner_name": sha256hex(p["ownerName"]),
        "uv_url_phone": sha256hex(p["phone"]),
        "species": p["species"],
    }
    if p.get("breed"):
        metadata["breed"] = p["breed"]
    if p.get("note"):
        metadata["note"] = p["note"]

    certs.append(
        CertificateData(
            hash=data_hash,
            algorithm="SHA-256",
            metadata=json.dumps(metadata),
        )
    )

print(f"Issuing {len(pets)} pet necklace certificate(s) …")
for p in pets:
    breed = f" · {p['breed']}" if p.get("breed") else ""
    print(f"  • {p['petName']} ({p['species']}{breed})")

try:
    client.issue_certificates(address, certs)
    print("\nTransaction submitted. Waiting for on-chain confirmation …")

    first_hash = certs[0].hash
    wait_for(
        lambda: client.verify(first_hash) or False,
        timeout_ms=300_000,
    )
    print("All pet certificates confirmed on-chain.\n")

    print("Necklace tag QR-code URLs:")
    for p, cert in zip(pets, certs):
        params = f"owner_name={p['ownerName']}&phone={p['phone']}"
        print(f"  {p['petName']}")
        print(f"    {VERIFY_URL}/{cert.hash}?{params}\n")

    print("Done. All pet certificates are permanently anchored on Cardano.")

except UVerifyTimeoutError:
    print(
        "\nTimed out waiting for confirmation. The transaction may still be processing.\n"
        "Re-run the script to check again or increase the timeout if this happens repeatedly."
    )
    sys.exit(1)
