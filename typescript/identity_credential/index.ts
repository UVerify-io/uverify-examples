/**
 * Identity Credential Example
 *
 * Demonstrates the full KERI-backed identity credential lifecycle:
 *
 *  Step 1 — Register: issue an AUTH credential cert from your wallet.
 *  Step 2 — Inspect:  poll the backend API to confirm the cert was indexed.
 *  Step 3 — Revoke:   issue a REVOKE cert to invalidate the credential.
 *
 * Without a live KERIA agent the credential is stored with keri_verified: false.
 * That is the expected sandbox behaviour — the badge still appears but carries a
 * warning. Set KERIA_AGENT_URL in the backend environment to enable full verification.
 */

import { Address, Bytes, COSE, PrivateKey, TransactionWitnessSet } from '@evolution-sdk/evolution';
import { make as makeEvolutionClient } from '@evolution-sdk/evolution/sdk/client/Client';
import { mainnet, preprod } from '@evolution-sdk/evolution/sdk/client/Chain';
import { addressFromSeed } from '@evolution-sdk/evolution/sdk/wallet/Derivation';
import { InsufficientFundsError, UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';

// ---------------------------------------------------------------------------
// Load optional .env file (one directory up, shared across examples)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Network config
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// KERI credential fields (replace with real values when using a live KERIA agent)
// ---------------------------------------------------------------------------
// These are placeholder values. Without a live KERIA agent the backend will
// store the credential with keri_verified: false, which is fine for sandbox testing.
const KERI_AID    = Deno.env.get('KERI_AID')    ?? 'EKtQ1lymrnrh3qv5S18PBzQ7ukHGFJ7EXkH7B22XEMIL';
const KERI_SCHEMA = Deno.env.get('KERI_SCHEMA') ?? 'EJVgEQO8BEhGGM7GcAjlqoKG1upeuBZj9WjvjZo353sQ';
const KERI_OOBI   = Deno.env.get('KERI_OOBI')   ?? '';
const KERI_PROOF  = Deno.env.get('KERI_PROOF')  ?? '';

// ---------------------------------------------------------------------------
// Wallet helpers
// ---------------------------------------------------------------------------
const WALLET_FILE = new URL('./wallet.txt', import.meta.url);

function walletFromMnemonic(mnemonic: string) {
  const evolutionClient = makeEvolutionClient(config.evolutionChain).withSeed({ mnemonic, addressType: 'Enterprise' });
  const { address: addressObj } = addressFromSeed(mnemonic, { addressType: 'Enterprise', networkId: config.networkId });
  const addressHex = Address.toHex(addressObj);
  const addressBech32 = Address.toBech32(addressObj);
  const paymentKey = PrivateKey.fromMnemonicCardano(mnemonic);
  // Payment credential = address hex minus the 1-byte header prefix
  const paymentCredential = addressHex.slice(2);

  const signTx = async (unsignedTx: string): Promise<string> => {
    const witnessSet = await evolutionClient.signTx(unsignedTx);
    return TransactionWitnessSet.toCBORHex(witnessSet);
  };

  const signMessage = (message: string): Promise<{ key: string; signature: string }> => {
    const payload = new TextEncoder().encode(message);
    const { signature, key } = COSE.SignData.signData(addressHex, payload, paymentKey);
    return Promise.resolve({ key: Bytes.toHex(key), signature: Bytes.toHex(signature) });
  };

  return { address: addressBech32, paymentCredential, mnemonic, signTx, signMessage };
}

function createWallet() {
  const mnemonic = PrivateKey.generateMnemonic(256);
  return walletFromMnemonic(mnemonic);
}

async function sha256hex(data: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Bootstrap wallet
// ---------------------------------------------------------------------------
let storedMnemonic: string | undefined;
try {
  storedMnemonic = (await Deno.readTextFile(WALLET_FILE)).trim();
} catch {
  // wallet.txt does not exist yet
}

const isNew = storedMnemonic === undefined;
const wallet = isNew ? createWallet() : walletFromMnemonic(storedMnemonic!);
const { address, paymentCredential, signTx, signMessage, mnemonic } = wallet;

const client = new UVerifyClient({ baseUrl: config.backendUrl, signMessage, signTx });
const { waitFor, fundWallet, issueCertificates } = client;

if (isNew) {
  await Deno.writeTextFile(WALLET_FILE, mnemonic);
  console.log('Created new wallet:', address);
  console.log('Payment credential:', paymentCredential);
  console.log('Mnemonic saved to wallet.txt\n');
  await waitFor(await fundWallet(address));
} else {
  console.log('Restored wallet:', address);
  console.log('Payment credential:', paymentCredential, '\n');
}

// ---------------------------------------------------------------------------
// Step 1 — Register identity credential (AUTH cert)
// ---------------------------------------------------------------------------
console.log('━━━ Step 1: Register identity credential ━━━');

const authHash = await sha256hex(paymentCredential + KERI_AID + Date.now().toString());

const authMetadata = {
  uverify_template_id: 'IdentityAuth',
  uverify_update_policy: 'first',
  t: 'AUTH',
  ct: 'identity',
  i: KERI_AID,
  s: KERI_SCHEMA,
  ...(KERI_OOBI  ? { o: KERI_OOBI  } : {}),
  ...(KERI_PROOF ? { p: KERI_PROOF } : {}),
};

if (!KERI_OOBI || !KERI_PROOF) {
  console.log('Note: KERI_OOBI and KERI_PROOF not set. The credential will be indexed');
  console.log('      with keri_verified: false. Set them for full KERIA verification.\n');
}

async function runAuth(): Promise<string> {
  const txHash = await issueCertificates(address, [
    { hash: authHash, algorithm: 'SHA-256', metadata: JSON.stringify(authMetadata) },
  ]);
  console.log('AUTH cert transaction:', `${config.cexplorerTxUrl}/${txHash}`);
  console.log('Waiting for on-chain confirmation …');
  await waitFor(txHash);
  console.log('Confirmed.\n');
  return txHash;
}

let authTxHash: string;
try {
  authTxHash = await runAuth();
} catch (error) {
  if (error instanceof InsufficientFundsError) {
    console.log('\nInsufficient funds. Funding wallet and retrying …');
    await waitFor(await fundWallet(address));
    authTxHash = await runAuth();
  } else if (error instanceof WaitForTimeoutError) {
    console.error('Timed out waiting for confirmation. Re-run the script to check again.');
    Deno.exit(1);
  } else {
    throw error;
  }
}

console.log('AUTH certificate URL:');
console.log(`  ${config.verifyUrl}/${authHash}/${authTxHash}`);
console.log();

// ---------------------------------------------------------------------------
// Step 2 — Inspect: poll the credential API
// ---------------------------------------------------------------------------
console.log('━━━ Step 2: Inspect indexed credential ━━━');
console.log('Waiting 5 s for the async indexer to process the cert …');
await new Promise((r) => setTimeout(r, 5000));

const credentialUrl = `${config.backendUrl}/api/v1/credential/${paymentCredential}?type=identity`;
console.log('Calling:', credentialUrl);

let credentialData: unknown;
try {
  const res = await fetch(credentialUrl);
  if (res.status === 200) {
    credentialData = await res.json();
    console.log('\nCredential record:');
    console.log(JSON.stringify(credentialData, null, 2));
  } else if (res.status === 404) {
    console.log('\nCredential not indexed yet (indexer may still be processing).');
    console.log('Re-run the script to check again, or check the backend logs.');
  } else {
    console.log(`\nUnexpected response: ${res.status}`);
  }
} catch {
  console.log('\nCould not reach backend. Is the sandbox running?');
}

// ---------------------------------------------------------------------------
// Step 3 — Revoke the credential
// ---------------------------------------------------------------------------
console.log('\n━━━ Step 3: Revoke the credential ━━━');
console.log(`(revoking AUTH cert hash: ${authHash})\n`);

const revokeHash = await sha256hex(paymentCredential + 'REVOKE' + authHash + Date.now().toString());

const revokeMetadata = {
  uverify_template_id: 'IdentityAuth',
  uverify_update_policy: 'first',
  t: 'REVOKE',
  ct: 'identity',
  th: authHash,
};

async function runRevoke(): Promise<string> {
  const txHash = await issueCertificates(address, [
    { hash: revokeHash, algorithm: 'SHA-256', metadata: JSON.stringify(revokeMetadata) },
  ]);
  console.log('REVOKE cert transaction:', `${config.cexplorerTxUrl}/${txHash}`);
  console.log('Waiting for on-chain confirmation …');
  await waitFor(txHash);
  console.log('Confirmed.\n');
  return txHash;
}

let revokeTxHash: string;
try {
  revokeTxHash = await runRevoke();
} catch (error) {
  if (error instanceof InsufficientFundsError) {
    console.log('\nInsufficient funds. Funding wallet and retrying …');
    await waitFor(await fundWallet(address));
    revokeTxHash = await runRevoke();
  } else if (error instanceof WaitForTimeoutError) {
    console.error('Timed out waiting for confirmation.');
    Deno.exit(1);
  } else {
    throw error;
  }
}

console.log('Waiting 5 s for the indexer to process the revocation …');
await new Promise((r) => setTimeout(r, 5000));

const credentialAfterRevoke = await fetch(credentialUrl);
if (credentialAfterRevoke.status === 404) {
  console.log('Credential no longer active (revocation confirmed).');
} else if (credentialAfterRevoke.status === 200) {
  const data = await credentialAfterRevoke.json() as { active?: boolean };
  console.log(`Credential still present, active=${data?.active ?? 'unknown'}`);
  console.log('(Indexer may still be processing — re-run the script to verify.)');
}

console.log('\nDone.');
console.log('To re-register a fresh identity credential after revocation,');
console.log('delete wallet.txt and run the script again with a new wallet,');
console.log('or run only Step 1 with updated KERI fields.\n');
console.log('Credential API endpoint for this wallet:');
console.log(' ', credentialUrl);
