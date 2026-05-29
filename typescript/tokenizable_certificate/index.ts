import { Address, Bytes, COSE, PrivateKey, TransactionWitnessSet } from '@evolution-sdk/evolution';
import { make as makeEvolutionClient } from '@evolution-sdk/evolution/sdk/client/Client';
import { addressFromSeed } from '@evolution-sdk/evolution/sdk/wallet/Derivation';
import { InsufficientFundsError, UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';
import { evaluatePlan, getArg, getNetworkConfig, loadEnv, type Plan } from '../helper.ts';

await loadEnv(new URL('../.env', import.meta.url));
const config = getNetworkConfig();

const WALLET_FILE           = new URL('./wallet.txt', import.meta.url);
const RECIPIENT_WALLET_FILE = new URL('./recipient_wallet.txt', import.meta.url);
const SEED_UTXO_FILE        = new URL('./seed_utxo.txt', import.meta.url);

// ── Wallet helpers ────────────────────────────────────────────────────────────

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

  // Enterprise address: header byte 0x60 + 28-byte payment key hash
  const paymentKeyHash = addressHex.slice(2, 58);

  return { address: addressBech32, mnemonic, signTx, signMessage, paymentKeyHash };
}

function createWallet() {
  const mnemonic = PrivateKey.generateMnemonic(256);
  return walletFromMnemonic(mnemonic);
}

async function sha256hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data.slice();
  const buffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── CLI args ─────────────────────────────────────────────────────────────────

const command = Deno.args[0];

function printUsage(): void {
  console.error(
    'Usage:\n' +
    '  deno run -A index.ts create --plan <plan.json>\n' +
    '                              [--number <N>]\n' +
    '                              [--recipient-wallet <addr>]\n' +
    '                              [--init-utxo-tx-hash <hash> --init-utxo-output-index <idx>]\n' +
    '                              [--asset-name <name>] [--document-text <text>]\n' +
    '                              [--document-path <path>] [--issuer-name <name>]\n' +
    '                              [--description <text>] [--asset-class <class>]\n' +
    '                              [--ipfs-image <cid>]\n' +
    '\n' +
    '  deno run -A index.ts redeem --asset-name <name> --key <hash>\n' +
    '                              [--recipient-wallet <addr>]\n' +
    '                              [--init-utxo-tx-hash <hash> --init-utxo-output-index <idx>]\n' +
    '\n' +
    'Notes:\n' +
    '  - --plan loads certificate fields (assetName, documentText, issuerName,\n' +
    '    description, assetClass, ipfsImage) from a plan JSON file.\n' +
    '    CLI flags override plan values when both are provided.\n' +
    '  - --number N issues N certificates in N transactions (create only).\n' +
    '  - Issuer wallet is loaded from / saved to wallet.txt.\n' +
    '  - Recipient wallet is loaded from / saved to recipient_wallet.txt.\n' +
    '  - Seed UTxO is loaded from / saved to seed_utxo.txt.\n' +
    `    Find a UTxO in your issuer wallet via the chain viewer at ${config.chainViewerUrl}.`,
  );
}

if (command !== 'create' && command !== 'redeem') {
  printUsage();
  Deno.exit(1);
}

const planPath       = getArg('plan');
const number         = Number(getArg('number') ?? '1');
const ownerAddress   = getArg('recipient-wallet');
const argTxHash      = getArg('init-utxo-tx-hash');
const argOutputIndex = getArg('init-utxo-output-index');
const argKey         = getArg('key');

// Load plan (optional for create, unused for redeem)
let planData: Record<string, string | number | boolean> = {};
if (planPath) {
  const plan: Plan = JSON.parse(await Deno.readTextFile(planPath));
  planData = evaluatePlan(plan);
}

// CLI flags override plan values
const assetName    = getArg('asset-name')    ?? (planData.assetName    ? String(planData.assetName)    : undefined);
const documentText = getArg('document-text') ?? (planData.documentText ? String(planData.documentText) : undefined);
const documentPath = getArg('document-path');
const argIssuerName  = getArg('issuer-name')  ?? (planData.issuerName  ? String(planData.issuerName)  : undefined);
const argDescription = getArg('description')  ?? (planData.description ? String(planData.description) : undefined);
const argAssetClass  = getArg('asset-class')  ?? (planData.assetClass  ? String(planData.assetClass)  : undefined);
const argIpfsImage   = getArg('ipfs-image')   ?? (planData.ipfsImage   ? String(planData.ipfsImage)   : undefined);

