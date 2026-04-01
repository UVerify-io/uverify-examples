# Tokenizable Certificate Example

This example shows how to issue a tokenizable certificate — an on-chain entry in a
sorted linked list that also mints a CIP-68 NFT pair for the recipient. The NFT owner
can later redeem (burn) the token to remove their record from the list.

## The core idea

Unlike a standard UVerify certificate that is a plain on-chain record, a tokenizable
certificate mints a **user token** (CIP-68 label-222) for the recipient and a matching
**reference token** (label-100) locked in the contract. This makes the certificate
*transferable* and *redeemable*:

- The holder can prove ownership by holding the user token in their wallet.
- They can redeem the token at any time, burning it and removing the node from the list.

This is useful for:

- **Loyalty programmes** — members receive a token that can be burned for a reward.
- **Event tickets** — attendees hold a verifiable, transferable admission token.
- **Conditional access** — gated content or services that expire once redeemed.

## Prerequisites

- Node.js 20+
- A UVerify backend running with `TOKENIZABLE_CERTIFICATE_EXTENSION_ENABLED=true`
- An **Init UTxO** already on-chain — create one first via:

  ```bash
  curl -X POST https://api.preprod.uverify.io/api/v1/extension/tokenizable-certificate/init \
    -H 'Content-Type: application/json' \
    -d '{"address":"<your-address>"}'
  ```

  Note the returned `txHash` and `outputIndex` — you need them below.

## Configuration

Open `index.ts` and fill in the four constants before running:

| Constant | Description |
|---|---|
| `OWNER_PUB_KEY_HASH` | 32-byte hex public key hash of the token recipient |
| `ASSET_NAME_HEX` | Hex-encoded CIP-68 asset name (e.g. `"436572744e4654"`) |
| `INIT_UTXO_TX_HASH` | Transaction hash returned by the init call above |
| `INIT_UTXO_OUTPUT_INDEX` | Output index of the Init UTxO (usually `0`) |

## Run

```bash
cd uverify-examples/typescript
npm install
npm run tokenizable_certificate
```

## What the script does

1. Creates or restores a preprod wallet and funds it via the dev faucet on first run.
2. Computes `sha256(document)` as the on-chain key.
3. Calls `issueTokenizableCertificate` — builds, signs, and submits the insert transaction.
4. Waits for on-chain confirmation, then prints the verification URL.
5. Queries and prints the certificate status (claimed / unclaimed).

## Redeeming

The recipient can burn their user token and remove the node by calling:

```ts
const txHash = await client.apps.redeemTokenizableCertificate({
  key,
  claimerAddress: recipientAddress,
  initUtxoTxHash: INIT_UTXO_TX_HASH,
  initUtxoOutputIndex: INIT_UTXO_OUTPUT_INDEX,
  assetNameHex: ASSET_NAME_HEX,
});
```
