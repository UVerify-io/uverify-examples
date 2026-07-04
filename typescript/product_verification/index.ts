import { Address, Bytes, COSE, PrivateKey, TransactionWitnessSet } from '@evolution-sdk/evolution';
import { make as makeEvolutionClient } from '@evolution-sdk/evolution/sdk/client/Client';
import { addressFromSeed } from '@evolution-sdk/evolution/sdk/wallet/Derivation';
import { InsufficientFundsError, UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';
import { evaluatePlan, getArg, getNetworkConfig, loadEnv, type Plan } from '../helper.ts';

await loadEnv(new URL('../.env', import.meta.url));
const config = getNetworkConfig();

const WALLET_FILE = new URL('./wallet.txt', import.meta.url);

// ── CLI args ─────────────────────────────────────────────────────────────────

const planPath = getArg('plan');
const number   = Number(getArg('number') ?? '1');

if (!planPath || Deno.args.includes('--help')) {
  console.log(
    'Usage: deno run -A index.ts --plan <plan.json> [--number <N>]\n\n' +
    'Options:\n' +
    '  --plan    Path to a plan JSON file (same format as sandbox/simulator)\n' +
    '  --number  Number of product certificates to issue in one transaction (default: 1)\n' +
    '  --help    Show this help'
  );
  Deno.exit(planPath ? 0 : 1);
}

const plan: Plan = JSON.parse(await Deno.readTextFile(planPath));

async function sha256hex(data: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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

let storedMnemonic: string | undefined;
try {
  storedMnemonic = (await Deno.readTextFile(WALLET_FILE)).trim();
} catch {
  // wallet.txt does not exist yet
}

const isNew = storedMnemonic === undefined;
const wallet = isNew ? createWallet() : walletFromMnemonic(storedMnemonic!);
const { address, signTx, signMessage, mnemonic } = wallet;

console.log(`Using network: ${config.network}`);
console.log(`Backend URL: ${config.backendUrl}`);

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

type ProductData = { name: string; manufacturer: string; productionDate: string; materialInfo: string; serialNumber: string; nfc_public_key: string; imageUrl?: string };
const products = Array.from({ length: number }, () => evaluatePlan(plan)) as ProductData[];

const items = await Promise.all(products.map(async (p) => {
  const hash = await sha256hex(p.nfc_public_key);
  return { product: p, hash };
}));

const certs = items.map(({ product: p, hash }) => ({
  hash,
  algorithm: 'SHA-256' as const,
  metadata: JSON.stringify({
    uverify_template_id: 'productVerification',
    uverify_update_policy: 'first',
    productName: p.name,
    manufacturer: p.manufacturer,
    productionDate: p.productionDate,
    materialInfo: p.materialInfo,
    serialNumber: p.serialNumber,
    ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}),
  }),
}));

console.log(`Issuing ${certs.length} product authentication certificate(s) in a single transaction …`);
for (const { product: p } of items) {
  console.log(`  • "${p.name}" — ${p.serialNumber}`);
}

async function run(): Promise<string> {
  const txHash = await issueCertificates(address, certs);
  console.log(`\nTransaction submitted: ${config.cexplorerTxUrl}/${txHash}`);
  await waitFor(txHash);
  console.log('All certificates confirmed on-chain.\n');
  return txHash;
}

try {
  await run();
} catch (error) {
  if (error instanceof InsufficientFundsError) {
    console.log('\nInsufficient funds. Funding wallet and retrying …');
    await waitFor(await fundWallet(address));
    await run();
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

console.log('Product authentication URLs (encode as QR code on the product label):');
for (const { product: p } of items) {
  console.log(`  ${p.name}`);
  console.log(`    ${config.verifyUrl}/verify?message=${p.nfc_public_key}\n`);
}

console.log('Done. All product authentication certificates are permanently anchored on Cardano.');
