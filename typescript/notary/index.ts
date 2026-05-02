import { Address, Bytes, COSE, PrivateKey, TransactionWitnessSet } from '@evolution-sdk/evolution';
import { make as makeEvolutionClient } from '@evolution-sdk/evolution/sdk/client/Client';
import { preprod } from '@evolution-sdk/evolution/sdk/client/Chain';
import { addressFromSeed } from '@evolution-sdk/evolution/sdk/wallet/Derivation';
import { UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';

const WALLET_FILE = new URL('./wallet.txt', import.meta.url);
const VERIFY_URL = 'https://app.preprod.uverify.io/verify';
const CEXPLORER_TX_URL = 'https://preprod.cexplorer.io/tx';

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

  return { address: addressBech32, mnemonic, signTx, signMessage };
}

function createWallet() {
  const mnemonic = PrivateKey.generateMnemonic(256);
  return walletFromMnemonic(mnemonic);
}

async function sha256hex(data: Uint8Array): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', data);
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

const client = new UVerifyClient({ signMessage, signTx });
const { waitFor, fundWallet, issueCertificates } = client;

if (isNew) {
  await Deno.writeTextFile(WALLET_FILE, mnemonic);
  console.log('Created new wallet:', address);
  console.log('Mnemonic saved to wallet.txt. Keep this file safe.\n');
  await waitFor(await fundWallet(address));
} else {
  console.log('Restored wallet:', address, '\n');
}

async function certify(hash: string, metadata: Record<string, string | number>) {
  try {
    const txHash = await issueCertificates(address, [
      { hash, algorithm: 'SHA-256', metadata: JSON.stringify(metadata) },
    ]);
    console.log(`Transaction submitted: ${CEXPLORER_TX_URL}/${txHash}\n`);
    await waitFor(txHash);
    console.log(`Certified! View your certificate at ${VERIFY_URL}/${hash}`);
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
}

console.log('Certifying file …');
const fileBytes = await Deno.readFile(new URL('./sample_document.txt', import.meta.url));
await certify(await sha256hex(fileBytes), {
  type: 'document',
  path: 'https://username:password@example.tld/files/sample_document.txt',
});

console.log('Certifying contract …');
const contract = `SERVICE AGREEMENT

This Service Agreement is entered into on ${new Date().toISOString().slice(0, 10)}
between Acme Corp ("Provider") and John Doe ("Client").

1. Services.        Provider delivers software development services per SOW-001.
2. Payment.         Client pays EUR 5,000 upon completion of each milestone.
3. Confidentiality. Both parties keep all project details strictly confidential.
4. Governing law.   This Agreement is governed by the laws of Germany.

Signed by both parties.`;

await certify(await sha256hex(new TextEncoder().encode(contract)), {
  contract_type: 'service_agreement',
  contract_id: crypto.randomUUID(),
  contract_server: 'https://contracts.example.tld',
  date: new Date().toISOString().slice(0, 10),
});

console.log('Certifying song …');
const song = `The Immutable Record

Verse 1:
The blockchain never lies,
every hash a testament,
written in the morning skies,
a proof that time has lent.

Chorus:
Immutable and true,
a fingerprint in chain,
no one can undo
what we forever claim.

Verse 2:
A song, a word, a deed,
all anchored to the block,
the world can verify
what time has come to lock.`;

await certify(await sha256hex(new TextEncoder().encode(song)), {
  genre: 'rock',
  author: 'Alice Smith',
  date: new Date().toISOString().slice(0, 10),
});

console.log('All certificates are permanently recorded on Cardano.');
