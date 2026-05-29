import { mainnet, preprod } from '@evolution-sdk/evolution/sdk/client/Chain';

// ── Network config ────────────────────────────────────────────────────────────

/**
 * Build the network-specific configuration from the `UVERIFY_NETWORK` env var.
 * Defaults to `sandbox` (local stack on http://localhost:*).
 * Both `verifyUrl` and `chainViewerUrl` are always present so the same config
 * object works for all examples.
 */
export function getNetworkConfig() {
  const network = Deno.env.get('UVERIFY_NETWORK') ?? 'sandbox';
  if (network === 'mainnet') return {
    network,
    evolutionChain: mainnet,
    networkId: 1 as const,
    backendUrl: 'https://api.uverify.io',
    cexplorerTxUrl: 'https://cexplorer.io/tx',
    verifyUrl: 'https://app.uverify.io/verify',
    chainViewerUrl: 'https://cexplorer.io',
  };
  if (network === 'preprod') return {
    network,
    evolutionChain: preprod,
    networkId: 0 as const,
    backendUrl: 'https://api.preprod.uverify.io',
    cexplorerTxUrl: 'https://preprod.cexplorer.io/tx',
    verifyUrl: 'https://app.preprod.uverify.io/verify',
    chainViewerUrl: 'https://preprod.cexplorer.io',
  };
  return {
    network,
    evolutionChain: preprod,
    networkId: 0 as const,
    backendUrl: 'http://localhost:9090',
    cexplorerTxUrl: 'http://localhost:3001',
    verifyUrl: 'http://localhost:3000/verify',
    chainViewerUrl: 'http://localhost:3001',
  };
}

// ── Plan evaluation (same field-def format as sandbox/simulator/generate.ts) ─

export type FieldDef =
  | { type: 'static';        value: string | number | boolean }
  | { type: 'random-bool' }
  | { type: 'random-number'; range: { min: number; max: number } }
  | { type: 'random-string'; regex: string }
  | { type: 'one-of';        values: (string | number | boolean)[] };

export type Plan = Record<string, FieldDef>;

function parseCharClass(src: string): string[] {
  const chars: string[] = [];
  let i = 0;
  while (i < src.length) {
    if (i + 2 < src.length && src[i + 1] === '-') {
      const lo = src.charCodeAt(i), hi = src.charCodeAt(i + 2);
      for (let c = lo; c <= hi; c++) chars.push(String.fromCharCode(c));
      i += 3;
    } else {
      chars.push(src[i++]);
    }
  }
  return chars;
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('');

function generateFromPattern(pattern: string): string {
  let out = '', i = 0;
  while (i < pattern.length) {
    let pool: string[];
    if (pattern[i] === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end === -1) throw new Error(`Unclosed [ in pattern: ${pattern}`);
      pool = parseCharClass(pattern.slice(i + 1, end));
      i = end + 1;
    } else if (pattern[i] === '.') {
      pool = ALNUM; i++;
    } else {
      pool = [pattern[i++]];
    }
    let count = 1;
    if (i < pattern.length && pattern[i] === '{') {
      const end = pattern.indexOf('}', i + 1);
      if (end === -1) throw new Error(`Unclosed { in pattern: ${pattern}`);
      const spec = pattern.slice(i + 1, end);
      if (spec.includes(',')) {
        const [lo, hi] = spec.split(',').map((s) => parseInt(s.trim(), 10));
        count = lo + Math.floor(Math.random() * (hi - lo + 1));
      } else {
        count = parseInt(spec.trim(), 10);
      }
      i = end + 1;
    } else if (i < pattern.length && pattern[i] === '+') {
      count = 1 + Math.floor(Math.random() * 9); i++;
    } else if (i < pattern.length && pattern[i] === '*') {
      count = Math.floor(Math.random() * 10); i++;
    }
    for (let k = 0; k < count; k++) out += pick(pool);
  }
  return out;
}

function evaluateField(def: FieldDef): string | number | boolean {
  switch (def.type) {
    case 'static':        return def.value;
    case 'random-bool':   return Math.random() < 0.5;
    case 'random-number': return def.range.min + Math.floor(Math.random() * (def.range.max - def.range.min + 1));
    case 'random-string': return generateFromPattern(def.regex);
    case 'one-of':        return pick(def.values);
    default: throw new Error(`Unknown field type: ${(def as FieldDef & { type: string }).type}`);
  }
}

export function evaluatePlan(plan: Plan): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, evaluateField(v)]));
}

// ── CLI argument helper ───────────────────────────────────────────────────────

/**
 * Return the value of `--<flag> <value>` from Deno.args, or undefined.
 *
 * @example getArg('plan')   // reads --plan <value>
 */
export function getArg(flag: string): string | undefined {
  const idx = Deno.args.indexOf(`--${flag}`);
  return idx !== -1 ? Deno.args[idx + 1] : undefined;
}

// ── .env loader ───────────────────────────────────────────────────────────────

/**
 * Load a .env file and set any variables that are not already in the environment.
 * Pass `new URL('../.env', import.meta.url)` from each example subdirectory.
 * Silently does nothing when the file does not exist.
 */
export async function loadEnv(envUrl: string | URL): Promise<void> {
  try {
    const envText = await Deno.readTextFile(envUrl);
    for (const line of envText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!Deno.env.has(key)) Deno.env.set(key, val);
    }
  } catch {
    // .env not found, using defaults
  }
}
