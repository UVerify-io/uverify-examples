import { UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';
import { createWallet } from '../../utils/wallet.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const WALLET_FILE = 'wallet.txt';
const CEXPLORER_TX_URL = 'https://preprod.cexplorer.io/tx';
const INSTITUTION = 'Technical University of Munich';

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

const graduates = [
  { name: 'Maria Müller',  studentId: 'TUM-2021-0042', degree: 'Master of Science in Computer Science',   graduationDate: '2024-06-28', honors: 'Summa Cum Laude' },
  { name: 'Felix Schmidt', studentId: 'TUM-2021-0117', degree: 'Master of Science in Computer Science',   graduationDate: '2024-06-28' },
  { name: 'Layla Hassan',  studentId: 'TUM-2021-0284', degree: 'Master of Science in Electrical Engineering', graduationDate: '2024-06-28', honors: 'Magna Cum Laude' },
];

console.log(`Issuing ${graduates.length} diplomas …`);

try {
  const result = await client.apps.issueDiploma(
    address,
    graduates.map((g) => ({ ...g, institution: INSTITUTION })),
  );
  console.log(`Transaction submitted: ${CEXPLORER_TX_URL}/${result.txHash}`);
  await waitFor(result.txHash);
  console.log('All diplomas confirmed on-chain.\n');

  console.log('Verification links (the ?name= parameter reveals the recipient on the certificate page):');
  for (const cert of result.certificates) {
    console.log(`  ${cert.name}: ${cert.verifyUrl}`);
  }
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
