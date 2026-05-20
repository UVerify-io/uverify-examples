/**
 * keria-setup.ts — KERIA identity bootstrap for the UVerify sandbox
 *
 * Connects to the local KERIA agent, creates a KERI AID backed by the sandbox
 * witness network, issues an ACDC credential, submits it to the vLEI Verifier,
 * and outputs the environment variables needed to run index.ts with
 * keri_verified: true.
 *
 * Prerequisites:
 *   uv run sandbox.py start --keria   (in uverify-examples/)
 *
 * Usage:
 *   deno run -A keria-setup.ts <cardano-payment-credential-hex>
 *
 * On subsequent runs (AID already created) the script restores state from
 * keria-state.json and only re-generates the signing proof.
 */

import { ready, SignifyClient, Tier, randomPasscode } from 'signify-ts';

// ── Config (override via env vars) ────────────────────────────────────────────
const KERIA_URL = Deno.env.get('KERIA_URL') ?? 'http://localhost:3902';
const KERIA_BOOT_URL = Deno.env.get('KERIA_BOOT_URL') ?? 'http://localhost:3903';
const VLEI_VERIFIER_URL = Deno.env.get('VLEI_VERIFIER_URL') ?? 'http://localhost:7676';
const VLEI_SERVER_URL = Deno.env.get('VLEI_SERVER_URL') ?? 'http://localhost:7723';

// Witness AIDs from the sandbox witness-demo container (ports 5642-5644 on localhost)
const WITNESS_AIDS = [
  'BBilc4-L3tFUnfM_wJr4S4OJanAv_VmF_dJNN6vkf2Ha',
  'BLskRTInXnMxWaGqcpSyMgo0nYbalW99cGZESrz3zapM',
  'BIKKuvBwpmDVA4Ds-EpL5bt9OqPzWPja2LigFYZN2YfX',
];

// ECR schema served by the local vLEI-Server (gleif/vlei:0.2.0)
const ECR_SCHEMA_SAID = 'EBNaNu-M9P5cgrnfl2Fvymy4E_jvxxyjb70PRtiANlJy';

const STATE_FILE = new URL('./keria-state.json', import.meta.url);
const AID_NAME = 'identity-aid';

