"""Product Verification example — product authentication certificate on Cardano preprod."""

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

product = {
    "name": "Organic Cotton Signature Tee",
    "manufacturer": "EcoWear GmbH",
    "productionDate": "2024-10-01",
    "materialInfo": "100% GOTS-certified organic cotton. Machine wash 30°C. Do not tumble dry.",
    "serialNumber": "EW-2024-TC-00847",
    "imageUrl": "https://images.ecowear.example/tc-00847.jpg",
}

run_id = str(uuid.uuid4())
data_hash = sha256hex(product["manufacturer"] + product["serialNumber"] + run_id)

metadata = {
    "uverify_template_id": "productVerification",
    "uverify_update_policy": "first",
    "productName": product["name"],
    "manufacturer": product["manufacturer"],
    "productionDate": product["productionDate"],
    "materialInfo": product["materialInfo"],
    "serialNumber": product["serialNumber"],
    "imageUrl": product["imageUrl"],
}

cert = CertificateData(
    hash=data_hash,
    algorithm="SHA-256",
    metadata=json.dumps(metadata),
)

print(f'Issuing product authentication certificate for "{product["name"]}" …')
print(f'  Serial : {product["serialNumber"]}')
print(f"  Hash   : {data_hash}\n")

try:
    client.issue_certificates(address, [cert])
    print("Transaction submitted. Waiting for on-chain confirmation …")

    wait_for(
        lambda: client.verify(data_hash) or False,
        timeout_ms=300_000,
    )
    print("Product authentication certificate confirmed on-chain.\n")

    print("Product authentication URL (encode as QR code on the product label):")
    print(f"  {VERIFY_URL}/{data_hash}")
    print("\nDone. The product authentication certificate is permanently anchored on Cardano.")

except UVerifyTimeoutError:
    print(
        "\nTimed out waiting for confirmation. The transaction may still be processing.\n"
        "Re-run the script to check again or increase the timeout if this happens repeatedly."
    )
    sys.exit(1)
