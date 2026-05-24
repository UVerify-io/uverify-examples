# /// script
# requires-python = ">=3.9"
# dependencies = [
#   "uverify-sdk>=0.1.4",
#   "pycardano>=0.9.0",
#   "mnemonic>=0.21",
# ]
# ///
"""Document Integrity — anchor a file hash on Cardano so anyone can verify it was not tampered with."""

import hashlib
import json
import os
import sys
import time
import urllib.parse
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
AUTHOR = "Fabian Bormann"
INSTITUTION = "Technical University of Musterstadt"
THESIS_TITLE = "Master's thesis: Impact of Blockchain Technology on Academic Record Keeping"
FILE_LOCATION = "https://fileshare.university.tld/thesis/sample_thesis.zip"
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
        "backend_url": "https://api.preprod.uverify.io",
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


def sha256hex(data):
    if isinstance(data, str):
        data = data.encode()
    return hashlib.sha256(data).hexdigest()


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

file_path = Path("sample_thesis.zip")
if file_path.exists():
    file_bytes = file_path.read_bytes()
else:
    file_bytes = b"This is a placeholder for sample_thesis.zip."
    file_path.write_bytes(file_bytes)
    print("Created placeholder sample_thesis.zip for demo purposes.\n")

file_name = file_path.name
file_hash = sha256hex(file_bytes)
file_size = len(file_bytes)

print(f'Certifying "{file_name}" ({file_size} bytes) …')
print(f"SHA-256: {file_hash}\n")

metadata = {
    "uverify_template_id": "documentIntegrity",
    "title":           THESIS_TITLE,
    "issuer":          INSTITUTION,
    "uv_url_filename": sha256hex(file_name),
    "location":        FILE_LOCATION,
    "file_size":       str(file_size),
    "file_type":       "application/zip",
    "file_hint":       "ZIP archive, not password protected",
    "description": (
        f'You received this link because you were sent a copy of "{file_name}". '
        f"The file is available at: {FILE_LOCATION}. "
        "To confirm no one has tampered with it, drop the file into the area below — "
        "the SHA-256 fingerprint will be compared against the blockchain record."
    ),
    "uv_url_author": sha256hex(AUTHOR),
}

cert = CertificateData(hash=file_hash, algorithm="SHA-256", metadata=json.dumps(metadata))

try:
    client.issue_certificates(address, [cert])
    print("Transaction submitted. Waiting for on-chain confirmation …")

    wait_for(lambda: client.verify(file_hash) or False, timeout_ms=300_000)
    print("Certificate confirmed on-chain.\n")

    verify_url = (
        f"{_config["verify_url"]}/{file_hash}"
        f"?filename={urllib.parse.quote(file_name)}"
        f"&author={urllib.parse.quote(AUTHOR)}"
    )
    print("Share this URL with the verifier:")
    print(f"  {verify_url}")

except UVerifyTimeoutError:
    print(
        "\nTimed out waiting for confirmation. The transaction may still be processing.\n"
        "Re-run to check again or increase the timeout if this happens repeatedly."
    )
    sys.exit(1)
