# Pet Necklace Example

This example shows how to issue pet ID certificates designed to be printed as QR codes on
necklace tags, using UVerify's built-in Pet Necklace template.

## Prerequisites

- [Deno](https://deno.com) 2+
- On the first run only: a backend with `FAUCET_ENABLED=true` **or** a pre-funded `wallet.txt`

## Run

```bash
cd uverify-examples/typescript/pet_necklace

# issue one pet certificate using the example plan
deno run -A index.ts --plan example.pet.plan

# issue five pet certificates in one transaction
deno run -A index.ts --plan example.pet.plan --number 5
```

## Verification

Encode the printed URL as a QR code (any free QR generator will do) and print it on the
necklace tag. Scanning the tag in any browser — no app or account required — shows the pet's
details and a tap-to-call button for the owner.

To verify programmatically, recompute `sha256(petName + phone + runId)` and call the
public API:

```bash
curl https://api.preprod.uverify.io/api/v1/verify/<hash>
```

An empty array means no certificate was issued for that pet. A non-empty array proves it
has been registered — and shows when and by whom.

## The core idea

Anyone who finds a lost pet can scan the QR code on the tag and instantly see the pet's
details — name, species, breed — along with a tap-to-call link to the owner. Owner name
and phone number are stored as SHA-256 hashes on-chain (`uv_url_owner_name`, `uv_url_phone`)
to protect privacy. The owner encodes the full verification URL — including plain name and
phone as `?owner_name=` and `?phone=` parameters — into the QR code so finders see the
contact details directly on the certificate page.

This makes it ideal for:

- **Pet registration services** — issue blockchain-anchored IDs that work even if the
  microchip database is unavailable.
- **Animal shelters** — provide adopters with a permanent, unforgeable digital identity tag
  at adoption time.
- **Individual owners** — create a tamper-proof, self-verifiable record of ownership for
  any animal.

## Plan files

Pet data is defined in a JSON plan file using the same field-def format as the sandbox
simulator (`sandbox/simulator/generate.ts`). Each key maps to a field definition:

| Type | Description |
|---|---|
| `static` | Always emits the given value |
| `one-of` | Picks uniformly from a `values` array |
| `random-string` | Generates a string matching a regex template |
| `random-number` | Picks an integer in `[min, max]` |
| `random-bool` | Emits `true` or `false` with equal probability |

`example.pet.plan` ships with the example and represents a single pet:

```json
{
  "petName":   { "type": "static", "value": "Luna" },
  "ownerName": { "type": "static", "value": "Emma Schneider" },
  "phone":     { "type": "static", "value": "+49 30 12345678" },
  "species":   { "type": "static", "value": "Dog" },
  "breed":     { "type": "static", "value": "Golden Retriever" },
  "note":      { "type": "static", "value": "Very friendly! Please call if found." }
}
```

Swap `static` for `one-of` or `random-string` to generate synthetic pets for load testing.
Pass `--number N` to issue N certificates in one transaction.

## What the script does

1. **Wallet** — On the first run a new wallet is created and its mnemonic is saved to
   `wallet.txt`. The wallet is funded automatically via the UVerify faucet. On every
   subsequent run the wallet is restored from `wallet.txt` and the faucet step is skipped.

2. **Pets** — Evaluates the plan file N times (default: 1) to build the pet batch.

3. **Privacy** — Owner name and phone are SHA-256 hashed before being stored on-chain. The
   plain values are embedded only in the QR code URL the owner prints on the tag.

4. **Issuance** — All certificates are submitted in a single transaction via
   `issueCertificates`, then confirmed on-chain via `waitFor`.

5. **QR-code URLs** — Prints one URL per pet. Encode each URL as a QR code and print it on
   the necklace tag. The `?owner_name=` and `?phone=` parameters reveal the contact details
   on the certificate page when scanned.
