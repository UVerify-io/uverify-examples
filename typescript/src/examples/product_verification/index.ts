import { UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';
import { sha256 } from 'js-sha256';
import { createWallet } from '../../utils/wallet.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const WALLET_FILE = 'wallet.txt';
const VERIFY_URL = 'https://app.preprod.uverify.io/verify';
const CEXPLORER_TX_URL = 'https://preprod.cexplorer.io/tx';

const isNew = !existsSync(WALLET_FILE);
const wallet = isNew
  ? await createWallet()
  : await createWallet(readFileSync(WALLET_FILE, 'utf-8').trim());

const { address, signMessage, signTx } = wallet;
const client = new UVerifyClient({ signMessage, signTx });
const { waitFor, fundWallet, issueCertificates } = client;

if (isNew) {
  writeFileSync(WALLET_FILE, wallet.mnemonic, 'utf-8');
  console.log('Created new wallet:', address);
  console.log('Mnemonic saved to wallet.txt. Keep this file safe.\n');
  await waitFor(await fundWallet(address));
} else {
  console.log('Restored wallet:', address, '\n');
}

const product = {
  name: 'Organic Cotton Signature Tee',
  manufacturer: 'EcoWear GmbH',
  productionDate: '2024-10-01',
  materialInfo: '100% GOTS-certified organic cotton. Machine wash 30°C. Do not tumble dry.',
  serialNumber: 'EW-2024-TC-00847',
  imageUrl: 'https://images.ecowear.example/tc-00847.jpg',
};

const runId = randomUUID();
const hash = sha256(product.manufacturer + product.serialNumber + runId);

const metadata = {
  uverify_template_id: 'productVerification',
  uverify_update_policy: 'first',
  productName: product.name,
  manufacturer: product.manufacturer,
  productionDate: product.productionDate,
  materialInfo: product.materialInfo,
  serialNumber: product.serialNumber,
  imageUrl: product.imageUrl,
};

console.log(`Issuing product authentication certificate for "${product.name}" …`);
console.log(`  Serial : ${product.serialNumber}`);
console.log(`  Hash   : ${hash}\n`);

let txHash: string;
try {
  txHash = await issueCertificates(address, [
    { hash, algorithm: 'SHA-256', metadata: JSON.stringify(metadata) },
  ]);
  console.log(`Transaction submitted: ${CEXPLORER_TX_URL}/${txHash}`);
  await waitFor(txHash);
  console.log('Product authentication certificate confirmed on-chain.\n');
} catch (error) {
  if (error instanceof WaitForTimeoutError) {
    console.error(
      '\nTimed out waiting for confirmation. The transaction may still be processing.\n' +
        'Re-run the script to check again or increase the timeout if this happens repeatedly.',
    );
    process.exit(1);
  }
  throw error;
}

console.log('Product authentication URL (encode as QR code on the product label):');
console.log(`  ${VERIFY_URL}/${hash}/${txHash}`);
console.log('\nDone. The product authentication certificate is permanently anchored on Cardano.');