if (!assetName) {
  console.error('Error: --asset-name is required (or provide it via --plan with an "assetName" field).');
  printUsage();
  Deno.exit(1);
}

if (command === 'create') {
  if (documentText && documentPath) {
    console.error('Error: --document-text and --document-path are mutually exclusive.');
    Deno.exit(1);
  }
  if (!documentText && !documentPath && !planData.documentText) {
    console.error('Error: provide --document-text, --document-path, or a plan with a "documentText" field.');
    printUsage();
    Deno.exit(1);
  }
}

if (command === 'redeem' && !argKey) {
  console.error('Error: --key is required for redeem.');
  printUsage();
  Deno.exit(1);
}

// ── Wallet setup ──────────────────────────────────────────────────────────────

let issuerMnemonic: string | undefined;
try {
  issuerMnemonic = (await Deno.readTextFile(WALLET_FILE)).trim();
} catch { /* wallet.txt does not exist yet */ }

const issuerIsNew = issuerMnemonic === undefined;
const issuerWallet = issuerIsNew ? createWallet() : walletFromMnemonic(issuerMnemonic!);
const { address: issuerAddress, signTx, signMessage, mnemonic: issuerMnemonic2 } = issuerWallet;

const client = new UVerifyClient({ baseUrl: config.backendUrl, signMessage, signTx });
const { waitFor, fundWallet } = client;

if (issuerIsNew) {
  await Deno.writeTextFile(WALLET_FILE, issuerMnemonic2);
  console.log('Created new issuer wallet:', issuerAddress);
  console.log('Mnemonic saved to wallet.txt. Keep this file safe.\n');
  await waitFor(await fundWallet(issuerAddress));
} else {
  console.log('Restored issuer wallet:', issuerAddress, '\n');
}

let recipientMnemonic: string | undefined;
try {
  recipientMnemonic = (await Deno.readTextFile(RECIPIENT_WALLET_FILE)).trim();
} catch { /* recipient_wallet.txt does not exist yet */ }

const recipientIsNew = recipientMnemonic === undefined;
const recipientWallet = recipientIsNew ? createWallet() : walletFromMnemonic(recipientMnemonic!);

if (recipientIsNew) {
  await Deno.writeTextFile(RECIPIENT_WALLET_FILE, recipientWallet.mnemonic);
  console.log('Created new recipient wallet:', recipientWallet.address);
  console.log('Mnemonic saved to recipient_wallet.txt. Keep this file safe.');
  console.log('Funding recipient wallet …\n');
  await waitFor(await fundWallet(recipientWallet.address, recipientWallet.signMessage));
} else {
  console.log('Restored recipient wallet:', recipientWallet.address, '\n');
}

const effectiveRecipientAddress = ownerAddress ?? recipientWallet.address;
if (!ownerAddress) {
  console.log('No --recipient-wallet provided — using managed recipient wallet:', effectiveRecipientAddress);
}

const assetNameHex = Array.from(new TextEncoder().encode(assetName))
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');

// ── Init UTxO resolution ──────────────────────────────────────────────────────

let initUtxoTxHash: string;
let initUtxoOutputIndex: number;

if (argTxHash && argOutputIndex !== undefined) {
  initUtxoTxHash = argTxHash;
  initUtxoOutputIndex = parseInt(argOutputIndex, 10);
  console.log(`Using provided seed UTxO: ${initUtxoTxHash}#${initUtxoOutputIndex}`);
} else {
  let saved: string | undefined;
  try {
    saved = (await Deno.readTextFile(SEED_UTXO_FILE)).trim();
  } catch { /* seed_utxo.txt does not exist yet */ }

  if (saved) {
    const parts = saved.split(':');
    initUtxoTxHash = parts[0]!;
    initUtxoOutputIndex = parseInt(parts[1]!, 10);
    console.log(`Loaded seed UTxO from seed_utxo.txt: ${initUtxoTxHash}#${initUtxoOutputIndex}`);
  } else {
    console.error(
      'Error: no seed UTxO available.\n' +
      'Provide --init-utxo-tx-hash and --init-utxo-output-index on the first run.\n' +
      `Find a UTxO in your issuer wallet via the chain viewer at ${config.chainViewerUrl}.`,
    );
    Deno.exit(1);
  }
}

if (argTxHash && argOutputIndex !== undefined) {
  await Deno.writeTextFile(SEED_UTXO_FILE, `${initUtxoTxHash}:${initUtxoOutputIndex}`);
}

// ── Create command ────────────────────────────────────────────────────────────

