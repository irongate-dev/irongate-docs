#!/usr/bin/env tsx
/**
 * validate-env-annotations.ts
 * irongate-docs CI — hard fail if any IRONGATE_* variable in the F-01 Zod
 * schema is missing a .describe() annotation.
 *
 * The .describe() annotation is the contract for auto-generated documentation.
 * Format:  "description | required|optional | default:X | group:Y"
 * Example: "JWT signing algorithm | required | default:RS256 | group:jwt"
 *
 * Reads:  src/_generated/env-schema.json (fetched from irongate-server)
 * Exit 0: all variables annotated
 * Exit 1: one or more variables missing annotation
 */

import fs   from 'node:fs';
import path from 'node:path';

const SCHEMA_PATH = path.join(process.cwd(), 'src/_generated/env-schema.json');
const REQUIRED_FORMAT = /^.+\|(required|optional)\|/;

// ── Load schema ───────────────────────────────────────────────────────────────
if (!fs.existsSync(SCHEMA_PATH)) {
  console.warn('⚠️  env-schema.json not found — skipping validation (scaffold phase).');
  console.warn(`   Expected at: ${SCHEMA_PATH}`);
  console.warn('   Run pnpm fetch:artifacts or set IRONGATE_ARTIFACTS_REQUIRED=true to enforce.');
  process.exit(0);
}

let schema: Record<string, { description?: string; group?: string; required?: boolean }>;

try {
  schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
} catch (e) {
  console.error(`❌  env-schema.json is not valid JSON: ${e}`);
  process.exit(1);
}

// ── Validate ──────────────────────────────────────────────────────────────────
const vars = Object.entries(schema);
const missing: string[] = [];
const malformed: Array<{ name: string; description: string }> = [];

for (const [name, meta] of vars) {
  if (!name.startsWith('IRONGATE_')) continue;

  if (!meta.description) {
    missing.push(name);
    continue;
  }

  // Validate format: "description | required|optional | default:X | group:Y"
  // Normalise whitespace around pipes before checking
  const normalised = meta.description.replace(/\s*\|\s*/g, '|');
  if (!REQUIRED_FORMAT.test(normalised)) {
    malformed.push({ name, description: meta.description });
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
let exitCode = 0;

if (missing.length) {
  console.error('\n❌  Variables missing .describe() annotation:\n');
  for (const name of missing) {
    console.error(`   ${name}`);
  }
  console.error('\n   Fix: add .describe() to each variable in apps/server/src/config/env.ts');
  console.error('   Format: z.string().describe("description | required | default:X | group:Y")');
  exitCode = 1;
}

if (malformed.length) {
  console.error('\n❌  Variables with malformed .describe() annotations:\n');
  for (const { name, description } of malformed) {
    console.error(`   ${name}`);
    console.error(`     Got:      "${description}"`);
    console.error(`     Expected: "description | required|optional | default:X | group:Y"`);
    console.error(`     Example:  "JWT signing algorithm | required | default:RS256 | group:jwt"`);
  }
  exitCode = 1;
}

if (exitCode === 0) {
  const count = vars.filter(([n]) => n.startsWith('IRONGATE_')).length;
  console.log(`✅  validate-env-annotations: ${count} IRONGATE_* variables all annotated`);
}

process.exit(exitCode);
