import { UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';
import { createWallet } from '../../utils/wallet.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const WALLET_FILE = 'wallet.txt';
const CEXPLORER_TX_URL = 'https://preprod.cexplorer.io/tx';

const INSURER = 'Acme Insurance AG';
const PRODUCER = 'Schmidt Insurance Brokers';

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

const coi = {
  policyNumber: 'AI-GL-2025-049891',
  insurer: INSURER,
  producer: PRODUCER,
  insured: 'TechBuild GmbH',
  insuredAddress: 'Unter den Linden 12, 10117 Musterstadt, Germany',
  effectiveDate: '2025-01-01',
  expirationDate: '2027-01-01',
  certificateHolder: 'City of Musterstadt — Department of Infrastructure',
  certificateHolderAddress: 'Musterstadt Str. 1, 10117 Musterstadt, Germany',
  additionalInsured: true,
  waiverOfSubrogation: false,
  coverages: {
    general_liability: '2,000,000',
    workers_compensation: '1,000,000',
    auto_liability: '1,000,000',
    umbrella: '5,000,000',
  },
};

console.log(`Issuing Certificate of Insurance …`);
console.log(`  Policy  : ${coi.policyNumber}`);
console.log(`  Insured : ${coi.insured}`);
console.log(`  Holder  : ${coi.certificateHolder}`);
console.log(`  Valid   : ${coi.effectiveDate} → ${coi.expirationDate}\n`);

try {
  const { txHash, verifyUrl } = await client.apps.issueCertificateOfInsurance(address, coi);

  console.log(`Transaction submitted: ${CEXPLORER_TX_URL}/${txHash}`);
  await waitFor(txHash);
  console.log('Certificate of Insurance confirmed on-chain.\n');

  console.log('Verification URL (share with certificate holder or auditors):');
  console.log(`  ${verifyUrl}`);
  console.log('\nDone. The Certificate of Insurance is permanently anchored on Cardano.');
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
