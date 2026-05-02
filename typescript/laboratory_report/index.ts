import { Address, Bytes, COSE, PrivateKey, TransactionWitnessSet } from '@evolution-sdk/evolution';
import { make as makeEvolutionClient } from '@evolution-sdk/evolution/sdk/client/Client';
import { preprod } from '@evolution-sdk/evolution/sdk/client/Chain';
import { addressFromSeed } from '@evolution-sdk/evolution/sdk/wallet/Derivation';
import { UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';

const WALLET_FILE = new URL('./wallet.txt', import.meta.url);
const CEXPLORER_TX_URL = 'https://preprod.cexplorer.io/tx';
const LAB_NAME = 'Berlin Medical Diagnostics GmbH';
const LAB_CONTACT = 'results@bmd-lab.example';

function walletFromMnemonic(mnemonic: string) {
  const evolutionClient = makeEvolutionClient(preprod).withSeed({ mnemonic, addressType: 'Enterprise' });
  const { address: addressObj } = addressFromSeed(mnemonic, { addressType: 'Enterprise', networkId: 0 });
  const addressHex = Address.toHex(addressObj);
  const addressBech32 = Address.toBech32(addressObj);
  const paymentKey = PrivateKey.fromMnemonicCardano(mnemonic);

  const signTx = async (unsignedTx: string): Promise<string> => {
    const witnessSet = await evolutionClient.signTx(unsignedTx);
    return TransactionWitnessSet.toCBORHex(witnessSet);
  };

  const signMessage = (message: string): Promise<{ key: string; signature: string }> => {
    const payload = new TextEncoder().encode(message);
    const { signature, key } = COSE.SignData.signData(addressHex, payload, paymentKey);
    return Promise.resolve({ key: Bytes.toHex(key), signature: Bytes.toHex(signature) });
  };

  return { address: addressBech32, mnemonic, signTx, signMessage };
}

function createWallet() {
  const mnemonic = PrivateKey.generateMnemonic(256);
  return walletFromMnemonic(mnemonic);
}

let storedMnemonic: string | undefined;
try {
  storedMnemonic = (await Deno.readTextFile(WALLET_FILE)).trim();
} catch {
  // wallet.txt does not exist yet
}

const isNew = storedMnemonic === undefined;
const wallet = isNew ? createWallet() : walletFromMnemonic(storedMnemonic!);
const { address, signTx, signMessage, mnemonic } = wallet;

const client = new UVerifyClient({ signMessage, signTx });
const { waitFor, fundWallet } = client;

if (isNew) {
  await Deno.writeTextFile(WALLET_FILE, mnemonic);
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
    Deno.exit(1);
  }
  throw error;
}
