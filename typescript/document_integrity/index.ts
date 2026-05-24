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
  const txHash = await fundWallet(address);
  console.log(`Funding transaction submitted: ${config.cexplorerTxUrl}/${txHash}`);
  await waitFor(txHash);
  console.log('Wallet funded and ready to use.\n');
} else {
  console.log('Restored wallet:', address, '\n');
}

const FILE_URL = new URL('./sample_thesis.zip', import.meta.url);
const FILE_PATH = FILE_URL.pathname;

let fileBytes: Uint8Array;
try {
  fileBytes = await Deno.readFile(FILE_URL);
} catch {
  const placeholder = new TextEncoder().encode('This is a placeholder for sample_thesis.zip.');
  await Deno.writeFile(FILE_URL, placeholder);
  fileBytes = placeholder;
  console.log('Created placeholder sample_thesis.zip for demo purposes.\n');
}

const fileName = FILE_PATH.split('/').pop() ?? 'sample_thesis.zip';
const fileHash = await sha256hex(fileBytes);
const fileSizeBytes = fileBytes.length;
const fileType = 'application/zip';
const fileHint = 'ZIP archive, not password protected';
const FILE_LOCATION = `https://fileshare.university.tld/thesis/${fileName}`;
const AUTHOR = 'Fabian Bormann';
const INSTITUTION = 'Technical University of Musterstadt';
const THESIS_TITLE = "Master's thesis: Impact of Blockchain Technology on Academic Record Keeping";

console.log(`Certifying "${fileName}" (${fileSizeBytes.toLocaleString()} bytes) …`);
console.log(`SHA-256: ${fileHash}\n`);

async function run() {
  const txHash = await issueCertificates(address, [
    {
      hash: fileHash,
      algorithm: 'SHA-256',
      metadata: JSON.stringify({
        uverify_template_id: 'documentIntegrity',
        title: THESIS_TITLE,
        issuer: INSTITUTION,
        uv_url_filename: await sha256hex(fileName),
        location: FILE_LOCATION,
        file_size: fileSizeBytes,
        file_type: fileType,
        file_hint: fileHint,
        description:
          `You received this link because you were sent a copy of "${fileName}". ` +
          `The file is available at: ${FILE_LOCATION}. ` +
          `To confirm no one has tampered with it, drop the file into the area below — ` +
          `the SHA-256 fingerprint will be compared against the blockchain record.`,
        uv_url_author: await sha256hex(AUTHOR),
      }),
    },
  ]);

  console.log(`Transaction submitted: ${config.cexplorerTxUrl}/${txHash}`);
  await waitFor(txHash);
  console.log('Certificate confirmed on-chain.\n');

  const verifyUrl = `${config.verifyUrl}/${fileHash}?filename=${encodeURIComponent(fileName)}&author=${encodeURIComponent(AUTHOR)}`;
  console.log('Share this URL with the verifier:');
  console.log(`  ${verifyUrl}`);
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
