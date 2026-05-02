import { Address, Bytes, COSE, PrivateKey, TransactionWitnessSet } from '@evolution-sdk/evolution';
import { make as makeEvolutionClient } from '@evolution-sdk/evolution/sdk/client/Client';
import { preprod } from '@evolution-sdk/evolution/sdk/client/Chain';
import { addressFromSeed } from '@evolution-sdk/evolution/sdk/wallet/Derivation';
import { UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';

const WALLET_FILE = new URL('./wallet.txt', import.meta.url);
const RECIPIENT_WALLET_FILE = new URL('./recipient_wallet.txt', import.meta.url);
const SEED_UTXO_FILE = new URL('./seed_utxo.txt', import.meta.url);
const CEXPLORER_TX_URL = 'https://preprod.cexplorer.io/tx';
const BACKEND_URL = 'http://localhost:9090';

function walletFromMnemonic(mnemonic: string) {
  const evolutionClient = makeEvolutionClient(preprod).withSeed({ mnemonic, addressType: 'Enterprise' });
  const { address: addressObj } = addressFromSeed(mnemonic, { addressType: 'Enterprise', networkId: 0 });
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

  // For enterprise testnet addresses: header byte 0x60 + 28-byte payment key hash
  const paymentKeyHash = addressHex.slice(2, 58);

  return { address: addressBech32, mnemonic, signTx, signMessage, paymentKeyHash };
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

const args = Deno.args;
const command = args[0];

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function printUsage(): void {
  console.error(
    'Usage:\n' +
    '  deno run -A index.ts create --asset-name <name>\n' +
    '                              (--document-text <text> | --document-path <path>)\n' +
    '                              [--recipient-wallet <addr>]\n' +
    '                              [--init-utxo-tx-hash <hash> --init-utxo-output-index <idx>]\n' +
    '                              [--issuer-name <name>] [--description <text>]\n' +
    '                              [--asset-class <class>] [--ipfs-image <cid>]\n' +
    '\n' +
    '  deno run -A index.ts redeem --asset-name <name> --key <hash>\n' +
    '                              [--recipient-wallet <addr>]\n' +
    '                              [--init-utxo-tx-hash <hash> --init-utxo-output-index <idx>]\n' +
    '\n' +
    'Notes:\n' +
    '  - Issuer wallet is loaded from / saved to wallet.txt.\n' +
    '  - Recipient wallet is loaded from / saved to recipient_wallet.txt.\n' +
    '  - Seed UTxO is loaded from / saved to seed_utxo.txt.\n' +
    '    Provide --init-utxo-tx-hash and --init-utxo-output-index on first run\n' +
    '    (use the Yaci chain viewer at http://localhost:3001 to find a UTxO).',
  );
}

if (command !== 'create' && command !== 'redeem') {
  printUsage();
  Deno.exit(1);
}

const assetName = getArg('--asset-name');
const ownerAddress = getArg('--recipient-wallet');
const documentText = getArg('--document-text');
const documentPath = getArg('--document-path');
const argTxHash = getArg('--init-utxo-tx-hash');
const argOutputIndex = getArg('--init-utxo-output-index');
const argKey = getArg('--key');
const argIssuerName = getArg('--issuer-name');
const argDescription = getArg('--description');
const argIpfsImage = getArg('--ipfs-image');
const argAssetClass = getArg('--asset-class');

if (!assetName) {
  console.error('Error: --asset-name is required.');
  printUsage();
  Deno.exit(1);
}

if (command === 'create') {
  if (documentText && documentPath) {
    console.error('Error: --document-text and --document-path are mutually exclusive.');
    Deno.exit(1);
  }
  if (!documentText && !documentPath) {
    console.error('Error: one of --document-text or --document-path is required for create.');
    printUsage();
    Deno.exit(1);
  }
}

if (command === 'redeem' && !argKey) {
  console.error('Error: --key is required for redeem.');
  printUsage();
  Deno.exit(1);
}

let issuerMnemonic: string | undefined;
try {
  issuerMnemonic = (await Deno.readTextFile(WALLET_FILE)).trim();
} catch { /* wallet.txt does not exist yet */ }

const issuerIsNew = issuerMnemonic === undefined;
const issuerWallet = issuerIsNew ? createWallet() : walletFromMnemonic(issuerMnemonic!);
const { address: issuerAddress, signTx, signMessage, mnemonic: issuerMnemonic2 } = issuerWallet;

const client = new UVerifyClient({ baseUrl: BACKEND_URL, signMessage, signTx });
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
      'Find a UTxO in your issuer wallet via the Yaci chain viewer at http://localhost:3001.',
    );
    Deno.exit(1);
  }
}

