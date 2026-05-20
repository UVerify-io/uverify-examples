# /// script
# requires-python = ">=3.9"
# dependencies = [
#   "uverify-sdk>=0.1.4",
#   "pycardano>=0.9.0",
#   "mnemonic>=0.21",
# ]
# ///
"""Agent Receipt — anchor an LCP-governed agentic transaction on Cardano."""

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
from uverify_sdk import (
    DataSignature,
    UVerifyClient,
    UVerifyTimeoutError,
    wait_for,
)
from uverify_sdk.apps.types import AgentReceiptInput

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

# A realistic Level 4 LCP agent receipt. The commerce platform publishes its
# legal context at /.well-known/legal-context.json. The agent fetches the terms,
# verifies the ATR hash, then anchors the receipt on-chain via UVerify.
receipt = AgentReceiptInput(
    transaction_id=f"txn_{uuid.uuid4()}",
    # LCP spec field names
    terms="https://datastream.example.com/terms/v2.md",
    # SHA-256 hash of the terms document — verified by the agent before paying.
    atr_hash="0x7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
    terms_format="markdown",
    acceptance_required=True,
    agent_name="ResearchBot v2.1",
    # dispute_resolution presence signals Level 4
    dispute_resolution={
        "method": "AAA Commercial Arbitration Rules",
        "jurisdiction": "New York, USA",
        "contact": "disputes@datastream.example.com",
        "clauseId": "sha256:0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        "source": "https://adr.org/clauses/commercial-arbitration",
        "catalog": "https://adr.org/.well-known/dispute-services.json",
    },
)

print("Issuing Agent Receipt …")
print(f"  Terms   : {receipt.terms}")
print(f"  Agent   : {receipt.agent_name}")
print(f"  Tx ID   : {receipt.transaction_id}")
print(f"  LCP     : Level 4 — Integrated (derived from dispute_resolution)\n")

try:
    result = client.apps.issue_agent_receipt(address, receipt)
    print("Transaction submitted. Waiting for on-chain confirmation …")

    wait_for(lambda: client.verify(result.hash) or False, timeout_ms=300_000)
    print("Agent Receipt confirmed on-chain.\n")

    print("Verification URL (share with auditors or counterparties):")
    print(f"  {result.verify_url}")
    print("\nDone. The Agent Receipt is permanently anchored on Cardano.")

except UVerifyTimeoutError:
    print(
        "\nTimed out waiting for confirmation. The transaction may still be processing.\n"
        "Re-run to check again or increase the timeout if this happens repeatedly."
    )
    sys.exit(1)
