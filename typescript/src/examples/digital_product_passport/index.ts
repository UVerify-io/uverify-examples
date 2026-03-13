import { UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';
import { createWallet } from '../../utils/wallet.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const WALLET_FILE = 'wallet.txt';
const CEXPLORER_TX_URL = 'https://preprod.cexplorer.io/tx';

const isNew = !existsSync(WALLET_FILE);
const wallet = isNew
  ? await createWallet()
  : await createWallet(readFileSync(WALLET_FILE, 'utf-8').trim());

const { address, signMessage, signTx } = wallet;
const client = new UVerifyClient({ signMessage, signTx });
const { waitFor, fundWallet } = client;

if (isNew) {
  writeFileSync(WALLET_FILE, wallet.mnemonic, 'utf-8');
  console.log('Created new wallet:', address);
  console.log('Mnemonic saved to wallet.txt. Keep this file safe.\n');
  await waitFor(await fundWallet(address));
} else {
  console.log('Restored wallet:', address, '\n');
}

const product = {
  name: 'EcoCharge Powerbank Pro 200',
  manufacturer: 'GreenTech AG',
  model: 'EC-200-2024',
  gtin: '04012345678901',
  serialNumber: 'EC200-SN-20240815-00847',
  origin: 'Germany',
  manufactured: '2024-08-15',
  contact: 'sustainability@greentech-ag.example',
  brandColor: '#1a56db',
};

console.log(`Issuing Digital Product Passport for "${product.name}" …`);
console.log(`  GTIN   : ${product.gtin}`);
console.log(`  Serial : ${product.serialNumber}\n`);

try {
  const { txHash, verifyUrl } = await client.apps.issueDigitalProductPassport(address, {
    ...product,
    carbonFootprint: '1.2 kg CO₂e',
    recycledContent: '38%',
    energyClass: 'A++',
    warranty: '3 years',
    spareParts: 'Available until 2034',
    repairInfo: 'https://greentech-ag.example/repair/ec-200',
    recycling: 'Return to any EU-authorised WEEE recycling point. Remove battery before disposal.',
    materials: {
      aluminum: '45%',
      recycled_plastic: '38%',
      lithium_cells: '12%',
      copper: '5%',
    },
    certifications: {
      ce: 'CE Marking',
      rohs: 'RoHS Compliant',
      energy_star: 'Energy Star 8.0',
      reach: 'REACH Compliant',
    },
  });
  console.log(`Transaction submitted: ${CEXPLORER_TX_URL}/${txHash}`);
  await waitFor(txHash);
  console.log('Digital Product Passport confirmed on-chain.\n');

  console.log('Product passport URL (share with customers / regulators):');
  console.log(`  ${verifyUrl}`);
  console.log('\nDone. The Digital Product Passport is permanently anchored on Cardano.');
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
