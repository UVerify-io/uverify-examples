# /// script
# requires-python = ">=3.9"
# dependencies = [
#   "uverify-sdk>=0.1.4",
#   "pycardano>=0.9.0",
#   "mnemonic>=0.21",
# ]
# ///
"""Certificate of Insurance — issue a COI on Cardano preprod."""

import os
import sys
import time
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
from uverify_sdk import (
    CertificateOfInsuranceInput,
    DataSignature,
    UVerifyClient,
    UVerifyTimeoutError,
    wait_for,
)

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

coi = CertificateOfInsuranceInput(
    policy_number="AI-GL-2025-049891",
    insurer="Acme Insurance AG",
    insured="TechBuild GmbH",
    producer="Schmidt Insurance Brokers",
    insured_address="Unter den Linden 12, 10117 Musterstadt, Germany",
    effective_date="2025-01-01",
    expiration_date="2027-01-01",
    certificate_holder="City of Musterstadt — Department of Infrastructure",
    certificate_holder_address="Musterstadt Str. 1, 10117 Musterstadt, Germany",
    additional_insured=True,
    waiver_of_subrogation=False,
    coverages={
        "general_liability":    "2,000,000",
        "workers_compensation": "1,000,000",
        "auto_liability":       "1,000,000",
        "umbrella":             "5,000,000",
    },
)

print("Issuing Certificate of Insurance …")
print(f"  Policy  : {coi.policy_number}")
print(f"  Insured : {coi.insured}")
print(f"  Holder  : {coi.certificate_holder}")
print(f"  Valid   : {coi.effective_date} → {coi.expiration_date}\n")

try:
    result = client.apps.issue_certificate_of_insurance(address, coi)
    print("Transaction submitted. Waiting for on-chain confirmation …")

    cert_hash = result.hash
    wait_for(lambda: client.verify(cert_hash) or False, timeout_ms=300_000)
    print("Certificate of Insurance confirmed on-chain.\n")

    print("Verification URL (share with certificate holder or auditors):")
    print(f"  {result.verify_url}")
    print("\nDone. The Certificate of Insurance is permanently anchored on Cardano.")

except UVerifyTimeoutError:
    print(
        "\nTimed out waiting for confirmation. The transaction may still be processing.\n"
        "Re-run to check again or increase the timeout if this happens repeatedly."
    )
    sys.exit(1)
