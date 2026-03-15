import { UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';
import { sha256 } from 'js-sha256';
import { createWallet } from '../../utils/wallet.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const __dir = dirname(fileURLToPath(import.meta.url));
const WALLET_FILE = 'wallet.txt';
const VERIFY_URL = 'https://app.preprod.uverify.io/verify';
const CEXPLORER_TX_URL = 'https://preprod.cexplorer.io/tx';

const isNew = !existsSync(WALLET_FILE);
const wallet = isNew
  ? await createWallet()
  : await createWallet(readFileSync(WALLET_FILE, 'utf-8').trim());

const { address, signMessage, signTx } = wallet;
const client = new UVerifyClient({ signMessage, signTx });
const { waitFor, fundWallet, issueCertificates } = client;

if (isNew) {
  writeFileSync(WALLET_FILE, wallet.mnemonic, 'utf-8');
  console.log('Create new pre-funded wallet:', address);
  console.log('Mnemonic saved to wallet.txt. Keep this file safe.\n');
  await waitFor(await fundWallet(address));
} else {
  console.log('Restore wallet:', address, '\n');
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
        'Re-run the script to check again or increase the timeout if this happens repeatedly.'
      );
      process.exit(1);
    }
    throw error;
  }
}

console.log('Certifying file …');
const fileBytes = readFileSync(join(__dir, 'sample_document.txt'));
await certify(sha256(fileBytes), {
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

await certify(sha256(contract), {
  contract_type: 'service_agreement',
  contract_id: randomUUID(),
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

await certify(sha256(song), {
  genre: 'rock',
  author: 'Alice Smith',
  date: new Date().toISOString().slice(0, 10),
});

console.log('All certificates are permanently recorded on Cardano.');
