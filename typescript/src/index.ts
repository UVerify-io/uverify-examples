/**
 * UVerify TypeScript SDK Examples
 *
 * Each example is self-contained and runnable independently.
 * All examples target the UVerify preprod backend at http://localhost:9090
 * and the Cardano pre-production testnet.
 *
 * Prerequisites
 * ─────────────
 *  • A running UVerify backend:  cd uverify-backend && ./gradlew bootRun
 *  • Backend started with FAUCET_ENABLED=true  (needed to auto-fund wallets)
 *
 * Run an example
 * ──────────────
 *  tsx src/examples/notary.ts
 *  tsx src/examples/school_certificate.ts
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Quick-start (generic API tour)
 * ──────────────────────────────
 * The code below shows every SDK method in a single script without targeting a
 * specific business domain. For real-world use-cases see the examples above.
 */

import { UVerifyClient } from '@uverify/sdk';
import { sha256 } from 'js-sha256';
import { createWallet } from './utils/wallet.js';

const { address, mnemonic, signMessage, signTx } = await createWallet();
console.log('Wallet address :', address);
console.log('Wallet mnemonic:', mnemonic);

const client = new UVerifyClient({
  baseUrl: 'http://localhost:9090',
  signMessage,
  signTx,
});

// -----------------------------------------------------------------------
// verify — look up all on-chain certificates for a given data hash
// -----------------------------------------------------------------------
const certificates = await client.verify('a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e');
console.log('certificates', certificates);

// -----------------------------------------------------------------------
// verifyByTransaction — fetch a specific certificate by tx hash + data hash
// -----------------------------------------------------------------------
const first = certificates?.[0];
if (first) {
  const cert = await client.verifyByTransaction(first.transactionHash, first.hash);
  console.log('certificate by transaction', cert);
}

// -----------------------------------------------------------------------
// getUserInfo — retrieve the current user state (requires wallet signing)
// -----------------------------------------------------------------------
const state = await client.getUserInfo(address);
console.log('user state', state);

// -----------------------------------------------------------------------
// issueCertificates — certify data on-chain
// metadata can be a plain object — the SDK serialises it automatically
// -----------------------------------------------------------------------
const myData = 'Hello, UVerify!';
const hash = sha256(myData);

const txHash = await client.issueCertificates(address, [
  {
    hash,
    algorithm: 'SHA-256',
    metadata: JSON.stringify({
      issuer: 'Acme Corp',
      description: 'Proof of existence for myData',
      date: new Date().toISOString(),
    }),
  },
]);
console.log('certificate issued, tx hash:', txHash);

// -----------------------------------------------------------------------
// invalidateState — mark a state as invalid (destructive, commented out)
// -----------------------------------------------------------------------
// if (state?.id) {
//   const result = await client.invalidateState(address, state.id);
//   console.log('invalidate state result', result);
// }

// -----------------------------------------------------------------------
// optOut — remove the user's state entirely (destructive, commented out)
// -----------------------------------------------------------------------
// if (state?.id) {
//   const result = await client.optOut(address, state.id);
//   console.log('opt out result', result);
// }
