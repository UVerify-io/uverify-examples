# Digital Product Passport Example

This example shows how to issue a Digital Product Passport (DPP) for a physical product
on the Cardano blockchain using UVerify's built-in Digital Product Passport template.

## The core idea

A product's GTIN and serial number are combined and hashed with SHA-256 to create a unique,
stable on-chain fingerprint for that specific product unit. Material composition,
sustainability metrics, certifications, and lifecycle information are stored as structured
metadata using dedicated key prefixes:

- `mat_<name>` keys render as a material composition table (e.g. `mat_aluminum: '45%'`)
- `cert_<name>` keys render as certification badges (e.g. `cert_ce: 'CE Marking'`)
- `uv_url_serial` stores the SHA-256 hash of the serial number on-chain; the plain serial
  is revealed via a `?serial=` URL parameter in the verification link

The update policy is set to `restricted` so only the original issuer wallet can push
subsequent corrections or updates to the passport.

This makes it ideal for:

- **Manufacturers** — comply with EU Digital Product Passport regulations by anchoring
  product data on a public, tamper-proof ledger.
- **Sustainability reporting** — publish verified carbon footprint, recycled content, and
  energy class data that regulators and customers can independently audit.
- **Repair and end-of-life** — embed repair guidance, spare part availability, and recycling
  instructions directly on the blockchain.

## What the script does

1. **Wallet** — On the first run a new preprod wallet is created and its mnemonic is saved to
   `wallet.txt`. The wallet is funded automatically via the UVerify dev faucet. On every
   subsequent run the wallet is restored from `wallet.txt` and the faucet step is skipped.

2. **Product** — Defines a single product (a powerbank) with GTIN, serial number, origin,
   sustainability metrics, material composition, and certifications.

3. **Hash** — Computes `sha256(gtin + serialNumber)` as the unique certificate fingerprint
   for this product unit.

4. **Issuance** — Submits the passport on-chain via `issueCertificates` with
   `uverify_update_policy: 'restricted'`, then waits for confirmation.

5. **Link** — Prints the passport URL with `?serial=` appended so the plain serial number
   is visible on the certificate page.

## Prerequisites

- Node.js 20+
- A running UVerify backend with `FAUCET_ENABLED=true`, **or** a pre-funded `wallet.txt`

## Run

```bash
cd uverify-examples/typescript
npm install
npm run digital-product-passport
```

## Verification

Open the printed URL in any browser — no wallet or account required. The UVerify app renders
the full Digital Product Passport with material table, certification badges, sustainability
data, and lifecycle information.

To verify programmatically, recompute `sha256(gtin + serialNumber)` and call the public API:

```bash
curl https://api.preprod.uverify.io/api/v1/verify/<hash>
```

An empty array means no passport was issued for that product unit. A non-empty array proves
it has been anchored — and shows who issued it and when.
