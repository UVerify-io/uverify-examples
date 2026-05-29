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
    '  --number  Number of reports to generate and issue in one transaction (default: 1)\n' +
    '  --help    Show this help\n\n' +
    'Measured value fields use the a_ prefix (e.g. a_glucose: "5.4 mmol/L").\n' +
    'The prefix is stripped when the values object is assembled.'
  );
  Deno.exit(planPath ? 0 : 1);
}

const plan: Plan = JSON.parse(await Deno.readTextFile(planPath));

function buildReport(data: Record<string, string | number | boolean>) {
  const values: Record<string, string> = Object.fromEntries(
    Object.entries(data)
      .filter(([k]) => k.startsWith('a_'))
      .map(([k, v]) => [k.slice(2), String(v)])
  );
  return {
    patientName: String(data.patientName),
    reportId:    String(data.reportId),
    labName:     String(data.labName),
    ...(data.contact   !== undefined ? { contact: String(data.contact) } : {}),
    ...(data.auditable !== undefined ? { auditable: Boolean(data.auditable) } : {}),
    values,
  };
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
const { waitFor, fundWallet } = client;

if (isNew) {
  await Deno.writeTextFile(WALLET_FILE, mnemonic);
  console.log('Created new wallet:', address);
  console.log('Mnemonic saved to wallet.txt. Keep this file safe.\n');
  await waitFor(await fundWallet(address));
} else {
  console.log('Restored wallet:', address, '\n');
}

const reports = Array.from({ length: number }, () => buildReport(evaluatePlan(plan)));

console.log(`Issuing ${reports.length} lab report(s) in a single transaction …`);
for (const r of reports) {
  console.log(`  • ${r.reportId} — ${r.patientName}`);
}

async function run() {
  const result = await client.apps.issueLaboratoryReport(address, reports);
  console.log(`\nTransaction submitted: ${config.cexplorerTxUrl}/${result.txHash}`);
  await waitFor(result.txHash);
  console.log('All reports confirmed on-chain.\n');

  console.log('Verification deep links (share with each patient):');
  for (const cert of result.certificates) {
    console.log(`  ${cert.patientName} / ${cert.reportId}`);
    console.log(`    ${cert.verifyUrl}\n`);
  }
  console.log('Done. All lab reports are permanently anchored on Cardano.');
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
