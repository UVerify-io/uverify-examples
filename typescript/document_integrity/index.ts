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
const filePath = getArg('file');

if (!planPath || Deno.args.includes('--help')) {
  console.log(
    'Usage: deno run -A index.ts --plan <plan.json> [--file <path>]\n\n' +
    'Options:\n' +
    '  --plan  Path to a plan JSON file (same format as sandbox/simulator)\n' +
    '  --file  Path to the file to certify (default: sample_thesis.zip)\n' +
    '  --help  Show this help\n\n' +
    'The plan defines certificate metadata: title, issuer, author, filename,\n' +
    'location, file_hint, description. The SHA-256 hash of the actual file\n' +
    'content is used as the on-chain certificate fingerprint.'
  );
  Deno.exit(planPath ? 0 : 1);
}

const plan: Plan = JSON.parse(await Deno.readTextFile(planPath));
const meta = evaluatePlan(plan);

async function sha256hex(data: Uint8Array | string): Promise<string> {
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
  const txHash = await fundWallet(address);
  console.log(`Funding transaction submitted: ${config.cexplorerTxUrl}/${txHash}`);
  await waitFor(txHash);
  console.log('Wallet funded and ready to use.\n');
} else {
  console.log('Restored wallet:', address, '\n');
}

const FILE_URL = filePath ? new URL(filePath, import.meta.url) : new URL('./sample_thesis.zip', import.meta.url);
const fileName = String(meta.filename ?? FILE_URL.pathname.split('/').pop() ?? 'document');

let fileBytes: Uint8Array;
try {
  fileBytes = await Deno.readFile(FILE_URL);
} catch {
  const placeholder = new TextEncoder().encode('This is a placeholder for the certified file.');
  await Deno.writeFile(FILE_URL, placeholder);
  fileBytes = placeholder;
  console.log(`Created placeholder ${fileName} for demo purposes.\n`);
}

const fileHash = await sha256hex(fileBytes);
const fileSizeBytes = fileBytes.length;

console.log(`Certifying "${fileName}" (${fileSizeBytes.toLocaleString()} bytes) …`);
console.log(`SHA-256: ${fileHash}\n`);

const author   = String(meta.author   ?? '');
const title    = String(meta.title    ?? '');
const issuer   = String(meta.issuer   ?? '');
const location = String(meta.location ?? '');
const fileHint = String(meta.file_hint ?? '');
const description = String(meta.description ?? '');

async function run() {
  const txHash = await issueCertificates(address, [
    {
      hash: fileHash,
      algorithm: 'SHA-256',
      metadata: JSON.stringify({
        uverify_template_id: 'documentIntegrity',
        ...(title       ? { title }       : {}),
        ...(issuer      ? { issuer }      : {}),
        ...(location    ? { location }    : {}),
        ...(fileHint    ? { file_hint: fileHint }    : {}),
        ...(description ? { description } : {}),
        file_size: fileSizeBytes,
        file_type: fileName.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
        uv_url_filename: await sha256hex(fileName),
        ...(author ? { uv_url_author: await sha256hex(author) } : {}),
      }),
    },
  ]);

  console.log(`Transaction submitted: ${config.cexplorerTxUrl}/${txHash}`);
  await waitFor(txHash);
  console.log('Certificate confirmed on-chain.\n');

  const params = new URLSearchParams({ filename: fileName });
  if (author) params.set('author', author);
  console.log('Share this URL with the verifier:');
  console.log(`  ${config.verifyUrl}/${fileHash}?${params}`);
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
