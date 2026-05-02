import { Address, Bytes, COSE, PrivateKey, TransactionWitnessSet } from '@evolution-sdk/evolution';
import { make as makeEvolutionClient } from '@evolution-sdk/evolution/sdk/client/Client';
import { preprod } from '@evolution-sdk/evolution/sdk/client/Chain';
import { addressFromSeed } from '@evolution-sdk/evolution/sdk/wallet/Derivation';
import { UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';

const WALLET_FILE = new URL('./wallet.txt', import.meta.url);
const CEXPLORER_TX_URL = 'https://preprod.cexplorer.io/tx';
const INSURER = 'Acme Insurance AG';
const PRODUCER = 'Schmidt Insurance Brokers';

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

console.log('Issuing Certificate of Insurance …');
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
    Deno.exit(1);
  }
  throw error;
}
