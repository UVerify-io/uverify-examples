# Digital Product Passport Example

This example shows how to issue Digital Product Passports (DPP) for physical products
on the Cardano blockchain using UVerify's built-in Digital Product Passport template.

## Prerequisites

- [Deno](https://deno.com) 2+
- On the first run only: a backend with `FAUCET_ENABLED=true` **or** a pre-funded `wallet.txt`

## Run

```bash
cd uverify-examples/typescript/digital_product_passport

# issue one passport using the example plan
deno run -A index.ts --plan example.dpp.plan

# issue three passports from a custom plan (one transaction each)
deno run -A index.ts --plan example.dpp.plan --number 3
```

## Verification

Open the printed URL in any browser — no wallet or account required. The UVerify app
renders the full Digital Product Passport with material table, certification badges,
sustainability data, and lifecycle information.

To verify programmatically, call the public API with the certificate hash:

```bash
curl https://api.preprod.uverify.io/api/v1/verify/<hash>
```

An empty array means no passport was issued for that product unit. A non-empty array proves
it has been anchored — and shows who issued it and when.

## The core idea

A product's GTIN and serial number are combined and hashed with SHA-256 to create a unique,
stable on-chain fingerprint for that specific product unit. Material composition,
sustainability metrics, certifications, and lifecycle information are stored as structured
metadata:

- `mat_<name>` keys in the plan become entries in the `materials` object (e.g. `mat_aluminum: '45%'`
  → rendered as a material composition table)
- `cert_<name>` keys in the plan become entries in the `certifications` object (e.g. `cert_ce: 'CE Marking'`
  → rendered as certification badges)
- `uv_url_serial` stores the SHA-256 hash of the serial number on-chain; the plain serial
  is revealed via a `?serial=` URL parameter in the verification link

This makes it ideal for:

- **Manufacturers** — comply with EU Digital Product Passport regulations by anchoring
  product data on a public, tamper-proof ledger.
- **Sustainability reporting** — publish verified carbon footprint, recycled content, and
  energy class data that regulators and customers can independently audit.
- **Repair and end-of-life** — embed repair guidance, spare part availability, and recycling
  instructions directly on the blockchain.

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

Material fields use the `mat_` prefix and certification fields use the `cert_` prefix. Both
prefixes are stripped when the nested objects are assembled:

```json
{
  "name":            { "type": "static", "value": "EcoCharge Powerbank Pro 200" },
  "manufacturer":    { "type": "static", "value": "GreenTech AG" },
  "gtin":            { "type": "static", "value": "04012345678901" },
  "serialNumber":    { "type": "static", "value": "EC200-SN-20240815-00847" },
  "mat_aluminum":    { "type": "static", "value": "45%" },
  "cert_ce":         { "type": "static", "value": "CE Marking" }
}
```

`example.dpp.plan` ships with the example. Swap `static` for `one-of` or `random-string`
to generate synthetic products for load testing. Pass `--number N` to issue multiple
passports — each in its own transaction.

## What the script does

1. **Wallet** — On the first run a new wallet is created and its mnemonic is saved to
   `wallet.txt`. The wallet is funded automatically via the UVerify faucet. On every
   subsequent run the wallet is restored from `wallet.txt` and the faucet step is skipped.

2. **Plan** — Evaluates the plan file N times (default: 1) to build the product batch.

3. **Assembly** — All `mat_*` fields are collected into a `materials` object and all
   `cert_*` fields into a `certifications` object. All other fields map directly to the
   `DigitalProductPassportInput` type.

4. **Issuance** — Each passport is submitted in its own transaction via
   `issueDigitalProductPassport`, then confirmed on-chain via `waitFor`.

5. **Links** — Prints one verification URL per product with the `?serial=` parameter
   pre-populated so the certificate page reveals the serial number.
