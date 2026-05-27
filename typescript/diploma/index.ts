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

// ── Plan evaluation (same field-def format as sandbox/simulator/generate.ts) ─

type FieldDef =
  | { type: 'static';        value: string | number | boolean }
  | { type: 'random-bool' }
  | { type: 'random-number'; range: { min: number; max: number } }
  | { type: 'random-string'; regex: string }
  | { type: 'one-of';        values: (string | number | boolean)[] };

type Plan = Record<string, FieldDef>;

function parseCharClass(src: string): string[] {
  const chars: string[] = [];
  let i = 0;
  while (i < src.length) {
    if (i + 2 < src.length && src[i + 1] === '-') {
      const lo = src.charCodeAt(i), hi = src.charCodeAt(i + 2);
      for (let c = lo; c <= hi; c++) chars.push(String.fromCharCode(c));
      i += 3;
    } else {
      chars.push(src[i++]);
    }
  }
  return chars;
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('');

function generateFromPattern(pattern: string): string {
  let out = '', i = 0;
  while (i < pattern.length) {
    let pool: string[];
    if (pattern[i] === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end === -1) throw new Error(`Unclosed [ in pattern: ${pattern}`);
      pool = parseCharClass(pattern.slice(i + 1, end));
      i = end + 1;
    } else if (pattern[i] === '.') {
      pool = ALNUM; i++;
    } else {
      pool = [pattern[i++]];
    }
    let count = 1;
    if (i < pattern.length && pattern[i] === '{') {
      const end = pattern.indexOf('}', i + 1);
      if (end === -1) throw new Error(`Unclosed { in pattern: ${pattern}`);
      const spec = pattern.slice(i + 1, end);
      if (spec.includes(',')) {
        const [lo, hi] = spec.split(',').map((s) => parseInt(s.trim(), 10));
        count = lo + Math.floor(Math.random() * (hi - lo + 1));
      } else {
        count = parseInt(spec.trim(), 10);
      }
      i = end + 1;
    } else if (i < pattern.length && pattern[i] === '+') {
      count = 1 + Math.floor(Math.random() * 9); i++;
    } else if (i < pattern.length && pattern[i] === '*') {
      count = Math.floor(Math.random() * 10); i++;
    }
    for (let k = 0; k < count; k++) out += pick(pool);
  }
  return out;
}

function evaluateField(def: FieldDef): string | number | boolean {
  switch (def.type) {
    case 'static':        return def.value;
    case 'random-bool':   return Math.random() < 0.5;
    case 'random-number': return def.range.min + Math.floor(Math.random() * (def.range.max - def.range.min + 1));
    case 'random-string': return generateFromPattern(def.regex);
    case 'one-of':        return pick(def.values);
    default: throw new Error(`Unknown field type: ${(def as FieldDef & { type: string }).type}`);
  }
}

function evaluatePlan(plan: Plan): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, evaluateField(v)]));
}

// ── CLI args ─────────────────────────────────────────────────────────────────

function getArg(flag: string): string | undefined {
  const idx = Deno.args.indexOf(`--${flag}`);
  return idx !== -1 ? Deno.args[idx + 1] : undefined;
}

const planPath = getArg('plan');
const number   = Number(getArg('number') ?? '1');

if (!planPath || Deno.args.includes('--help')) {
  console.log(
    'Usage: deno run -A index.ts --plan <plan.json> [--number <N>]\n\n' +
    'Options:\n' +
    '  --plan    Path to a plan JSON file (same format as sandbox/simulator)\n' +
    '  --number  Number of graduates to generate (default: 1)\n' +
    '  --help    Show this help'
  );
  Deno.exit(planPath ? 0 : 1);
}

const plan: Plan = JSON.parse(await Deno.readTextFile(planPath));
type Graduate = { name: string; studentId: string; degree: string; graduationDate: string; honors?: string; institution: string };
const graduates = Array.from({ length: number }, () => evaluatePlan(plan)) as Graduate[];

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

console.log(`Using network: ${network}`);
console.log(`backend URL: ${config.backendUrl}`);

const client = new UVerifyClient({ baseUrl: config.backendUrl, signMessage, signTx });
const { waitFor, fundWallet } = client;

if (isNew) {
  await Deno.writeTextFile(WALLET_FILE, mnemonic);
  console.log('Created new wallet:', address);
  console.log('Mnemonic saved to wallet.txt. Keep this file safe.\n');
  await waitFor(await fundWallet(address));
} else {
  console.log('Restored wallet:', address, '\n');
}

console.log(`Issuing ${graduates.length} diploma …`);

async function run() {
  const result = await client.apps.issueDiploma(
    address,
    graduates,
  );
  console.log(`Transaction submitted: ${config.cexplorerTxUrl}/${result.txHash}`);
  await waitFor(result.txHash);
  console.log('Diploma confirmed on-chain.\n');

  console.log('Verification link (the ?name= parameter reveals the recipient on the certificate page):');
  for (const cert of result.certificates) {
    console.log(`  ${cert.name}: ${cert.verifyUrl}`);
  }
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
