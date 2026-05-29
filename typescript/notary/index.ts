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
    '  --number  Number of items to notarise in one transaction (default: 1)\n' +
    '  --help    Show this help\n\n' +
    'The plan must contain a "content" field — the text whose SHA-256 hash is\n' +
    'recorded on-chain. All other fields become on-chain metadata.\n\n' +
    'To certify a file, hash it beforehand and pass the hex digest as content:\n' +
    '  sha256sum myfile.pdf\n' +
    'Then add the hash to a plan with static type, or pass it directly via a\n' +
    'custom plan that sets "content" to the file bytes (for small files).'
  );
  Deno.exit(planPath ? 0 : 1);
}

const plan: Plan = JSON.parse(await Deno.readTextFile(planPath));

async function sha256hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data.slice();
  const buffer = await crypto.subtle.digest('SHA-256', bytes);
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

const items = await Promise.all(
  Array.from({ length: number }, () => {
    const data = evaluatePlan(plan);
    const content = String(data.content);
    const metadata = Object.fromEntries(
      Object.entries(data).filter(([k]) => k !== 'content')
    );
    return sha256hex(content).then((hash) => ({ hash, content, metadata }));
  })
);

const certs = items.map(({ hash, metadata }) => ({
  hash,
  algorithm: 'SHA-256' as const,
  metadata: JSON.stringify(metadata),
}));

console.log(`Notarising ${certs.length} item(s) in a single transaction …`);
for (const item of items) {
  const preview = item.content.length > 60 ? item.content.slice(0, 57) + '…' : item.content;
  console.log(`  • "${preview}" → ${item.hash.slice(0, 12)}…`);
}

async function run() {
  const txHash = await issueCertificates(address, certs);
  console.log(`\nTransaction submitted: ${config.cexplorerTxUrl}/${txHash}`);
  await waitFor(txHash);
  console.log('All items confirmed on-chain.\n');

  console.log('Verification links:');
  for (const item of items) {
    console.log(`  ${config.verifyUrl}/${item.hash}`);
  }
  console.log('\nDone. All certificates are permanently recorded on Cardano.');
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
