# /// script
# requires-python = ">=3.9"
# dependencies = [
#   "uverify-sdk>=0.1.4",
#   "pycardano>=0.9.0",
#   "mnemonic>=0.21",
# ]
# ///
"""Tokenizable Certificate — issue or redeem an NFT-backed on-chain certificate."""

import argparse
import hashlib
import json
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
from uverify_sdk import CertificateData, DataSignature, UVerifyClient, UVerifyTimeoutError, wait_for
from uverify_sdk.apps.types import (
    RedeemTokenizableCertificateInput,
    TokenizableCertificateInput,
    TokenizableConfig,
)

WALLET_FILE = Path("wallet.txt")
RECIPIENT_WALLET_FILE = Path("recipient_wallet.txt")
SEED_UTXO_FILE = Path("seed_utxo.txt")
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
        "chain_viewer_url": "https://cexplorer.io",
        "verify_url": "https://app.uverify.io/verify",
    }
elif _env_network == "preprod":
    _config = {
        "network": Network.TESTNET,
        "backend_url": "https://api.uverify.io",
        "cexplorer_tx_url": "https://preprod.cexplorer.io/tx",
        "chain_viewer_url": "https://preprod.cexplorer.io",
        "verify_url": "https://app.preprod.uverify.io/verify",
    }
