# Identity Credential Example

This example demonstrates the full KERI-backed identity credential lifecycle on UVerify:

1. **Register** — submit an `AUTH` credential certificate from your wallet.
2. **Inspect** — poll `GET /api/v1/credential/{paymentCredential}?type=identity` to confirm the cert was indexed.
3. **Revoke** — submit a `REVOKE` certificate to invalidate the credential.

## What is an identity credential?

An identity credential links a Cardano payment credential (wallet) to a KERI AID — a
cryptographic identifier whose trust chain is verified via a KERIA agent. When someone opens
a product certificate issued by that wallet, the `IssuerIdentityBadge` component calls this
API and shows either a green "KERI Verified" badge or a yellow warning badge.

## Sandbox behaviour (no KERIA agent)

Without a live KERIA agent the credential is stored with `keri_verified: false`. The badge
still renders but carries a warning. This is the expected sandbox outcome.

To enable full verification, point the backend at a real KERIA agent:

```bash
# In your backend environment
KERIA_AGENT_URL=https://keria.example.com
```

Then provide real KERI fields via environment variables when running this script:

```bash
KERI_AID=EKtQ1lym...   # your KERI Autonomic Identifier
KERI_SCHEMA=EJVgEQO... # ACDC leaf credential schema ID
KERI_OOBI=https://...  # OOBI discovery endpoint for your KEL
KERI_PROOF=AAA...      # KERI signature over "cardano:<paymentCredentialHex>"
```

Generating the `KERI_PROOF` field with Veridian / signify-ts:

```typescript
// Sign the message "cardano:<hex-payment-credential>" with your AID in signify-ts
const proof = await client.sign(`cardano:${paymentCredentialHex}`);
```

## Prerequisites

- [Deno](https://deno.com) 2+
- UVerify sandbox running (`uv run sandbox.py start` in `uverify-examples/`) **or** preprod backend

## Run (sandbox, no KERIA)

```bash
cd uverify-examples/typescript/identity_credential
deno run -A index.ts
```

## Run with full KERIA verification (keri_verified: true)

This requires the sandbox KERIA profile, which starts a local witness network, vLEI Server, KERIA agent, and vLEI Verifier.

**Step 1 — Start the sandbox with KERIA:**

```bash
cd uverify-examples
uv run sandbox.py start --keria
```

**Step 2 — Generate KERI fields:**

```bash
cd typescript/identity_credential
# Pass your Cardano payment credential hex (printed by index.ts on first run)
deno run -A keria-setup.ts <payment-credential-hex>
```

The script creates a KERI AID, issues an ACDC credential, registers it with the local vLEI Verifier, and prints the env vars.

**Step 3 — Run index.ts with real KERI fields:**

```bash
KERI_AID=E... \
KERI_SCHEMA=E... \
KERI_OOBI=http://localhost:3902/oobi/E.../agent/E... \
KERI_PROOF=AA... \
deno run -A index.ts
```

The backend calls `GET http://vlei-verifier:7676/authorizations/{KERI_AID}`. If the credential was accepted in Step 2, the indexed record will have `keriVerified: true`.

State (passcode, AID prefix, registry ID) is saved to `keria-state.json`. Subsequent runs of `keria-setup.ts` restore the existing AID and re-generate the signing proof.

On the first run the script creates a new wallet, saves the mnemonic to `wallet.txt`, and
funds it via the dev faucet. Subsequent runs restore the wallet from `wallet.txt`.

## Expected output (sandbox, no KERIA)

```
Created new wallet: addr_test1...
Payment credential: abcdef0123...

━━━ Step 1: Register identity credential ━━━
Note: KERI_OOBI and KERI_PROOF not set. The credential will be indexed
      with keri_verified: false. Set them for full KERIA verification.

AUTH cert transaction: http://localhost:3001/...
Waiting for on-chain confirmation …
Confirmed.

AUTH certificate URL:
  http://localhost:3000/verify/<hash>/<txHash>

━━━ Step 2: Inspect indexed credential ━━━
Waiting 5 s for the async indexer to process the cert …
Calling: http://localhost:9090/api/v1/credential/<paymentCredential>?type=identity

Credential record:
{
  "authHash": "<hash>",
  "credentialType": "identity",
  "keriAid": "EKtQ1lym...",
  "txHash": "<txHash>",
  "active": true,
  "keriVerified": false,
  "acdc": null
}

━━━ Step 3: Revoke the credential ━━━
REVOKE cert transaction: http://localhost:3001/...
Waiting for on-chain confirmation …
Confirmed.

Credential no longer active (revocation confirmed).
```

## Credential API reference

| Endpoint | Description |
|---|---|
| `GET /api/v1/credential/{paymentCredential}` | All active credentials for a wallet |
| `GET /api/v1/credential/{paymentCredential}?type=identity` | Active identity credential only |
| `GET /api/v1/credential/{paymentCredential}?type=ISO22000` | Active ISO 22000 credential |
| `GET /api/v1/credential/by-hash/{authHash}` | Lookup by AUTH cert hash |

## Next step — product cert with issuer badge

Issue a product certificate from the same wallet and open it in the UVerify app. The
`IssuerIdentityBadge` in the Product Verification template will call the credential API and
display a badge next to the product header showing the issuer's verified status.

```bash
cd ../product_verification
deno run -A index.ts   # uses the same wallet.txt if you copy it over
```
