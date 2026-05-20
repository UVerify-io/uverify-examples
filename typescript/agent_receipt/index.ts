import { Address, Bytes, COSE, PrivateKey, TransactionWitnessSet } from '@evolution-sdk/evolution';
import { make as makeEvolutionClient } from '@evolution-sdk/evolution/sdk/client/Client';
import { mainnet, preprod } from '@evolution-sdk/evolution/sdk/client/Chain';
import { addressFromSeed } from '@evolution-sdk/evolution/sdk/wallet/Derivation';
import { UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';

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
    backendUrl: 'https://api.uverify.io',
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
const { waitFor, fundWallet } = client;

if (isNew) {
  await Deno.writeTextFile(WALLET_FILE, mnemonic);
  console.log('Created new wallet:', address);
  console.log('Mnemonic saved to wallet.txt. Keep this file safe.\n');
  await waitFor(await fundWallet(address));
} else {
  console.log('Restored wallet:', address, '\n');
}

// A realistic Level 4 LCP agent receipt. The commerce platform publishes its
// legal context at /.well-known/legal-context.json. The agent fetches the terms,
// verifies the ATR hash, then anchors the receipt on-chain via UVerify.
const receipt = {
  // The underlying commerce transaction ID issued by the payment protocol.
  transactionId: `txn_${crypto.randomUUID()}`,
  // LCP spec field names
  terms: 'https://datastream.example.com/terms/v2.md',
  // SHA-256 hash of the terms document — verified by the agent before paying.
  atrHash: '0x7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
  termsFormat: 'markdown',
  acceptanceRequired: true,
  agentName: 'ResearchBot v2.1',
  // disputeResolution presence signals Level 4
  disputeResolution: {
    method: 'AAA Commercial Arbitration Rules',
    jurisdiction: 'New York, USA',
    contact: 'disputes@datastream.example.com',
    clauseId: 'sha256:0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    source: 'https://adr.org/clauses/commercial-arbitration',
    catalog: 'https://adr.org/.well-known/dispute-services.json',
  },
};

console.log('Issuing Agent Receipt …');
console.log(`  Terms   : ${receipt.terms}`);
console.log(`  Agent   : ${receipt.agentName}`);
console.log(`  Tx ID   : ${receipt.transactionId}`);
console.log(`  LCP     : Level 4 — Integrated (derived from disputeResolution)\n`);

try {
  const { txHash, verifyUrl } = await client.apps.issueAgentReceipt(address, receipt);

  console.log(`Transaction submitted: ${config.cexplorerTxUrl}/${txHash}`);
  await waitFor(txHash);
  console.log('Agent Receipt confirmed on-chain.\n');

  console.log('Verification URL (share with auditors or counterparties):');
  console.log(`  ${verifyUrl}`);
  console.log('\nDone. The Agent Receipt is permanently anchored on Cardano.');
} catch (error) {
  if (error instanceof WaitForTimeoutError) {
    console.error(
      '\nTimed out waiting for confirmation. The transaction may still be processing.\n' +
        'Re-run the script to check again or increase the timeout if this happens repeatedly.',
    );
    Deno.exit(1);
  }
  throw error;
}
