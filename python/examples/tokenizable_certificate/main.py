"""Tokenizable certificate example — issue an NFT-backed on-chain certificate on Cardano preprod.

This example demonstrates how to insert a node into the on-chain sorted linked list
and mint a CIP-68 NFT pair for the recipient using the tokenizable-certificate extension.

Prerequisites:
  - The UVerify backend must be started with TOKENIZABLE_CERTIFICATE_EXTENSION_ENABLED=true.
  - An Init UTxO must exist (call POST /api/v1/extension/tokenizable-certificate/init first).
  - Set OWNER_PUB_KEY_HASH, ASSET_NAME_HEX, INIT_UTXO_TX_HASH below before running.
"""

import hashlib
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from uverify_sdk import UVerifyClient, UVerifyTimeoutError, wait_for
from uverify_sdk.apps.types import TokenizableCertificateInput
from utils.wallet import create_wallet

WALLET_FILE = Path(__file__).parent / "wallet.txt"
CEXPLORER_TX_URL = "https://preprod.cexplorer.io/tx"

# ─── Configuration ───────────────────────────────────────────────────────────
# In a real scenario, the recipient's public key hash and the chosen asset name
# come from the certificate owner's Cardano wallet.
OWNER_PUB_KEY_HASH = ""  # TODO: 32-byte hex public key hash of the token recipient
ASSET_NAME_HEX = ""      # TODO: hex-encoded CIP-68 asset name (e.g. "436572744e4654")
INIT_UTXO_TX_HASH = ""   # TODO: transaction hash of the Init UTxO
INIT_UTXO_OUTPUT_INDEX = 0

if not OWNER_PUB_KEY_HASH or not ASSET_NAME_HEX or not INIT_UTXO_TX_HASH:
    print("ERROR: Set OWNER_PUB_KEY_HASH, ASSET_NAME_HEX, and INIT_UTXO_TX_HASH before running.")
    sys.exit(1)

# ─── Wallet setup ────────────────────────────────────────────────────────────
is_new = not WALLET_FILE.exists()
if is_new:
    address, mnemonic, sign_message, sign_tx = create_wallet()
else:
    address, _, sign_message, sign_tx = create_wallet(WALLET_FILE.read_text().strip())
    mnemonic = None

client = UVerifyClient(
    base_url="https://api.preprod.uverify.io",
    sign_message=sign_message,
    sign_tx=sign_tx,
)

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

# ─── Certificate content ──────────────────────────────────────────────────────
document_content = "Certificate of Participation — Alice Smith — Blockchain Summit 2025"

# The on-chain key is the SHA-256 hash of the content being certified.
key = hashlib.sha256(document_content.encode("utf-8")).hexdigest()

print(f"Issuing tokenizable certificate for key: {key}")

# ─── Issue the tokenizable certificate ───────────────────────────────────────
try:
    result = client.apps.issue_tokenizable_certificate(
        address,
        TokenizableCertificateInput(
            key=key,
            owner_pub_key_hash=OWNER_PUB_KEY_HASH,
            asset_name_hex=ASSET_NAME_HEX,
            init_utxo_tx_hash=INIT_UTXO_TX_HASH,
            init_utxo_output_index=INIT_UTXO_OUTPUT_INDEX,
        ),
    )

    print(f"Transaction submitted: {CEXPLORER_TX_URL}/{result.tx_hash}")
    print("Waiting for on-chain confirmation …")

    wait_for(
        lambda: client.verify(key) or False,
        timeout_ms=300_000,
    )
    print("Certificate confirmed on-chain.")
    print(f"Verify at: {result.verify_url}\n")

    # ─── Query status ──────────────────────────────────────────────────────
    print("Querying certificate status …")
    status = client.apps.get_tokenizable_certificate_status(
        key, INIT_UTXO_TX_HASH, INIT_UTXO_OUTPUT_INDEX
    )
    print(f"  Key:     {status.key}")
    print(f"  Claimed: {status.claimed}")
    if status.owner:
        print(f"  Owner:   {status.owner}")

    print("\nDone. The tokenizable certificate is permanently anchored on Cardano.")

except UVerifyTimeoutError:
    print(
        "\nTimed out waiting for confirmation. The transaction may still be processing.\n"
        "Re-run the script to check again or increase the timeout if this happens repeatedly."
    )
    sys.exit(1)
