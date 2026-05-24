import { Address, Bytes, COSE, PrivateKey, TransactionWitnessSet } from '@evolution-sdk/evolution';
import { make as makeEvolutionClient } from '@evolution-sdk/evolution/sdk/client/Client';
import { mainnet, preprod } from '@evolution-sdk/evolution/sdk/client/Chain';
import { addressFromSeed } from '@evolution-sdk/evolution/sdk/wallet/Derivation';
import { InsufficientFundsError, UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';

try {
  const envText = await Deno.readTextFile(new URL('../.env', import.meta.url));
  for (const line of envText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!Deno.env.has(key)) Deno.env.set(key, val);
  }
} catch {
  // .env not found, using defaults
}

const network = Deno.env.get('UVERIFY_NETWORK') ?? 'sandbox';
const config = (() => {
  if (network === 'mainnet') return {
    evolutionChain: mainnet,
    networkId: 1 as const,
    backendUrl: 'https://api.uverify.io',
    cexplorerTxUrl: 'https://cexplorer.io/tx',
    verifyUrl: 'https://app.uverify.io/verify',
  };
  if (network === 'preprod') return {
    evolutionChain: preprod,
    networkId: 0 as const,
    backendUrl: 'https://api.preprod.uverify.io',
    cexplorerTxUrl: 'https://preprod.cexplorer.io/tx',
    verifyUrl: 'https://app.preprod.uverify.io/verify',
  };
  return {
    evolutionChain: preprod,
    networkId: 0 as const,
    backendUrl: 'http://localhost:9090',
    cexplorerTxUrl: 'http://localhost:3001',
    verifyUrl: 'http://localhost:3000/verify',
  };
})();

const WALLET_FILE = new URL('./wallet.txt', import.meta.url);

function walletFromMnemonic(mnemonic: string) {
  const evolutionClient = makeEvolutionClient(config.evolutionChain).withSeed({ mnemonic, addressType: 'Enterprise' });
  const { address: addressObj } = addressFromSeed(mnemonic, { addressType: 'Enterprise', networkId: config.networkId });
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

async function sha256hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const buffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

const client = new UVerifyClient({ baseUrl: config.backendUrl, signMessage, signTx });
const { waitFor, fundWallet, issueCertificates } = client;

if (isNew) {
  await Deno.writeTextFile(WALLET_FILE, mnemonic);
  console.log('Created new wallet:', address);
  console.log('Mnemonic saved to wallet.txt. Keep this file safe.\n');
  await waitFor(await fundWallet(address));
} else {
  console.log('Restored wallet:', address, '\n');
}

const runId = crypto.randomUUID();

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

const certs = await Promise.all(pets.map(async (p) => ({
  hash: await sha256hex(p.petName + p.phone + runId),
  algorithm: 'SHA-256' as const,
  metadata: JSON.stringify({
    uverify_template_id: 'petNecklace',
    uverify_update_policy: 'restricted',
    pet_name: p.petName,
    uv_url_owner_name: await sha256hex(p.ownerName),
    uv_url_phone: await sha256hex(p.phone),
    species: p.species,
    ...(p.breed ? { breed: p.breed } : {}),
    ...(p.note ? { note: p.note } : {}),
  }),
})));

console.log(`Issuing ${certs.length} pet necklace certificate(s) …`);
for (const p of pets) {
  console.log(`  • ${p.petName} (${p.species}${p.breed ? ' · ' + p.breed : ''})`);
}

async function run(): Promise<string> {
  const txHash = await issueCertificates(address, certs);
  console.log(`\nTransaction submitted: ${config.cexplorerTxUrl}/${txHash}`);
  await waitFor(txHash);
  console.log('All pet certificates confirmed on-chain.\n');
  return txHash;
}

let txHash: string;
try {
  txHash = await run();
} catch (error) {
  if (error instanceof InsufficientFundsError) {
    console.log('\nInsufficient funds. Funding wallet and retrying …');
    await waitFor(await fundWallet(address));
    txHash = await run();
  } else if (error instanceof WaitForTimeoutError) {
    console.error(
      '\nTimed out waiting for confirmation. The transaction may still be processing.\n' +
        'Re-run the script to check again or increase the timeout if this happens repeatedly.',
    );
    Deno.exit(1);
  } else {
    throw error;
  }
}

console.log('Necklace tag QR-code URLs:');
for (const p of pets) {
  const hash = await sha256hex(p.petName + p.phone + runId);
  const params = new URLSearchParams({ owner_name: p.ownerName, phone: p.phone });
  console.log(`  ${p.petName}`);
  console.log(`    ${config.verifyUrl}/${hash}/${txHash}?${params}\n`);
}

console.log('Done. All pet certificates are permanently anchored on Cardano.');
