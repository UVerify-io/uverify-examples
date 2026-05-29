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
    '  --number  Number of passports to issue (default: 1, each in its own transaction)\n' +
    '  --help    Show this help\n\n' +
    'Material fields use the mat_ prefix (e.g. mat_aluminum: "45%").\n' +
    'Certification fields use the cert_ prefix (e.g. cert_ce: "CE Marking").\n' +
    'Both prefixes are stripped when the nested objects are assembled.'
  );
  Deno.exit(planPath ? 0 : 1);
}

const plan: Plan = JSON.parse(await Deno.readTextFile(planPath));

function buildProduct(data: Record<string, string | number | boolean>) {
  const materials: Record<string, string> = Object.fromEntries(
    Object.entries(data)
      .filter(([k]) => k.startsWith('mat_'))
      .map(([k, v]) => [k.slice(4), String(v)])
  );
  const certifications: Record<string, string> = Object.fromEntries(
    Object.entries(data)
      .filter(([k]) => k.startsWith('cert_'))
      .map(([k, v]) => [k.slice(5), String(v)])
  );
  return {
    name:            String(data.name),
    manufacturer:    String(data.manufacturer),
    gtin:            String(data.gtin),
    serialNumber:    String(data.serialNumber),
    ...(data.model           ? { model: String(data.model) } : {}),
    ...(data.origin          ? { origin: String(data.origin) } : {}),
    ...(data.manufactured    ? { manufactured: String(data.manufactured) } : {}),
    ...(data.contact         ? { contact: String(data.contact) } : {}),
    ...(data.brandColor      ? { brandColor: String(data.brandColor) } : {}),
    ...(data.carbonFootprint ? { carbonFootprint: String(data.carbonFootprint) } : {}),
    ...(data.recycledContent ? { recycledContent: String(data.recycledContent) } : {}),
    ...(data.energyClass     ? { energyClass: String(data.energyClass) } : {}),
    ...(data.warranty        ? { warranty: String(data.warranty) } : {}),
    ...(data.spareParts      ? { spareParts: String(data.spareParts) } : {}),
    ...(data.repairInfo      ? { repairInfo: String(data.repairInfo) } : {}),
    ...(data.recycling       ? { recycling: String(data.recycling) } : {}),
    ...(Object.keys(materials).length      ? { materials } : {}),
    ...(Object.keys(certifications).length ? { certifications } : {}),
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

console.log(`Issuing ${number} Digital Product Passport(s) …\n`);

async function issueOne(data: Record<string, string | number | boolean>) {
  const product = buildProduct(data);

  async function run() {
    const { txHash, verifyUrl } = await client.apps.issueDigitalProductPassport(address, product);
    console.log(`Transaction submitted: ${config.cexplorerTxUrl}/${txHash}`);
    await waitFor(txHash);
    console.log('Digital Product Passport confirmed on-chain.');
    console.log(`  Product : ${product.name}`);
    console.log(`  Serial  : ${product.serialNumber}`);
    console.log(`  Verify  : ${verifyUrl}\n`);
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
}

for (let i = 0; i < number; i++) {
  await issueOne(evaluatePlan(plan));
}

console.log('Done. All Digital Product Passports are permanently anchored on Cardano.');
