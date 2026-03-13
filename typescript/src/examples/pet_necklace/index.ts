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

const runId = randomUUID();

const pets = [
  {
    petName: 'Luna',
    ownerName: 'Emma Schneider',
    phone: '+49 30 12345678',
    species: 'Dog',
    breed: 'Golden Retriever',
    note: 'Very friendly! Please call if found.',
  },
  {
    petName: 'Mochi',
    ownerName: 'Jonas Weber',
    phone: '+49 89 98765432',
    species: 'Cat',
    breed: 'Siamese',
    note: 'Indoor cat — please do not let outside.',
  },
];

const certs = pets.map((p) => ({
  hash: sha256(p.petName + p.phone + runId),
  algorithm: 'SHA-256' as const,
  metadata: JSON.stringify({
    uverify_template_id: 'petNecklace',
    uverify_update_policy: 'restricted',
    pet_name: p.petName,
    uv_url_owner_name: sha256(p.ownerName),
    uv_url_phone: sha256(p.phone),
    species: p.species,
    ...(p.breed ? { breed: p.breed } : {}),
    ...(p.note ? { note: p.note } : {}),
  }),
}));

console.log(`Issuing ${certs.length} pet necklace certificate(s) …`);
for (const p of pets) {
  console.log(`  • ${p.petName} (${p.species}${p.breed ? ' · ' + p.breed : ''})`);
}

let txHash: string;
try {
  txHash = await issueCertificates(address, certs);
  console.log(`\nTransaction submitted: ${CEXPLORER_TX_URL}/${txHash}`);
  await waitFor(txHash);
  console.log('All pet certificates confirmed on-chain.\n');
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

console.log('Necklace tag QR-code URLs:');
for (const p of pets) {
  const hash = sha256(p.petName + p.phone + runId);
  const params = new URLSearchParams({ owner_name: p.ownerName, phone: p.phone });
  console.log(`  ${p.petName}`);
  console.log(`    ${VERIFY_URL}/${hash}/${txHash}?${params}\n`);
}

console.log('Done. All pet certificates are permanently anchored on Cardano.');
