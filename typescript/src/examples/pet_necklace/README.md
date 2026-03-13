# Pet Necklace Example

This example shows how to issue pet ID certificates designed to be printed as QR codes on
necklace tags, using UVerify's built-in Pet Necklace template.

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

## What the script does

1. **Wallet** — On the first run a new preprod wallet is created and its mnemonic is saved to
   `wallet.txt`. The wallet is funded automatically via the UVerify dev faucet. On every
   subsequent run the wallet is restored from `wallet.txt` and the faucet step is skipped.

2. **Pets** — Defines two pets (a dog and a cat) with owner name, phone number, species,
   breed, and an optional note for the finder.

3. **Privacy** — Owner name and phone are hashed before being stored on-chain. The plain
   values are embedded only in the QR code URL the owner prints on the tag.

4. **Issuance** — Both certificates are submitted in a single transaction via
   `issueCertificates`, then confirmed on-chain via `waitFor`.

5. **QR-code URLs** — Prints one URL per pet. Encode each URL as a QR code and print it on
   the necklace tag. The `?owner_name=` and `?phone=` parameters reveal the contact details
   on the certificate page when scanned.

## Prerequisites

- Node.js 20+
- A running UVerify backend with `FAUCET_ENABLED=true`, **or** a pre-funded `wallet.txt`

## Run

```bash
cd uverify-examples/typescript
npm install
npm run pet-necklace
```

## Verification

Encode the printed URL as a QR code (any free QR generator will do) and print it on the
necklace tag. Scanning the tag in any browser — no app or account required — shows the pet's
details and a tap-to-call button for the owner.

To verify programmatically, recompute `sha256(petName + phone)` and call the public API:

```bash
curl https://api.preprod.uverify.io/api/v1/verify/<hash>
```

An empty array means no certificate was issued for that pet. A non-empty array proves it
has been registered — and shows when and by whom.
