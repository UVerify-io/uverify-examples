# /// script
# requires-python = ">=3.9"
# dependencies = [
#   "uverify-sdk>=0.1.4",
#   "pycardano>=0.9.0",
#   "mnemonic>=0.21",
# ]
# ///
"""Digital Product Passport — issue an EU-compliant DPP on Cardano preprod."""

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
    DataSignature,
    DigitalProductPassportInput,
    UVerifyClient,
    UVerifyTimeoutError,
    wait_for,
)

WALLET_FILE = Path("wallet.txt")
_NETWORK = Network.TESTNET
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

product = DigitalProductPassportInput(
    name="EcoCharge Powerbank Pro 200",
    manufacturer="GreenTech AG",
    gtin="04012345678901",
    serial_number="EC200-SN-20240815-00847",
    model="EC-200-2024",
    origin="Germany",
    manufactured="2024-08-15",
    contact="sustainability@greentech-ag.example",
    brand_color="#1a56db",
    carbon_footprint="1.2 kg CO₂e",
    recycled_content="38%",
    energy_class="A++",
    warranty="3 years",
    spare_parts="Available until 2034",
    repair_info="https://greentech-ag.example/repair/ec-200",
    recycling="Return to any EU-authorised WEEE recycling point. Remove battery before disposal.",
    materials={
        "aluminum": "45%",
        "recycled_plastic": "38%",
        "lithium_cells": "12%",
        "copper": "5%",
    },
    certifications={
        "ce": "CE Marking",
        "rohs": "RoHS Compliant",
        "energy_star": "Energy Star 8.0",
        "reach": "REACH Compliant",
    },
)

print(f'Issuing Digital Product Passport for "{product.name}" …')
print(f"  GTIN   : {product.gtin}")
print(f"  Serial : {product.serial_number}\n")

try:
    result = client.apps.issue_digital_product_passport(address, product)
    print("Transaction submitted. Waiting for on-chain confirmation …")

    data_hash = result.hash
    wait_for(lambda: client.verify(data_hash) or False, timeout_ms=300_000)
    print("Digital Product Passport confirmed on-chain.\n")

    print("Product passport URL (share with customers / regulators):")
    print(f"  {result.verify_url}")
    print("\nDone. The Digital Product Passport is permanently anchored on Cardano.")

except UVerifyTimeoutError:
    print(
        "\nTimed out waiting for confirmation. The transaction may still be processing.\n"
        "Re-run to check again or increase the timeout if this happens repeatedly."
    )
    sys.exit(1)