if (command === 'create') {
  async function issueOne(planOverride?: Record<string, string | number | boolean>) {
    const data = planOverride ?? planData;

    let key: string;
    const docText  = getArg('document-text') ?? (data.documentText ? String(data.documentText) : undefined);
    const docPath  = getArg('document-path');

    if (docPath) {
      const fileBytes = await Deno.readFile(docPath);
      key = await sha256hex(fileBytes);
      console.log(`\nDocument hash (from file ${docPath}): ${key}`);
    } else {
      key = await sha256hex(docText!);
      console.log(`\nDocument hash: ${key}`);
    }

    const name        = getArg('asset-name')    ?? (data.assetName    ? String(data.assetName)    : assetName!);
    const issuerName  = getArg('issuer-name')   ?? (data.issuerName   ? String(data.issuerName)   : argIssuerName);
    const description = getArg('description')   ?? (data.description  ? String(data.description)  : argDescription);
    const assetClass  = getArg('asset-class')   ?? (data.assetClass   ? String(data.assetClass)   : argAssetClass);
    const ipfsImage   = getArg('ipfs-image')    ?? (data.ipfsImage    ? String(data.ipfsImage)    : argIpfsImage);

    const itemAssetNameHex = Array.from(new TextEncoder().encode(name))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    console.log('Issuing tokenizable certificate …\n');

    async function runCreate() {
      const result = await client.apps.issueTokenizableCertificate(issuerAddress, {
        key,
        ownerPubKeyHash: recipientWallet.paymentKeyHash,
        assetNameHex: itemAssetNameHex,
        initUtxoTxHash,
        initUtxoOutputIndex,
      });

      console.log(`Transaction submitted: ${config.cexplorerTxUrl}/${result.txHash}`);
      await waitFor(result.txHash);
      console.log('Certificate confirmed on-chain.');
      if (issuerName)  console.log(`  Issuer : ${issuerName}`);
      if (description) console.log(`  Desc   : ${description}`);
      if (assetClass)  console.log(`  Class  : ${assetClass}`);
      if (ipfsImage)   console.log(`  Image  : ${ipfsImage}`);
      console.log(`  Verify : ${result.verifyUrl}`);
      console.log(`\nTo redeem, run:\n  deno run -A index.ts redeem --asset-name "${name}" --key "${key}"`);

      const status = await client.apps.getTokenizableCertificateStatus(key, initUtxoTxHash, initUtxoOutputIndex);
      console.log(`Claimed: ${status.claimed}`);
    }

    try {
      await runCreate();
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        console.log('\nInsufficient funds. Funding issuer wallet and retrying …');
        await waitFor(await fundWallet(issuerAddress));
        await runCreate();
      } else if (error instanceof WaitForTimeoutError) {
        console.error('Timed out waiting for confirmation. Re-run to check again.');
        Deno.exit(1);
      } else {
        throw error;
      }
    }
  }

  if (planPath && number > 1) {
    const plan: Plan = JSON.parse(await Deno.readTextFile(planPath));
    for (let i = 0; i < number; i++) {
      await issueOne(evaluatePlan(plan));
    }
  } else {
    await issueOne();
  }
}

// ── Redeem command ────────────────────────────────────────────────────────────

if (command === 'redeem') {
  const key = argKey!;

  console.log(`\nRedeeming tokenizable certificate with key: ${key} …\n`);

  async function runRedeem() {
    const txHash = await client.apps.redeemTokenizableCertificate(
      {
        key,
        claimerAddress: recipientWallet.address,
        initUtxoTxHash,
        initUtxoOutputIndex,
        assetNameHex,
      },
      recipientWallet.signTx,
    );

    console.log(`Transaction submitted: ${config.cexplorerTxUrl}/${txHash}`);
    await client.waitFor(txHash);
    console.log('Certificate successfully redeemed on-chain.');

    const status = await client.apps.getTokenizableCertificateStatus(key, initUtxoTxHash, initUtxoOutputIndex);
    console.log(`Claimed: ${status.claimed}`);
    if (status.owner) console.log(`Owner: ${status.owner}`);
  }

  try {
    await runRedeem();
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      console.log('\nInsufficient funds. Funding recipient wallet and retrying …');
      await waitFor(await fundWallet(recipientWallet.address, recipientWallet.signMessage));
      await runRedeem();
    } else if (error instanceof WaitForTimeoutError) {
      console.error('Timed out waiting for confirmation. Re-run to check again.');
      Deno.exit(1);
    } else {
      throw error;
    }
  }
}
