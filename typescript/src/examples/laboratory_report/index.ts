import { UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';
import { createWallet } from '../../utils/wallet.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const WALLET_FILE = 'wallet.txt';
const CEXPLORER_TX_URL = 'https://preprod.cexplorer.io/tx';

const LAB_NAME = 'Berlin Medical Diagnostics GmbH';
const LAB_CONTACT = 'results@bmd-lab.example';

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

const reports = [
  {
    patientName: 'Sophie Wagner',
    reportId: 'BMD-2024-10-00123',
    labName: LAB_NAME,
    contact: LAB_CONTACT,
    auditable: false,
    values: {
      glucose: '5.4 mmol/L',
      hba1c: '5.7%',
      cholesterol: '4.9 mmol/L',
      hdl: '1.8 mmol/L',
      ldl: '2.6 mmol/L',
      triglycerides: '1.2 mmol/L',
    },
  },
  {
    patientName: 'Thomas Richter',
    reportId: 'BMD-2024-10-00124',
    labName: LAB_NAME,
    contact: LAB_CONTACT,
    auditable: true,
    values: {
      creatinine: '82 μmol/L',
      urea: '5.8 mmol/L',
      egfr: '91 mL/min/1.73m²',
      uric_acid: '340 μmol/L',
      sodium: '141 mmol/L',
      potassium: '4.1 mmol/L',
    },
  },
];

console.log(`Issuing ${reports.length} lab reports in a single transaction …`);
for (const r of reports) {
  console.log(`  • ${r.reportId} — ${r.patientName}`);
}

try {
  const result = await client.apps.issueLaboratoryReport(address, reports);
  console.log(`\nTransaction submitted: ${CEXPLORER_TX_URL}/${result.txHash}`);
  await waitFor(result.txHash);
  console.log('All reports confirmed on-chain.\n');

  console.log('Verification deep links (share with each patient):');
  for (const cert of result.certificates) {
    console.log(`  ${cert.patientName} / ${cert.reportId}`);
    console.log(`    ${cert.verifyUrl}\n`);
  }
  console.log('Done. All lab reports are permanently anchored on Cardano.');
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
