# Product Verification Example

This example shows how a brand issues product authentication certificates for
anti-counterfeiting, using UVerify's built-in Product Verification template.

## Prerequisites

- [Deno](https://deno.com) 2+
- On the first run only: a backend with `FAUCET_ENABLED=true` **or** a pre-funded `wallet.txt`

## Run

```bash
cd uverify-examples/typescript/product_verification

# issue one product certificate using the example plan
deno run -A index.ts --plan example.product.plan

# issue ten certificates in one transaction
deno run -A index.ts --plan example.product.plan --number 10
```

## Verification

Encode the printed URL as a QR code and print it on the product label. Scanning it in any
browser — no app or account required — shows the authentication certificate with product
details and confirms the item is genuine.

To verify programmatically, call the public API with the certificate hash printed during
issuance:

```bash
curl https://api.preprod.uverify.io/api/v1/verify/<hash>
```

An empty array means the product has never been authenticated on-chain (possible counterfeit).
A non-empty array proves it is genuine — anchored by the manufacturer, permanently.

## The core idea

Each product's hash is computed as `sha256(manufacturer + serialNumber + itemId)` where
`itemId` is a fresh UUID generated at issuance time. This ensures every certificate is
unique even when the plan uses static fields. The update policy is set to `first` so only
the initial issuance transaction can anchor the certificate — subsequent writes to the same
hash are rejected.

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

## Plan files

Product data is defined in a JSON plan file using the same field-def format as the sandbox
simulator (`sandbox/simulator/generate.ts`). Each key maps to a field definition:

| Type | Description |
|---|---|
| `static` | Always emits the given value |
| `one-of` | Picks uniformly from a `values` array |
| `random-string` | Generates a string matching a regex template |
| `random-number` | Picks an integer in `[min, max]` |
| `random-bool` | Emits `true` or `false` with equal probability |

`example.product.plan` ships with the example and represents a single product unit:

```json
{
  "name":           { "type": "static", "value": "Organic Cotton Signature Tee" },
  "manufacturer":   { "type": "static", "value": "EcoWear GmbH" },
  "serialNumber":   { "type": "static", "value": "EW-2024-TC-00847" },
  "productionDate": { "type": "static", "value": "2024-10-01" },
  "materialInfo":   { "type": "static", "value": "100% GOTS-certified organic cotton." }
}
```

Swap `static` for `random-string` on `serialNumber` to generate unique serial numbers for
each item in a batch. Pass `--number N` to authenticate N products in one transaction.

## What the script does

1. **Wallet** — On the first run a new wallet is created and its mnemonic is saved to
   `wallet.txt`. The wallet is funded automatically via the UVerify faucet. On every
   subsequent run the wallet is restored from `wallet.txt` and the faucet step is skipped.

2. **Products** — Evaluates the plan file N times (default: 1) to build the product batch.

3. **Hash** — Computes `sha256(manufacturer + serialNumber + itemId)` for each product.
   A fresh `itemId` UUID is generated per item, guaranteeing a unique hash even when plan
   fields are static.

4. **Issuance** — All certificates are submitted in a single transaction via
   `issueCertificates`, then confirmed on-chain via `waitFor`.

5. **Links** — Prints one authentication URL per product. Encode each URL as a QR code and
   print it on the product label.
