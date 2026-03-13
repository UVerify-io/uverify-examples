# Product Verification Example

This example shows how a brand issues product authentication certificates for
anti-counterfeiting, using UVerify's built-in Product Verification template.

## The core idea

`sha256(manufacturer + serialNumber)` produces a unique, stable on-chain fingerprint for
each product unit. The manufacturer stores this hash on the Cardano blockchain together with
product details — name, production date, material info, and an image URL. Customers can scan
a QR code printed on the label to instantly verify the product's authenticity without
trusting any central database.

> **Whitelist note** — The Product Verification template restricts which issuer addresses
> trigger its branded layout in the UVerify app. Only certificates from addresses listed in
> the template's `whitelist` array render with the Product Verification design; other issuers
> fall back to the Default template. To use the branded layout with your own wallet, add your
> address to the template's whitelist in your UVerify deployment.

This makes it ideal for:

- **Brands and manufacturers** — protect customers from counterfeit goods by anchoring
  authentic product records on a public blockchain.
- **Luxury goods** — provide a permanent, independently verifiable certificate of
  authenticity that travels with the product forever.
- **Food and cosmetics** — publish production date and material information in a tamper-proof
  format that regulators and consumers can audit.

## What the script does

1. **Wallet** — On the first run a new preprod wallet is created and its mnemonic is saved to
   `wallet.txt`. The wallet is funded automatically via the UVerify dev faucet. On every
   subsequent run the wallet is restored from `wallet.txt` and the faucet step is skipped.

2. **Product** — Defines a single product with manufacturer name, serial number, production
   date, material information, and an image URL.

3. **Hash** — Computes `sha256(manufacturer + serialNumber)` as the unique certificate
   fingerprint for this product unit.

4. **Issuance** — Submits the authentication certificate via `issueCertificates`, then waits
   for on-chain confirmation.

5. **Link** — Prints the authentication URL ready to be encoded as a QR code on the product
   label.

## Prerequisites

- Node.js 20+
- A running UVerify backend with `FAUCET_ENABLED=true`, **or** a pre-funded `wallet.txt`

## Run

```bash
cd uverify-examples/typescript
npm install
npm run product-verification
```

## Verification

Encode the printed URL as a QR code and print it on the product label. Scanning it in any
browser — no app or account required — shows the authentication certificate with product
details and confirms the item is genuine.

To verify programmatically, recompute `sha256(manufacturer + serialNumber)` and call the
public API:

```bash
curl https://api.preprod.uverify.io/api/v1/verify/<hash>
```

An empty array means the product has never been authenticated on-chain (possible counterfeit).
A non-empty array proves it is genuine — anchored by the manufacturer, permanently.
