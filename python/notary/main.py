# /// script
# requires-python = ">=3.9"
# dependencies = [
#   "uverify-sdk>=0.1.4",
#   "pycardano>=0.9.0",
#   "mnemonic>=0.21",
# ]
# ///
"""Notary — certify a file, a service agreement, and song lyrics on Cardano preprod."""

import datetime
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


def certify(client, address, cert_hash, metadata):
    client.issue_certificates(address, [CertificateData(hash=cert_hash, algorithm="SHA-256", metadata=json.dumps(metadata))])
    try:
        wait_for(lambda: client.verify(cert_hash) or False, timeout_ms=300_000)
    except UVerifyTimeoutError:
        print(
            "\nTimed out waiting for confirmation. The transaction may still be processing.\n"
            "Re-run to check again or increase the timeout if this happens repeatedly."
        )
        sys.exit(1)


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

today = datetime.date.today().isoformat()

# 1 — Certify sample_document.txt
print("Certifying file …")
doc_path = Path("sample_document.txt")
doc_bytes = doc_path.read_bytes() if doc_path.exists() else b"Sample document placeholder."
doc_hash = sha256hex(doc_bytes)
certify(client, address, doc_hash, {
    "type": "document",
    "path": "https://username:password@example.tld/files/sample_document.txt",
})
print(f"Certified! {_config["verify_url"]}/{doc_hash}\n")

# 2 — Certify a service agreement
print("Certifying contract …")
contract = (
    f"SERVICE AGREEMENT\n\n"
    f"This Service Agreement is entered into on {today}\n"
    f"between Acme Corp (\"Provider\") and John Doe (\"Client\").\n\n"
    f"1. Services.        Provider delivers software development services per SOW-001.\n"
    f"2. Payment.         Client pays EUR 5,000 upon completion of each milestone.\n"
    f"3. Confidentiality. Both parties keep all project details strictly confidential.\n"
    f"4. Governing law.   This Agreement is governed by the laws of Germany.\n\n"
    f"Signed by both parties."
)
contract_hash = sha256hex(contract)
certify(client, address, contract_hash, {
    "contract_type":   "service_agreement",
    "contract_id":     str(uuid.uuid4()),
    "contract_server": "https://contracts.example.tld",
    "date":            today,
})
print(f"Certified! {_config["verify_url"]}/{contract_hash}\n")

# 3 — Certify song lyrics
print("Certifying song …")
song = (
    "The Immutable Record\n\n"
    "Verse 1:\n"
    "The blockchain never lies,\n"
    "every hash a testament,\n"
    "written in the morning skies,\n"
    "a proof that time has lent.\n\n"
    "Chorus:\n"
    "Immutable and true,\n"
    "a fingerprint in chain,\n"
    "no one can undo\n"
    "what we forever claim.\n\n"
    "Verse 2:\n"
    "A song, a word, a deed,\n"
    "all anchored to the block,\n"
    "the world can verify\n"
    "what time has come to lock."
)
song_hash = sha256hex(song)
certify(client, address, song_hash, {
    "genre":  "rock",
    "author": "Alice Smith",
    "date":   today,
})
print(f"Certified! {_config["verify_url"]}/{song_hash}\n")

print("All certificates are permanently recorded on Cardano.")
