# /// script
# requires-python = ">=3.9"
# dependencies = [
#   "uverify-sdk>=0.1.4",
#   "pycardano>=0.9.0",
#   "mnemonic>=0.21",
# ]
# ///
"""Pet Necklace — GDPR-safe lost-pet certificates on Cardano preprod."""

import hashlib
import json
import os
import sys
import time
import uuid
from pathlib import Path

from mnemonic import Mnemonic as BIP39
from pycardano import (
    Address,
    HDWallet,
    Network,
    PaymentSigningKey,
    PaymentVerificationKey,
    Transaction,
    TransactionWitnessSet,
    VerificationKeyWitness,
)
from pycardano.cip.cip8 import sign as cip8_sign
from uverify_sdk import CertificateData, DataSignature, UVerifyClient, UVerifyTimeoutError, wait_for

WALLET_FILE = Path("wallet.txt")
def _load_dotenv():
    env_file = Path(__file__).parent.parent / ".env"
    try:
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip())
    except FileNotFoundError:
        pass


_load_dotenv()

_env_network = os.environ.get("UVERIFY_NETWORK", "sandbox")
if _env_network == "mainnet":
    _config = {
        "network": Network.MAINNET,
        "backend_url": "https://api.uverify.io",
        "cexplorer_tx_url": "https://cexplorer.io/tx",
        "verify_url": "https://app.uverify.io/verify",
    }
elif _env_network == "preprod":
    _config = {
        "network": Network.TESTNET,
        "backend_url": "https://api.uverify.io",
        "cexplorer_tx_url": "https://preprod.cexplorer.io/tx",
        "verify_url": "https://app.preprod.uverify.io/verify",
    }
else:
    _config = {
        "network": Network.TESTNET,
        "backend_url": "http://localhost:9090",
        "cexplorer_tx_url": "http://localhost:3001",
        "verify_url": "http://localhost:3000/verify",
    }
_NETWORK = _config["network"]
_DERIVATION_PATH = "m/1852'/1815'/0'/0/0"


def sha256hex(text):
    return hashlib.sha256(text.encode()).hexdigest()


def create_wallet(mnemonic_phrase=None):
    if mnemonic_phrase is None:
        mnemonic_phrase = BIP39("english").generate(strength=256)
    hd = HDWallet.from_mnemonic(mnemonic_phrase)
    child = hd.derive_from_path(_DERIVATION_PATH)
    signing_key = PaymentSigningKey.from_primitive(child.private_key)
    verification_key = PaymentVerificationKey.from_signing_key(signing_key)
    address = Address(payment_part=verification_key.hash(), network=_NETWORK)

    def sign_message(message):
        sig_bytes, key_bytes = cip8_sign(
            payload=message.encode("utf-8"),
            signing_key=signing_key,
            attach_cose_key=True,
            network=_NETWORK,
        )
        return DataSignature(key=key_bytes.hex(), signature=sig_bytes.hex())

    def sign_tx(unsigned_tx_hex):
        tx = Transaction.from_cbor(unsigned_tx_hex)
        tx_hash = bytes(tx.transaction_body.hash())
        signature = signing_key.sign(tx_hash)
        witness_set = TransactionWitnessSet(
            vkey_witnesses=[VerificationKeyWitness(verification_key, signature)]
        )
        return witness_set.to_cbor_hex()

    return str(address), mnemonic_phrase, sign_message, sign_tx


is_new = not WALLET_FILE.exists()
if is_new:
    address, mnemonic, sign_message, sign_tx = create_wallet()
else:
    address, _, sign_message, sign_tx = create_wallet(WALLET_FILE.read_text().strip())
    mnemonic = None

client = UVerifyClient(base_url=_config["backend_url"], sign_message=sign_message, sign_tx=sign_tx)

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
    metadata = {
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
    certs.append(CertificateData(hash=data_hash, algorithm="SHA-256", metadata=json.dumps(metadata)))

print(f"Issuing {len(pets)} pet necklace certificate(s) …")
for p in pets:
    breed = f" · {p['breed']}" if p.get("breed") else ""
    print(f"  • {p['petName']} ({p['species']}{breed})")

try:
    client.issue_certificates(address, certs)
    print("\nTransaction submitted. Waiting for on-chain confirmation …")

    first_hash = certs[0].hash
    wait_for(lambda: client.verify(first_hash) or False, timeout_ms=300_000)
    print("All pet certificates confirmed on-chain.\n")

    print("Necklace tag QR-code URLs:")
    for p, cert in zip(pets, certs):
        params = f"owner_name={p['ownerName']}&phone={p['phone']}"
        print(f"  {p['petName']}")
        print(f"    {_config["verify_url"]}/{cert.hash}?{params}\n")

    print("Done. All pet certificates are permanently anchored on Cardano.")

except UVerifyTimeoutError:
    print(
        "\nTimed out waiting for confirmation. The transaction may still be processing.\n"
        "Re-run to check again or increase the timeout if this happens repeatedly."
    )
    sys.exit(1)
