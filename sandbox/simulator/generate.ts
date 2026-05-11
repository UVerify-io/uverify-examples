/**
 * generate.ts — Generic metadata file generator for UVerify sandbox load testing.
 *
 * Usage:
 *   deno run --allow-read --allow-write generate.ts \
 *     --data plan.example.json \
 *     --amount 1000 \
 *     --destination ./output
 *
 * Each output file is named by the SHA-256 of its JSON content.
 * Files produced here are consumed by submit.ts --input ./output.
 *
 * Plan field types:
 *   static        — always the same value (string, number, or boolean)
 *   random-bool   — true or false with equal probability
 *   random-number — integer in [min, max] inclusive
 *   random-string — string matching a simple regex template (char classes, quantifiers)
 *   one-of        — sample uniformly from a values array
 *
 * Supported regex syntax in random-string:
 *   [A-Z]  [0-9]  [abc]  — character class with ranges or literals
 *   .                    — any alphanumeric character
 *   {n}    {n,m}         — exact or range repetition
 *   +                    — one or more (up to 10)
 *   *                    — zero or more (up to 9)
 *   literal chars        — emitted as-is (e.g. the - in "[A-Z]{2}-[0-9]{4}")
 */

// ── CLI arg parsing ──────────────────────────────────────────────────────────

function getArg(flag: string): string | undefined {
  const idx = Deno.args.indexOf(`--${flag}`);
  return idx !== -1 ? Deno.args[idx + 1] : undefined;
}

function getNumArg(flag: string): number | undefined {
  const v = getArg(flag);
  return v !== undefined ? Number(v) : undefined;
}

const planPath   = getArg('data');
const amount     = getNumArg('amount');
const destArg    = getArg('destination');

if (!planPath || !amount || !destArg) {
  console.error('Usage: generate.ts --data <plan.json> --amount <N> --destination <dir>');
  Deno.exit(1);
}

// ── Field type definitions ───────────────────────────────────────────────────

type FieldDef =
  | { type: 'static';        value: string | number | boolean }
  | { type: 'random-bool' }
  | { type: 'random-number'; range: { min: number; max: number } }
  | { type: 'random-string'; regex: string }
  | { type: 'one-of';        values: (string | number | boolean)[] };

type Plan = Record<string, FieldDef>;

// ── Regex-template string generator ─────────────────────────────────────────

function parseCharClass(src: string): string[] {
  const chars: string[] = [];
  let i = 0;
  while (i < src.length) {
    if (i + 2 < src.length && src[i + 1] === '-') {
      const lo = src.charCodeAt(i);
      const hi = src.charCodeAt(i + 2);
      for (let c = lo; c <= hi; c++) chars.push(String.fromCharCode(c));
      i += 3;
    } else {
      chars.push(src[i++]);
    }
  }
  return chars;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('');

function generateFromPattern(pattern: string): string {
  let out = '';
  let i = 0;

  while (i < pattern.length) {
    let pool: string[];

    if (pattern[i] === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end === -1) throw new Error(`Unclosed [ in pattern: ${pattern}`);
      pool = parseCharClass(pattern.slice(i + 1, end));
      i = end + 1;
    } else if (pattern[i] === '.') {
      pool = ALNUM;
      i++;
    } else {
      // Literal character — still check for a following quantifier
      pool = [pattern[i++]];
    }

    // Optional quantifier immediately following the token
    let count = 1;
    if (i < pattern.length && pattern[i] === '{') {
      const end = pattern.indexOf('}', i + 1);
      if (end === -1) throw new Error(`Unclosed { in pattern: ${pattern}`);
      const spec = pattern.slice(i + 1, end);
      if (spec.includes(',')) {
        const parts = spec.split(',');
        const lo = parseInt(parts[0].trim(), 10);
        const hi = parseInt(parts[1].trim(), 10);
        count = lo + Math.floor(Math.random() * (hi - lo + 1));
      } else {
        count = parseInt(spec.trim(), 10);
      }
      i = end + 1;
    } else if (i < pattern.length && pattern[i] === '+') {
      count = 1 + Math.floor(Math.random() * 9);
      i++;
    } else if (i < pattern.length && pattern[i] === '*') {
      count = Math.floor(Math.random() * 10);
      i++;
    }

    for (let k = 0; k < count; k++) out += pick(pool);
  }

  return out;
}

// ── Field evaluation ─────────────────────────────────────────────────────────

function evaluateField(def: FieldDef): string | number | boolean {
  switch (def.type) {
    case 'static':
      return def.value;
    case 'random-bool':
      return Math.random() < 0.5;
    case 'random-number': {
      const { min, max } = def.range;
      return min + Math.floor(Math.random() * (max - min + 1));
    }
    case 'random-string':
      return generateFromPattern(def.regex);
    case 'one-of':
      return pick(def.values);
    default:
      throw new Error(`Unknown field type: ${(def as FieldDef & { type: string }).type}`);
  }
}

// ── SHA-256 ──────────────────────────────────────────────────────────────────

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Main ─────────────────────────────────────────────────────────────────────

const plan: Plan = JSON.parse(await Deno.readTextFile(planPath));
try { await Deno.remove(destArg, { recursive: true }); } catch { /* didn't exist */ }
await Deno.mkdir(destArg, { recursive: true });

let written = 0;
for (let n = 0; n < amount; n++) {
  const record: Record<string, string | number | boolean> = {};
  for (const [key, def] of Object.entries(plan)) {
    record[key] = evaluateField(def);
  }
  const content = JSON.stringify(record);
  const hash = await sha256hex(content);
  await Deno.writeTextFile(`${destArg}/${hash}.json`, content);
  written++;
  if (written % 100 === 0 || written === amount) {
    console.log(`  ${written} / ${amount} files written …`);
  }
}

console.log(`Done. ${written} metadata file(s) → ${destArg}/`);
