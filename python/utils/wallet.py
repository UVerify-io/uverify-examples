"""Cardano headless-wallet helper for the UVerify Python examples.

Derives payment keys via CIP-1852 (m/1852'/1815'/0'/0/0) from a BIP-39
mnemonic.  Signs Cardano transactions (returns witness-set CBOR only) and
CIP-8 messages (CIP-30 ``signData``) as required by the UVerify SDK.

Dependencies (see requirements.txt):
    pip install pycardano>=0.9.0 mnemonic>=0.21
"""
from __future__ import annotations

from typing import Callable, Optional, Tuple

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
from uverify_sdk import DataSignature

NETWORK = Network.TESTNET
_DERIVATION_PATH = "m/1852'/1815'/0'/0/0"


def create_wallet(
    mnemonic_phrase: Optional[str] = None,
) -> Tuple[str, str, Callable[[str], DataSignature], Callable[[str], str]]:
    """Create or restore a Cardano headless wallet.

    Args:
        mnemonic_phrase: 24-word BIP-39 phrase.  A fresh wallet is generated
                         when omitted.

    Returns:
        A 4-tuple ``(bech32_address, mnemonic_phrase, sign_message, sign_tx)``.
        ``sign_message`` and ``sign_tx`` are callback functions compatible with
        :class:`uverify_sdk.UVerifyClient`.
    """
    if mnemonic_phrase is None:
        mnemonic_phrase = BIP39("english").generate(strength=256)  # 24 words

    hd = HDWallet.from_mnemonic(mnemonic_phrase)
    child = hd.derive_from_path(_DERIVATION_PATH)

    signing_key = PaymentSigningKey.from_primitive(child.private_key)
    verification_key = PaymentVerificationKey.from_signing_key(signing_key)
    address = Address(payment_part=verification_key.hash(), network=NETWORK)

    def sign_message(message: str) -> DataSignature:
        """CIP-8 / CIP-30 ``signData`` — returns CBOR-encoded COSESign1 + COSEKey."""
        sig_bytes, key_bytes = cip8_sign(
            payload=message.encode("utf-8"),
            signing_key=signing_key,
            attach_cose_key=True,
            network=NETWORK,
        )
        return DataSignature(key=key_bytes.hex(), signature=sig_bytes.hex())

    def sign_tx(unsigned_tx_hex: str) -> str:
        """Sign a CBOR-hex transaction; return the witness-set CBOR-hex."""
        tx = Transaction.from_cbor(unsigned_tx_hex)
        tx_hash = bytes(tx.transaction_body.hash())
        signature = signing_key.sign(tx_hash)
        witness_set = TransactionWitnessSet(
            vkey_witnesses=[VerificationKeyWitness(verification_key, signature)]
        )
        return witness_set.to_cbor_hex()

    return str(address), mnemonic_phrase, sign_message, sign_tx