if (argTxHash && argOutputIndex !== undefined) {
  await Deno.writeTextFile(SEED_UTXO_FILE, `${initUtxoTxHash}:${initUtxoOutputIndex}`);
}

if (command === 'create') {
  let key: string;
  if (documentPath) {
    const fileBytes = await Deno.readFile(documentPath);
    key = await sha256hex(fileBytes);
    console.log(`\nDocument hash (from file ${documentPath}): ${key}`);
  } else {
    key = await sha256hex(documentText!);
    console.log(`\nDocument hash (from text): ${key}`);
  }

  console.log('Issuing tokenizable certificate …\n');

  try {
    const deployerPubKeyHash = issuerWallet.paymentKeyHash;

    const certMetadata: Record<string, string> = { asset_name: assetName! };
    if (argIssuerName) certMetadata.issuer_name = argIssuerName;
    if (argDescription) certMetadata.description = argDescription;
    if (argAssetClass) certMetadata.asset_class = argAssetClass;
    if (argIpfsImage) certMetadata.ipfs_image = argIpfsImage;

    const result = await client.apps.issueTokenizableCertificate(issuerAddress, {
      certificate: {
        hash: key,
        metadata: JSON.stringify(certMetadata),
      },
      ownerAddress: effectiveRecipientAddress,
      assetNameHex,
      initUtxoTxHash,
      initUtxoOutputIndex,
      config: {
        deployer: deployerPubKeyHash,
        allowedInserters: [deployerPubKeyHash],
      },
    });

    console.log(`Transaction submitted: ${CEXPLORER_TX_URL}/${result.txHash}`);
    await waitFor(result.txHash);
    console.log('Certificate confirmed on-chain.');
    console.log(`Verify at: ${result.verifyUrl}`);
    console.log(`\nTo redeem, run:\n  deno run -A index.ts redeem --asset-name "${assetName}" --recipient-wallet "${effectiveRecipientAddress}" --key "${key}"`);

    const status = await client.apps.getTokenizableCertificateStatus(key, initUtxoTxHash, initUtxoOutputIndex);
    console.log(`Claimed: ${status.claimed}`);
  } catch (error) {
    if (error instanceof WaitForTimeoutError) {
      console.error('Timed out waiting for confirmation. Re-run to check again.');
      Deno.exit(1);
    }
    throw error;
  }
}

if (command === 'redeem') {
  const key = argKey!;

  console.log(`\nRedeeming tokenizable certificate with key: ${key} …\n`);

  try {
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

    console.log(`Transaction submitted: ${CEXPLORER_TX_URL}/${txHash}`);
    await client.waitFor(txHash);
    console.log('Certificate successfully redeemed on-chain.');

    const status = await client.apps.getTokenizableCertificateStatus(key, initUtxoTxHash, initUtxoOutputIndex);
    console.log(`Claimed: ${status.claimed}`);
    if (status.owner) console.log(`Owner: ${status.owner}`);
  } catch (error) {
    if (error instanceof WaitForTimeoutError) {
      console.error('Timed out waiting for confirmation. Re-run to check again.');
      Deno.exit(1);
    }
    throw error;
  }
}
