/**
 * sign.js — Sign a Cardano transaction with a wallet derived from a mnemonic.
 *
 * Reads from .env in the same directory as this script:
 *   SIGNER_MNEMONIC   24-word BIP-39 phrase
 *   CARDANO_NETWORK   MAINNET | PREPROD  (default: PREPROD)
 *
 * Usage:
 *   node sign.js <cbor_tx_hex>
 *
 * Output (stdout):
 *   {
 *     "transaction": "<signed_cbor_tx_hex>",
 *     "witnessSet": ""
 *   }
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { config } from 'dotenv';
import { MeshWallet } from '@meshsdk/wallet';

// Load .env from the same directory as this script (not cwd)
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });

// ── CLI arg ────────────────────────────────────────────────────────────────────
const txCbor = process.argv[2];
if (!txCbor) {
  console.error('Usage: node sign.js <cbor_tx_hex>');
  process.exit(1);
}

// ── Config ─────────────────────────────────────────────────────────────────────
const mnemonic  = process.env.SIGNER_MNEMONIC;
const network   = (process.env.CARDANO_NETWORK ?? 'PREPROD').toUpperCase();
const networkId = network === 'MAINNET' ? 1 : 0;

if (!mnemonic?.trim()) {
  console.error('Error: SIGNER_MNEMONIC not set in .env');
  process.exit(1);
}

// ── Wallet ─────────────────────────────────────────────────────────────────────
const wallet = new MeshWallet({
  networkId,
  key: {
    type: 'mnemonic',
    words: mnemonic.trim().split(/\s+/),
  },
});

console.log(`Wallet address: ${await wallet.getChangeAddress()}`);

// ── Sign ───────────────────────────────────────────────────────────────────────
// signTx returns the fully signed transaction CBOR (witness set embedded).
// The backend accepts { transaction, witnessSet: "" } when the witness is
// already included in the transaction body.
const transaction = await wallet.signTx(txCbor, false);

// ── Output ─────────────────────────────────────────────────────────────────────
console.log(JSON.stringify({ transaction, witnessSet: '' }, null, 2));
