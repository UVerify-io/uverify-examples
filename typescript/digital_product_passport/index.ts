import { Address, Bytes, COSE, PrivateKey, TransactionWitnessSet } from '@evolution-sdk/evolution';
import { make as makeEvolutionClient } from '@evolution-sdk/evolution/sdk/client/Client';
import { preprod } from '@evolution-sdk/evolution/sdk/client/Chain';
import { addressFromSeed } from '@evolution-sdk/evolution/sdk/wallet/Derivation';
import { UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';

const WALLET_FILE = new URL('./wallet.txt', import.meta.url);
const CEXPLORER_TX_URL = 'https://preprod.cexplorer.io/tx';

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
    Deno.exit(1);
  }
  throw error;
}
