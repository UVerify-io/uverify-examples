import { UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';
import { createWallet } from '../../utils/wallet.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const WALLET_FILE = 'wallet.txt';
const CEXPLORER_TX_URL = 'https://preprod.cexplorer.io/tx';

const isNew = !existsSync(WALLET_FILE);
const wallet = isNew
  ? await createWallet()
  : await createWallet(readFileSync(WALLET_FILE, 'utf-8').trim());

const { address, signMessage, signTx } = wallet;
const client = new UVerifyClient({ baseUrl: 'https://api.preprod.uverify.io', signMessage, signTx });
const { waitFor, fundWallet } = client;

if (isNew) {
  writeFileSync(WALLET_FILE, wallet.mnemonic, 'utf-8');
  console.log('Created new wallet:', address);
  console.log('Mnemonic saved to wallet.txt. Keep this file safe.\n');
  await waitFor(await fundWallet(address));
} else {
  console.log('Restored wallet:', address, '\n');
}

const document = 'Certificate of Participation — Alice Smith — Blockchain Summit 2025';
const key = createHash('sha256').update(document, 'utf8').digest('hex');

const OWNER_PUB_KEY_HASH  = 'YOUR_OWNER_PUB_KEY_HASH';
const ASSET_NAME_HEX      = 'YOUR_ASSET_NAME_HEX';
const INIT_UTXO_TX_HASH   = 'YOUR_INIT_UTXO_TX_HASH';
const INIT_UTXO_OUTPUT_INDEX = 0;

console.log('Issuing tokenizable certificate …');

try {
  const result = await client.apps.issueTokenizableCertificate(address, {
    key,
    ownerPubKeyHash: OWNER_PUB_KEY_HASH,
    assetNameHex: ASSET_NAME_HEX,
    initUtxoTxHash: INIT_UTXO_TX_HASH,
    initUtxoOutputIndex: INIT_UTXO_OUTPUT_INDEX,
  });
  console.log(`Transaction submitted: ${CEXPLORER_TX_URL}/${result.txHash}`);
  await waitFor(result.txHash);
  console.log('Certificate confirmed on-chain.');
  console.log(`Verify at: ${result.verifyUrl}`);

  const status = await client.apps.getTokenizableCertificateStatus(
    key, INIT_UTXO_TX_HASH, INIT_UTXO_OUTPUT_INDEX,
  );
  console.log(`Claimed: ${status.claimed}`);
} catch (error) {
  if (error instanceof WaitForTimeoutError) {
    console.error('Timed out waiting for confirmation. Re-run to check again.');
    process.exit(1);
  }
  throw error;
}