else:
    _config = {
        "network": Network.TESTNET,
        "backend_url": "http://localhost:9090",
        "cexplorer_tx_url": "http://localhost:3001",
        "chain_viewer_url": "http://localhost:3001",
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


def payment_key_hash_from_address(bech32_addr):
    addr = Address.from_primitive(bech32_addr)
    return addr.payment_part.payload.hex()


def setup_wallet(wallet_file, client, label):
    is_new = not wallet_file.exists()
    if is_new:
        address, mnemonic, sign_message, sign_tx = create_wallet()
        wallet_file.write_text(mnemonic)
        print(f"Created new {label}: {address}")
        print(f"Mnemonic saved to {wallet_file.name}. Keep this file safe.")
        funded = client.fund_wallet(address, sign_message)
        print(f"Funded by tx: {funded.tx_hash}")
        print("Waiting 90 s for funding to confirm on-chain …")
        time.sleep(90)
    else:
        address, _, sign_message, sign_tx = create_wallet(wallet_file.read_text().strip())
        print(f"Restored {label}: {address}")
    return address, sign_message, sign_tx


parser = argparse.ArgumentParser(
    description="Issue or redeem a tokenizable certificate on Cardano preprod.",
    formatter_class=argparse.RawTextHelpFormatter,
)
sub = parser.add_subparsers(dest="command", required=True)

create_p = sub.add_parser("create", help="Issue a new tokenizable certificate")
create_p.add_argument("--asset-name", required=True, metavar="NAME",
                      help="Base name for the NFT asset (UTF-8)")
group = create_p.add_mutually_exclusive_group(required=True)
group.add_argument("--document-text", metavar="TEXT", help="Plain text to certify")
group.add_argument("--document-path", metavar="PATH", help="Path to a file to certify")
create_p.add_argument("--recipient-wallet", metavar="ADDR",
                      help="Bech32 address to receive the NFT (defaults to managed recipient wallet)")
create_p.add_argument("--init-utxo-tx-hash", metavar="HASH",
                      help="Tx hash of the one-shot seed UTxO (required on first run)")
create_p.add_argument("--init-utxo-output-index", type=int, metavar="IDX",
                      help="Output index of the seed UTxO (required on first run)")
create_p.add_argument("--issuer-name", metavar="NAME")
create_p.add_argument("--description", metavar="TEXT")
create_p.add_argument("--asset-class", metavar="CLASS")
create_p.add_argument("--ipfs-image", metavar="CID")

redeem_p = sub.add_parser("redeem", help="Redeem a tokenizable certificate (mint the NFT)")
redeem_p.add_argument("--asset-name", required=True, metavar="NAME")
redeem_p.add_argument("--key", required=True, metavar="HASH",
                      help="SHA-256 hash printed by the create command")
redeem_p.add_argument("--recipient-wallet", metavar="ADDR",
                      help="Bech32 address that will receive the NFT")
redeem_p.add_argument("--init-utxo-tx-hash", metavar="HASH")
redeem_p.add_argument("--init-utxo-output-index", type=int, metavar="IDX")

args = parser.parse_args()

# Issuer wallet
issuer_address, issuer_sign_message, issuer_sign_tx = (None, None, None)
is_issuer_new = not WALLET_FILE.exists()
if is_issuer_new:
    issuer_address, issuer_mnemonic, issuer_sign_message, issuer_sign_tx = create_wallet()
else:
    issuer_address, _, issuer_sign_message, issuer_sign_tx = create_wallet(
        WALLET_FILE.read_text().strip()
    )

client = UVerifyClient(
    base_url=_config["backend_url"],
    sign_message=issuer_sign_message,
    sign_tx=issuer_sign_tx,
)

if is_issuer_new:
    WALLET_FILE.write_text(issuer_mnemonic)
    print(f"Created new issuer wallet: {issuer_address}")
    print("Mnemonic saved to wallet.txt. Keep this file safe.\n")
    funded = client.fund_wallet(issuer_address)
    print(f"Funded by tx: {funded.tx_hash}")
    print("Waiting 90 s for funding to confirm on-chain …")
    time.sleep(90)
else:
    print(f"Restored issuer wallet: {issuer_address}\n")

# Recipient wallet
is_recipient_new = not RECIPIENT_WALLET_FILE.exists()
if is_recipient_new:
    recipient_address, recipient_mnemonic, _, recipient_sign_tx = create_wallet()
    RECIPIENT_WALLET_FILE.write_text(recipient_mnemonic)
    print(f"Created new recipient wallet: {recipient_address}")
    print("Mnemonic saved to recipient_wallet.txt. Keep this file safe.")
    print("Funding recipient wallet …\n")
    funded = client.fund_wallet(recipient_address, issuer_sign_message)
    print(f"Funded by tx: {funded.tx_hash}")
    print("Waiting 90 s for funding to confirm on-chain …")
    time.sleep(90)
else:
    recipient_address, _, _, recipient_sign_tx = create_wallet(
        RECIPIENT_WALLET_FILE.read_text().strip()
    )
    print(f"Restored recipient wallet: {recipient_address}\n")

effective_recipient = args.recipient_wallet or recipient_address
if not args.recipient_wallet:
    print(f"No --recipient-wallet provided — using managed recipient wallet: {effective_recipient}")

asset_name = args.asset_name
asset_name_hex = asset_name.encode().hex()

# Seed UTxO
if args.init_utxo_tx_hash and args.init_utxo_output_index is not None:
    init_utxo_tx_hash = args.init_utxo_tx_hash
    init_utxo_output_index = args.init_utxo_output_index
    print(f"Using provided seed UTxO: {init_utxo_tx_hash}#{init_utxo_output_index}")
elif SEED_UTXO_FILE.exists():
    parts = SEED_UTXO_FILE.read_text().strip().split(":")
    init_utxo_tx_hash = parts[0]
    init_utxo_output_index = int(parts[1])
    print(f"Loaded seed UTxO from seed_utxo.txt: {init_utxo_tx_hash}#{init_utxo_output_index}")
else:
    print(
        "Error: no seed UTxO available.\n"
        "Provide --init-utxo-tx-hash and --init-utxo-output-index on the first run.\n"
        f"Find a UTxO in your issuer wallet via the chain viewer at {_config['chain_viewer_url']}.",
        file=sys.stderr,
    )
    sys.exit(1)

if args.init_utxo_tx_hash and args.init_utxo_output_index is not None:
    SEED_UTXO_FILE.write_text(f"{init_utxo_tx_hash}:{init_utxo_output_index}")

if args.command == "create":
    if args.document_path:
        doc_bytes = Path(args.document_path).read_bytes()
        key = sha256hex(doc_bytes)
        print(f"\nDocument hash (from file {args.document_path}): {key}")
    else:
        doc_bytes = args.document_text.encode()
        key = sha256hex(doc_bytes)
        print(f"\nDocument hash (from text): {key}")

    print("Issuing tokenizable certificate …\n")

    deployer_key_hash = payment_key_hash_from_address(issuer_address)

    cert_metadata = {"asset_name": asset_name}
    if args.issuer_name:
        cert_metadata["issuer_name"] = args.issuer_name
    if args.description:
        cert_metadata["description"] = args.description
    if args.asset_class:
        cert_metadata["asset_class"] = args.asset_class
    if args.ipfs_image:
        cert_metadata["ipfs_image"] = args.ipfs_image

    try:
        result = client.apps.issue_tokenizable_certificate(
            issuer_address,
            TokenizableCertificateInput(
                certificate=CertificateData(
                    hash=key,
                    algorithm="SHA-256",
                    metadata=json.dumps(cert_metadata),
                ),
                owner_address=effective_recipient,
                asset_name_hex=asset_name_hex,
                init_utxo_tx_hash=init_utxo_tx_hash,
                init_utxo_output_index=init_utxo_output_index,
                config=TokenizableConfig(
                    deployer_key_hash=deployer_key_hash,
                    authorized_key_hashes=[deployer_key_hash],
                ),
            ),
        )

        print(f"Transaction submitted: {_config["cexplorer_tx_url"]}/{result.tx_hash}")
        wait_for(lambda: client.verify(key) or False, timeout_ms=300_000)

        print("Certificate confirmed on-chain.")
        print(f"Verify at: {result.verify_url}")

        status = client.apps.get_tokenizable_certificate_status(
            key, init_utxo_tx_hash, init_utxo_output_index
        )
        print(f"Claimed: {status.claimed}")
        print("\nTo redeem, run:")
        print(
            f'  uv run main.py redeem'
            f' --asset-name "{asset_name}"'
            f' --recipient-wallet "{effective_recipient}"'
            f' --key "{key}"'
        )

    except UVerifyTimeoutError:
        print("Timed out waiting for confirmation. Re-run to check again.", file=sys.stderr)
        sys.exit(1)

if args.command == "redeem":
    key = args.key
    print(f"\nRedeeming tokenizable certificate with key: {key} …\n")

    try:
        tx_hash = client.apps.redeem_tokenizable_certificate(
            RedeemTokenizableCertificateInput(
                key=key,
                claimer_address=effective_recipient,
                init_utxo_tx_hash=init_utxo_tx_hash,
                init_utxo_output_index=init_utxo_output_index,
                asset_name_hex=asset_name_hex,
            ),
            recipient_sign_tx,
        )
        print(f"Transaction submitted: {_config["cexplorer_tx_url"]}/{tx_hash}")

        wait_for(
            lambda: (
                client.apps.get_tokenizable_certificate_status(
                    key, init_utxo_tx_hash, init_utxo_output_index
                )
                if client.apps.get_tokenizable_certificate_status(
                    key, init_utxo_tx_hash, init_utxo_output_index
                ).claimed
                else False
            ),
            timeout_ms=300_000,
        )

        print("Certificate successfully redeemed on-chain.")
        status = client.apps.get_tokenizable_certificate_status(
            key, init_utxo_tx_hash, init_utxo_output_index
        )
        print(f"Claimed: {status.claimed}")
        if status.owner:
            print(f"Owner: {status.owner}")

    except UVerifyTimeoutError:
        print("Timed out waiting for confirmation. Re-run to check again.", file=sys.stderr)
        sys.exit(1)
