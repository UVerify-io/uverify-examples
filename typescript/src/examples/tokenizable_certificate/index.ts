import { UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';
import { createWallet } from '../../utils/wallet.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolvePaymentKeyHash } from '@meshsdk/core';

const WALLET_FILE = 'wallet.txt';
const RECIPIENT_WALLET_FILE = 'recipient_wallet.txt';
const SEED_UTXO_FILE = 'tokenizable_certificate_seed_utxo.txt';
const CEXPLORER_TX_URL = 'https://preprod.cexplorer.io/tx';

const args = process.argv.slice(2);
const command = args[0];

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function printUsage(): void {
  console.error(
    'Usage:\n' +
    '  node index.js create --asset-name <name>\n' +
    '                       (--document-text <text> | --document-path <path>)\n' +
    '                       [--recipient-wallet <addr>]\n' +
    '                       [--init-utxo-tx-hash <hash> --init-utxo-output-index <idx>]\n' +
    '                       [--issuer-name <name>] [--description <text>]\n' +
    '                       [--asset-class <class>] [--ipfs-image <cid>]\n' +
    '\n' +
    '  node index.js redeem --asset-name <name> --key <hash>\n' +
    '                       [--recipient-wallet <addr>]\n' +
    '                       [--init-utxo-tx-hash <hash> --init-utxo-output-index <idx>]\n' +
    '\n' +
    'Notes:\n' +
    '  - The issuer wallet is loaded from / saved to wallet.txt.\n' +
    '  - A demo recipient wallet is loaded from / saved to recipient_wallet.txt.\n' +
    '  - The seed UTxO is auto-selected on first run and saved to\n' +
    '    tokenizable_certificate_seed_utxo.txt for subsequent runs.',
  );
}

if (command !== 'create' && command !== 'redeem') {
  printUsage();
  process.exit(1);
}

const assetName       = getArg('--asset-name');
const ownerAddress    = getArg('--recipient-wallet');
const documentText    = getArg('--document-text');
const documentPath    = getArg('--document-path');
const argTxHash       = getArg('--init-utxo-tx-hash');
const argOutputIndex  = getArg('--init-utxo-output-index');
const argKey          = getArg('--key');
const argIssuerName   = getArg('--issuer-name');
const argDescription  = getArg('--description');
const argIpfsImage    = getArg('--ipfs-image');
const argAssetClass   = getArg('--asset-class');

if (!assetName) {
  console.error('Error: --asset-name is required.');
  printUsage();
  process.exit(1);
}


if (command === 'create') {
  if (documentText && documentPath) {
    console.error('Error: --document-text and --document-path are mutually exclusive.');
    process.exit(1);
  }
  if (!documentText && !documentPath) {
    console.error('Error: one of --document-text or --document-path is required for create.');
    printUsage();
    process.exit(1);
  }
}

if (command === 'redeem' && !argKey) {
  console.error('Error: --key is required for redeem.');
  printUsage();
  process.exit(1);
}

const issuerIsNew = !existsSync(WALLET_FILE);
const issuerWallet = issuerIsNew
  ? await createWallet()
  : await createWallet(readFileSync(WALLET_FILE, 'utf-8').trim());

const { address: issuerAddress, signMessage, signTx } = issuerWallet;
const client = new UVerifyClient({ baseUrl: 'http://localhost:9090', signMessage, signTx });
const { waitFor, fundWallet } = client;

if (issuerIsNew) {
  writeFileSync(WALLET_FILE, issuerWallet.mnemonic, 'utf-8');
  console.log('Created new issuer wallet:', issuerAddress);
  console.log('Mnemonic saved to wallet.txt. Keep this file safe.\n');
  await waitFor(await fundWallet(issuerAddress));
} else {
  console.log('Restored issuer wallet:', issuerAddress, '\n');
}

const recipientIsNew = !existsSync(RECIPIENT_WALLET_FILE);
const recipientWallet = recipientIsNew
  ? await createWallet()
  : await createWallet(readFileSync(RECIPIENT_WALLET_FILE, 'utf-8').trim());

if (recipientIsNew) {
  writeFileSync(RECIPIENT_WALLET_FILE, recipientWallet.mnemonic, 'utf-8');
  console.log('Created new recipient wallet:', recipientWallet.address);
  console.log('Mnemonic saved to recipient_wallet.txt. Keep this file safe.');
  console.log('Fuelling recipient wallet …\n');
  await waitFor(await fundWallet(recipientWallet.address, recipientWallet.signMessage));
} else {
  console.log('Restored recipient wallet:', recipientWallet.address, '\n');
}

const effectiveRecipientAddress = ownerAddress ?? recipientWallet.address;
if (!ownerAddress) {
  console.log('No --recipient-wallet provided — using managed recipient wallet:', effectiveRecipientAddress);
}

const ownerPubKeyHash = resolvePaymentKeyHash(effectiveRecipientAddress);
console.log('Owner pub-key hash:', ownerPubKeyHash);

const assetNameHex = Buffer.from(assetName, 'utf8').toString('hex');

let initUtxoTxHash: string;
let initUtxoOutputIndex: number;

if (argTxHash && argOutputIndex !== undefined) {
  initUtxoTxHash = argTxHash;
  initUtxoOutputIndex = parseInt(argOutputIndex, 10);
  console.log(`Using provided seed UTxO: ${initUtxoTxHash}#${initUtxoOutputIndex}`);
} else if (existsSync(SEED_UTXO_FILE)) {
  const parts = readFileSync(SEED_UTXO_FILE, 'utf-8').trim().split(':');
  initUtxoTxHash = parts[0]!;
  initUtxoOutputIndex = parseInt(parts[1]!, 10);
  console.log(`Loaded seed UTxO from ${SEED_UTXO_FILE}: ${initUtxoTxHash}#${initUtxoOutputIndex}`);
} else {
  console.log('No seed UTxO provided or saved — auto-selecting from issuer wallet UTxOs …');
  const utxos = await issuerWallet.wallet.getUtxosMesh();
  if (utxos.length === 0) {
    console.error('Error: no UTxOs found in the issuer wallet. Fund the wallet first.');
    process.exit(1);
  }
  const seed = utxos[0]!;
  initUtxoTxHash = seed.input.txHash;
  initUtxoOutputIndex = seed.input.outputIndex;
  writeFileSync(SEED_UTXO_FILE, `${initUtxoTxHash}:${initUtxoOutputIndex}`, 'utf-8');
  console.log(`Seed UTxO auto-selected and saved to ${SEED_UTXO_FILE}: ${initUtxoTxHash}#${initUtxoOutputIndex}`);
}

if (command === 'create') {
  // Hash the document
  let key: string;
  if (documentPath) {
    const fileBytes = readFileSync(documentPath);
    key = createHash('sha256').update(fileBytes).digest('hex');
    console.log(`\nDocument hash (from file ${documentPath}): ${key}`);
  } else {
    key = createHash('sha256').update(documentText!, 'utf8').digest('hex');
    console.log(`\nDocument hash (from text): ${key}`);
  }

  console.log('Issuing tokenizable certificate …\n');

  try {
    const deployerPubKeyHash = resolvePaymentKeyHash(issuerAddress);

    const certMetadata: Record<string, string> = {
      asset_name: assetName!,
    };
    if (argIssuerName)  certMetadata.issuer_name  = argIssuerName;
    if (argDescription) certMetadata.description  = argDescription;
    if (argAssetClass)  certMetadata.asset_class   = argAssetClass;
    if (argIpfsImage)   certMetadata.ipfs_image    = argIpfsImage;

    const result = await client.apps.issueTokenizableCertificate(issuerAddress, {
      certificate: {
        hash: key,
        metadata: JSON.stringify(certMetadata),
      },
      ownerPubKeyHash,
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
    console.log(`\nTo redeem, run:\n  node index.js redeem --asset-name "${assetName}" --recipient-wallet "${effectiveRecipientAddress}" --key "${key}"`);

    const status = await client.apps.getTokenizableCertificateStatus(
      key, initUtxoTxHash, initUtxoOutputIndex,
    );
    console.log(`Claimed: ${status.claimed}`);
  } catch (error) {
    if (error instanceof WaitForTimeoutError) {
      console.error('Timed out waiting for confirmation. Re-run to check again.');
      process.exit(1);
    }
    throw error;
  }
}

if (command === 'redeem') {
  const key = argKey!;

  const recipientUtxos = await recipientWallet.wallet.getUtxosMesh();
  if (recipientUtxos.length === 0) {
    console.log('Recipient wallet has no UTxOs — funding it now …');
    await waitFor(await fundWallet(recipientWallet.address, recipientWallet.signMessage));
    console.log('Recipient wallet funded.\n');
  }

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

    const status = await client.apps.getTokenizableCertificateStatus(
      key, initUtxoTxHash, initUtxoOutputIndex,
    );
    console.log(`Claimed: ${status.claimed}`);
    if (status.owner) {
      console.log(`Owner: ${status.owner}`);
    }
  } catch (error) {
    if (error instanceof WaitForTimeoutError) {
      console.error('Timed out waiting for confirmation. Re-run to check again.');
      process.exit(1);
    }
    throw error;
  }
}