// ── Types ─────────────────────────────────────────────────────────────────────
interface KeriaState {
  passcode: string;
  aidPrefix: string;
  registryId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function loadState(): Promise<KeriaState | null> {
  try {
    return JSON.parse(await Deno.readTextFile(STATE_FILE)) as KeriaState;
  } catch {
    return null;
  }
}

async function saveState(state: KeriaState): Promise<void> {
  await Deno.writeTextFile(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

async function waitOp(client: SignifyClient, op: { name: string; done: boolean }): Promise<{ done: boolean; response: Record<string, unknown> }> {
  let current = op as { name: string; done: boolean; response: Record<string, unknown> };
  while (!current.done) {
    await new Promise((r) => setTimeout(r, 500));
    current = await client.operations().get(op.name);
  }
  return current;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const paymentCredential = Deno.args[0];
if (!paymentCredential) {
  console.error('Usage: deno run -A keria-setup.ts <cardano-payment-credential-hex>');
  Deno.exit(1);
}

console.log('Initializing signify-ts (loading WASM)...');
await ready();

// ── Step 1: Connect to KERIA ──────────────────────────────────────────────────
const saved = await loadState();
const passcode = saved?.passcode ?? randomPasscode();
const isNew = saved === null || !saved.aidPrefix;

const client = new SignifyClient(KERIA_URL, passcode, Tier.low, KERIA_BOOT_URL);

if (isNew) {
  console.log('Booting KERIA agent...');
  await client.boot();
}
await client.connect();
console.log('Connected to KERIA.\n');

// ── Step 2: Create or restore AID ────────────────────────────────────────────
let aidPrefix: string;

if (isNew) {
  console.log(`Creating AID "${AID_NAME}" with ${WITNESS_AIDS.length} witnesses (toad: 2)...`);
  const icpRes = await client.identifiers().create(AID_NAME, {
    toad: 2,
    wits: WITNESS_AIDS,
  });
  const icpOp = await icpRes.op();
  const icpDone = await waitOp(client, icpOp);
  aidPrefix = (icpDone.response as Record<string, string>).i;
  console.log(`AID created: ${aidPrefix}`);

  // Add agent end-role so the OOBI resolves via the KERIA agent
  const erRes = await client.identifiers().addEndRole(AID_NAME, 'agent', client.agent!.pre);
  const erOp = await erRes.op();
  await waitOp(client, erOp);
  console.log('Agent end-role registered.\n');
} else {
  aidPrefix = saved!.aidPrefix;
  console.log(`Restored AID: ${aidPrefix}\n`);
}

// ── Step 3: Get OOBI ─────────────────────────────────────────────────────────
const oobiRes = await client.oobis().get(AID_NAME, 'agent');
const oobi: string = oobiRes.oobis[0];
console.log(`OOBI: ${oobi}\n`);

// ── Step 4: Create credential registry ───────────────────────────────────────
let registryId: string;

if (isNew || !saved?.registryId) {
  console.log('Creating credential registry...');
  const regRes = await client.registries().create({ name: AID_NAME, registryName: 'identity-registry' });
  const regOp = await regRes.op();
  const regDone = await waitOp(client, regOp);
  registryId = (regDone.response as Record<string, string>).regk;
  console.log(`Registry: ${registryId}\n`);
} else {
  registryId = saved!.registryId;
  // Verify it still exists
  const regs = await client.registries().list(AID_NAME);
  const match = regs.find((r: Record<string, string>) => r.regk === registryId);
  if (!match) {
    const regsArr = regs as Array<Record<string, string>>;
    registryId = regsArr.length > 0 ? regsArr[0].regk : registryId;
  }
  console.log(`Using registry: ${registryId}\n`);
}

await saveState({ passcode, aidPrefix, registryId });

// ── Step 5: Issue ACDC and register with vLEI Verifier ───────────────────────
console.log('Resolving ECR schema from vLEI Server...');
try {
  await client.oobis().resolve(`${VLEI_SERVER_URL}/oobi/${ECR_SCHEMA_SAID}`);
  console.log('Schema resolved.\n');
} catch (e) {
  console.warn(`Warning: could not resolve schema OOBI: ${e}`);
  console.warn('Proceeding — schema may already be cached.\n');
}

console.log('Issuing ACDC credential...');
let credentialSaid = '';
try {
  const credRes = await client.credentials().issue({
    issuerName: AID_NAME,
    registryId,
    schemaId: ECR_SCHEMA_SAID,
    recipient: aidPrefix,
    data: {
      engagementContextRole: 'UVerify Identity',
      personLegalName: 'Sandbox Identity',
    },
    rules: undefined,
    source: undefined,
  });
  const credOp = await credRes.op();
  const credDone = await waitOp(client, credOp);
  const creder = (credDone.response as Record<string, Record<string, string>>).creder;
  credentialSaid = creder.d;
  console.log(`Credential SAID: ${credentialSaid}`);

  console.log('Submitting to vLEI Verifier...');
  const cesr = await client.credentials().get(credentialSaid, true);
  const putRes = await fetch(`${VLEI_VERIFIER_URL}/presentations/${credentialSaid}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json+cesr' },
    body: cesr as string,
  });
  if (putRes.ok) {
    console.log('Credential accepted by vLEI Verifier. keri_verified will be true.\n');
  } else {
    const body = await putRes.text().catch(() => putRes.statusText);
    console.warn(`Warning: vLEI Verifier returned ${putRes.status}: ${body}`);
    console.warn('keri_verified will be false until the credential is accepted.\n');
  }
} catch (e) {
  console.warn(`Warning: credential issuance or submission failed:\n  ${e}`);
  console.warn('keri_verified will be false. See README for the full vLEI credential chain.\n');
}

// ── Step 6: Sign "cardano:<paymentCredential>" ────────────────────────────────
console.log('Signing Cardano credential binding...');
let keriProof = '';
try {
  const payload = new TextEncoder().encode(`cardano:${paymentCredential}`);
  const hab = await client.identifiers().get(AID_NAME);
  // Access the key manager to sign the raw payload with the AID's signing key
  // deno-lint-ignore no-explicit-any
  const keeper = (client as any).manager.get(hab);
  const sig = keeper.signers[0].sign(payload, false);
  keriProof = sig.qb64;
  console.log('Signed.\n');
} catch (e) {
  console.warn(`Warning: signing failed: ${e}`);
  console.warn('Run index.ts without KERI_PROOF — keri_verified will be false.\n');
}

// ── Output ────────────────────────────────────────────────────────────────────
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Run index.ts with these environment variables:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const envVars: Record<string, string> = {
  KERI_AID: aidPrefix,
  KERI_SCHEMA: ECR_SCHEMA_SAID,
  KERI_OOBI: oobi,
};
if (keriProof) envVars.KERI_PROOF = keriProof;

for (const [k, v] of Object.entries(envVars)) {
  console.log(`${k}=${v}`);
}

console.log('\nOne-liner:');
const pairs = Object.entries(envVars).map(([k, v]) => `  ${k}=${v} \\`).join('\n');
console.log(pairs);
console.log('  deno run -A index.ts\n');
console.log('State saved to keria-state.json (re-run this script to refresh the proof).');
