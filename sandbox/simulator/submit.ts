/**
 * submit.ts — Generic UVerify sandbox transaction submitter.
 *
 * Usage (submit all pre-generated metadata files):
 *   deno run -A submit.ts \
 *     --template productVerification \
 *     --input ./output \
 *     --batch-size 5
 *
 * Usage (synthetic load test — N certificates with minimal metadata):
 *   deno run -A submit.ts \
 *     --template productVerification \
 *     --number 100 \
 *     --batch-size 10
 *
 * --input and --number are mutually exclusive.
 * --batch-size controls how many certificates are packed into one transaction.
 *
 * Outputs:
 *   wallet.txt   — persisted mnemonic (created on first run)
 *   results.json — tx hashes, cert hashes, fees, and summary totals
 *
 * Re-entrant: already-submitted hashes are skipped on restart.
 */

import { Address, Bytes, COSE, PrivateKey, TransactionWitnessSet } from '@evolution-sdk/evolution';
import { make as makeEvolutionClient } from '@evolution-sdk/evolution/sdk/client/Client';
import { preprod } from '@evolution-sdk/evolution/sdk/client/Chain';
import { addressFromSeed } from '@evolution-sdk/evolution/sdk/wallet/Derivation';
import { UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';

// ── Config ───────────────────────────────────────────────────────────────────

const BACKEND_URL    = 'http://localhost:9090';
const VERIFY_BASE_URL = 'http://localhost:3000/verify';
const WALLET_FILE    = new URL('./wallet.txt',   import.meta.url);
const RESULTS_FILE   = new URL('./results.json', import.meta.url);

// ── CLI arg parsing ──────────────────────────────────────────────────────────

function getArg(flag: string): string | undefined {
  const idx = Deno.args.indexOf(`--${flag}`);
  return idx !== -1 ? Deno.args[idx + 1] : undefined;
}

function getNumArg(flag: string): number | undefined {
  const v = getArg(flag);
  return v !== undefined ? Number(v) : undefined;
}

const templateName = getArg('template');
const inputDir     = getArg('input');
const numberArg    = getNumArg('number');
const batchSize    = getNumArg('batch-size') ?? 1;

if (!templateName) {
  console.error('Error: --template <name> is required.');
  Deno.exit(1);
}
if (inputDir !== undefined && numberArg !== undefined) {
  console.error('Error: --input and --number are mutually exclusive.');
  Deno.exit(1);
}
if (inputDir === undefined && numberArg === undefined) {
  console.error('Error: provide either --input <path> or --number <N>.');
  Deno.exit(1);
}

// ── Wallet ───────────────────────────────────────────────────────────────────

function walletFromMnemonic(mnemonic: string) {
  const evolutionClient = makeEvolutionClient(preprod).withSeed({ mnemonic, addressType: 'Enterprise' });
  const { address: addressObj } = addressFromSeed(mnemonic, { addressType: 'Enterprise', networkId: 0 });
  const addressHex   = Address.toHex(addressObj);
  const addressBech32 = Address.toBech32(addressObj);
  const paymentKey   = PrivateKey.fromMnemonicCardano(mnemonic);

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

let savedMnemonic: string | undefined;
try { savedMnemonic = (await Deno.readTextFile(WALLET_FILE)).trim(); } catch { /* new */ }

const isNew = savedMnemonic === undefined;
const generatedMnemonic = isNew ? PrivateKey.generateMnemonic(256) : savedMnemonic!;
const wallet = walletFromMnemonic(generatedMnemonic);
const { address, signTx, signMessage } = wallet;

if (isNew) {
  await Deno.writeTextFile(WALLET_FILE, generatedMnemonic);
  console.log('Created new wallet:', address);
  console.log('Mnemonic saved to wallet.txt — keep this file safe.\n');
} else {
  console.log('Wallet:', address, '\n');
}

// ── Build cert item list ─────────────────────────────────────────────────────

interface CertItem { hash: string; metadata: string; }

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const items: CertItem[] = [];

if (inputDir !== undefined) {
  for await (const entry of Deno.readDir(inputDir)) {
    if (!entry.isFile || !entry.name.endsWith('.json')) continue;
    const hash     = entry.name.slice(0, -5);
    const raw      = JSON.parse(await Deno.readTextFile(`${inputDir}/${entry.name}`));
    const metadata = JSON.stringify({ ...raw, uverify_template_id: templateName });
    items.push({ hash, metadata });
  }
  items.sort((a, b) => a.hash.localeCompare(b.hash));
  console.log(`Loaded ${items.length} metadata file(s) from ${inputDir}/`);
} else {
  for (let i = 0; i < numberArg!; i++) {
    const hash     = await sha256hex(`${templateName}-${Date.now()}-${i}-${Math.random()}`);
    const metadata = JSON.stringify({ uverify_template_id: templateName, index: i });
    items.push({ hash, metadata });
  }
  console.log(`Generated ${items.length} synthetic certificate(s).`);
}

// ── Results + re-entrancy ────────────────────────────────────────────────────

interface TxResult {
  txHash:      string;
  certHashes:  string[];
  feeLovelace: number | null;
  feeAda:      number | null;
}

interface Results {
  summary: {
    totalTransactions:  number;
    totalCertificates:  number;
    totalFeeLovelace:   number | null;
    totalFeeAda:        number | null;
  };
  transactions: TxResult[];
}

const emptyResults = (): Results => ({
  summary: { totalTransactions: 0, totalCertificates: 0, totalFeeLovelace: null, totalFeeAda: null },
  transactions: [],
});

let results: Results;
try {
  const existing = JSON.parse(await Deno.readTextFile(RESULTS_FILE)) as Results;
  const { totalTransactions, totalCertificates } = existing.summary;
  const resume = confirm(
    `Previous run found (${totalTransactions} tx, ${totalCertificates} certificates). Continue where it left off?`
  );
  if (resume) {
    results = existing;
    console.log(`Resuming: ${results.transactions.length} transaction(s) already submitted.\n`);
  } else {
    await Deno.remove(RESULTS_FILE);
    results = emptyResults();
    console.log('Starting over.\n');
  }
} catch {
  results = emptyResults();
}

const submittedHashes = new Set(results.transactions.flatMap((t) => t.certHashes));
const pending = items.filter((item) => !submittedHashes.has(item.hash));

if (pending.length === 0) {
  console.log('Nothing to submit — all certificates already recorded in results.json.');
  Deno.exit(0);
}

console.log(`${pending.length} certificate(s) pending in ${Math.ceil(pending.length / batchSize)} transaction(s) (batch-size=${batchSize}).\n`);

// ── Fee extraction from unsigned tx CBOR ────────────────────────────────────
// Minimal CBOR reader: walks the prefix bytes to find txBody[2] (the fee uint).

function extractFeeLovelace(cbor: string): number | null {
  try {
    const bytes = Uint8Array.from({ length: cbor.length / 2 }, (_, i) =>
      parseInt(cbor.slice(i * 2, i * 2 + 2), 16)
    );
    let pos = 0;

    const readLen = (info: number): number => {
      if (info < 24)  return info;
      if (info === 24) return bytes[pos++];
      if (info === 25) { const v = (bytes[pos] << 8) | bytes[pos + 1]; pos += 2; return v; }
      if (info === 26) { const v = (bytes[pos] << 24) | (bytes[pos+1] << 16) | (bytes[pos+2] << 8) | bytes[pos+3]; pos += 4; return v; }
      return 0;
    };

    const readValue = (): unknown => {
      const byte  = bytes[pos++];
      const major = byte >> 5;
      const info  = byte & 0x1f;
      const len   = readLen(info);
      if (major === 0) return len;                     // uint
      if (major === 1) return -(len + 1);              // nint
      if (major === 2 || major === 3) { pos += len; return null; }
      if (major === 4) {
        return Array.from({ length: len }, () => readValue());
      }
      if (major === 5) {
        const map: Record<number, unknown> = {};
        for (let i = 0; i < len; i++) {
          const k = readValue() as number;
          map[k] = readValue();
        }
        return map;
      }
      return null;
    };

    const tx   = readValue() as unknown[];       // [body, witnesses, isValid, metadata]
    const body = tx[0] as Record<number, unknown>;
    const fee  = body[2];
    return typeof fee === 'number' ? fee : null;
  } catch {
    return null;
  }
}

// ── Persist results helper ───────────────────────────────────────────────────

async function saveResults(): Promise<void> {
  const knownFees = results.transactions.map((t) => t.feeLovelace).filter((f): f is number => f !== null);
  const allKnown  = knownFees.length === results.transactions.length && results.transactions.length > 0;
  const totalFeeLovelace = allKnown ? knownFees.reduce((s, f) => s + f, 0) : null;

  results.summary = {
    totalTransactions: results.transactions.length,
    totalCertificates: results.transactions.reduce((n, t) => n + t.certHashes.length, 0),
    totalFeeLovelace,
    totalFeeAda: totalFeeLovelace !== null ? totalFeeLovelace / 1_000_000 : null,
  };
  await Deno.writeTextFile(RESULTS_FILE, JSON.stringify(results, null, 2));
}

// ── Submit ───────────────────────────────────────────────────────────────────

const client = new UVerifyClient({
  baseUrl:      BACKEND_URL,
  verifyBaseUrl: VERIFY_BASE_URL,
  signMessage,
  signTx,
});

if (isNew) {
  console.log('Funding wallet via UVerify backend faucet …');
  const faucetTx = await client.fundWallet(address);
  console.log('Waiting for faucet confirmation …');
  await client.waitFor(faucetTx);
  console.log('Funded.\n');
}

const totalBatches = Math.ceil(pending.length / batchSize);

for (let i = 0; i < pending.length; i += batchSize) {
  const batch     = pending.slice(i, Math.min(i + batchSize, pending.length));
  const batchNum  = Math.floor(i / batchSize) + 1;

  console.log(`[${batchNum}/${totalBatches}] Submitting ${batch.length} certificate(s) …`);
  batch.forEach((b) => console.log(`  ${b.hash}`));

  try {
    const { unsignedTransaction } = await client.core.buildTransaction({
      type: 'default',
      address,
      certificates: batch.map((item) => ({
        hash:      item.hash,
        algorithm: 'SHA-256',
        metadata:  item.metadata,
      })),
    });

    const feeLovelace = extractFeeLovelace(unsignedTransaction);
    const witnessSet  = await signTx(unsignedTransaction);
    const txHash      = await client.core.submitTransaction(unsignedTransaction, witnessSet);

    results.transactions.push({
      txHash,
      certHashes:  batch.map((b) => b.hash),
      feeLovelace,
      feeAda: feeLovelace !== null ? feeLovelace / 1_000_000 : null,
    });
    await saveResults();

    const feeStr = feeLovelace !== null ? `${(feeLovelace / 1_000_000).toFixed(6)} ADA` : 'unknown';
    console.log(`  tx:  ${txHash}`);
    console.log(`  fee: ${feeStr}`);
    console.log('  Waiting for confirmation …');
    await client.waitFor(txHash);
    console.log('  Confirmed ✓\n');
  } catch (err) {
    if (err instanceof WaitForTimeoutError) {
      console.error('  Timed out waiting for confirmation. Re-run to resume.');
      await saveResults();
      Deno.exit(1);
    }
    console.error('  Batch failed:', err);
    await saveResults();
    throw err;
  }
}

await saveResults();

const s = results.summary;
console.log('─'.repeat(50));
console.log(`Transactions : ${s.totalTransactions}`);
console.log(`Certificates : ${s.totalCertificates}`);
console.log(`Total fees   : ${s.totalFeeAda !== null ? s.totalFeeAda.toFixed(6) + ' ADA' : 'see results.json'}`);
console.log(`Results      : results.json`);
