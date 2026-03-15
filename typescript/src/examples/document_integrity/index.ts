import { UVerifyClient, WaitForTimeoutError } from '@uverify/sdk';
import { sha256 } from 'js-sha256';
import { createWallet } from '../../utils/wallet.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

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
  console.log('Created new wallet:', address);
  console.log('Mnemonic saved to wallet.txt. Keep this file safe.\n');
  const txHash = await fundWallet(address);
  console.log(`Funding transaction submitted: ${CEXPLORER_TX_URL}/${txHash}`);
  await waitFor(txHash);
  console.log('Wallet funded and ready to use.\n');
} else {
  console.log('Restored wallet:', address, '\n');
}

const FILE_PATH = join(__dir, 'sample_thesis.zip');

if (!existsSync(FILE_PATH)) {
  writeFileSync(FILE_PATH, 'This is a placeholder for thesis.zip.');
  console.log('Created placeholder sample_thesis.zip for demo purposes.\n');
}

const fileBytes = readFileSync(FILE_PATH);
const fileHash = sha256(fileBytes);
const fileName = basename(FILE_PATH);
const fileSizeBytes = fileBytes.length;
const fileType = 'application/zip';
const fileHint = 'ZIP archive, not password protected';

const FILE_LOCATION = `https://fileshare.university.tld/thesis/${fileName}`;

const AUTHOR = 'Fabian Bormann';
const INSTITUTION = 'Technical University of Musterstadt';
const THESIS_TITLE = "Master's thesis: Impact of Blockchain Technology on Academic Record Keeping";

console.log(`Certifying "${fileName}" (${fileSizeBytes.toLocaleString()} bytes) …`);
console.log(`SHA-256: ${fileHash}\n`);

try {
  const txHash = await issueCertificates(address, [
    {
      hash: fileHash,
      algorithm: 'SHA-256',
      metadata: JSON.stringify({
        uverify_template_id: 'documentIntegrity',
        title: THESIS_TITLE,
        issuer: INSTITUTION,
        uv_url_filename: sha256(fileName),
        location: FILE_LOCATION,
        file_size: fileSizeBytes,
        file_type: fileType,
        file_hint: fileHint,
        description:
          `You received this link because you were sent a copy of "${fileName}". ` +
          `The file is available at: ${FILE_LOCATION}. ` +
          `To confirm no one has tampered with it, drop the file into the area below — ` +
          `the SHA-256 fingerprint will be compared against the blockchain record.`,
        uv_url_author: sha256(AUTHOR),
      }),
    },
  ]);

  console.log(`Transaction submitted: ${CEXPLORER_TX_URL}/${txHash}`);
  await waitFor(txHash);
  console.log('Certificate confirmed on-chain.\n');

  const verifyUrl = `${VERIFY_URL}/${fileHash}?filename=${encodeURIComponent(fileName)}&author=${encodeURIComponent(AUTHOR)}`;
  console.log('Share this URL with the verifier:');
  console.log(`  ${verifyUrl}`);
} catch (error) {
  if (error instanceof WaitForTimeoutError) {
    console.error(
      '\nTimed out waiting for confirmation. The transaction may still be processing.\n' +
        'Re-run the script to check again or increase the timeout if this happens repeatedly.',
    );
    process.exit(1);
  }
  throw error;
}
