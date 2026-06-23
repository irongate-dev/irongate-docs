#!/usr/bin/env tsx
/**
 * generate-env-docs.ts
 * irongate-docs CI — generates the environment variable reference page from
 * the F-01 Zod schema .describe() annotations.
 *
 * Source:  src/_generated/env-schema.json
 * Output:  src/content/docs/configuration/environment-variables.mdx
 *
 * The .describe() annotation format is the contract (F-00c §5.2):
 *   "description | required|optional | default:X | group:Y"
 *
 * Groups map to subsections in the generated page.
 * Variables without a group go into "General".
 *
 * Exit 0: generation succeeded
 * Exit 1: source missing (if IRONGATE_ARTIFACTS_REQUIRED=true) or parse error
 */

import fs   from 'node:fs';
import path from 'node:path';

const SCHEMA_PATH = path.join(process.cwd(), 'src/_generated/env-schema.json');
const OUTPUT_DIR  = path.join(process.cwd(), 'src/content/docs/configuration');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'environment-variables.mdx');
const REQUIRED    = process.env.IRONGATE_ARTIFACTS_REQUIRED === 'true';

// ── Types ─────────────────────────────────────────────────────────────────────
interface EnvVar {
  name:         string;
  description:  string;
  required:     boolean;
  default?:     string;
  group:        string;
  type?:        string;  // "string" | "number" | "boolean" | "url" | "secret"
  example?:     string;
}

// ── Load schema ───────────────────────────────────────────────────────────────
if (!fs.existsSync(SCHEMA_PATH)) {
  if (REQUIRED) {
    console.error(`❌  env-schema.json not found at ${SCHEMA_PATH}`);
    process.exit(1);
  }
  console.warn('⚠️  env-schema.json not found — skipping (scaffold phase).');
  process.exit(0);
}

let raw: Record<string, {
  description?: string;
  type?: string;
  example?: string;
}>;

try {
  raw = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
} catch (e) {
  console.error(`❌  env-schema.json parse error: ${e}`);
  process.exit(1);
}

// ── Parse each variable's .describe() annotation ─────────────────────────────
function parseDescribe(name: string, meta: { description?: string; type?: string; example?: string }): EnvVar {
  const desc = meta.description ?? '';

  // Split on pipe — format: "description | required|optional | default:X | group:Y"
  const parts = desc.split('|').map(s => s.trim());

  const description = parts[0] ?? name;
  const required    = parts[1]?.toLowerCase() !== 'optional';
  const defaultVal  = parts.find(p => p.startsWith('default:'))?.replace('default:', '').trim();
  const group       = parts.find(p => p.startsWith('group:'))?.replace('group:', '').trim() ?? 'general';

  return {
    name,
    description,
    required,
    default: defaultVal,
    group,
    type:    meta.type,
    example: meta.example,
  };
}

const vars: EnvVar[] = Object.entries(raw)
  .filter(([name]) => name.startsWith('IRONGATE_'))
  .map(([name, meta]) => parseDescribe(name, meta))
  .sort((a, b) => a.name.localeCompare(b.name));

if (!vars.length) {
  console.warn('⚠️  No IRONGATE_* variables found in env-schema.json.');
  process.exit(0);
}

// ── Group variables ───────────────────────────────────────────────────────────
const grouped: Record<string, EnvVar[]> = {};
for (const v of vars) {
  if (!grouped[v.group]) grouped[v.group] = [];
  grouped[v.group].push(v);
}

// Canonical group ordering
const GROUP_ORDER = [
  'general', 'server', 'database', 'redis',
  'jwt', 'session', 'email', 'security',
  'oauth', 'mfa', 'webhook', 'hibp',
  'admin', 'org', 'siem', 'import',
];

function sortGroups(groups: string[]): string[] {
  const ordered = GROUP_ORDER.filter(g => groups.includes(g));
  const remaining = groups.filter(g => !GROUP_ORDER.includes(g)).sort();
  return [...ordered, ...remaining];
}

// ── Generate MDX ──────────────────────────────────────────────────────────────
function groupTitle(group: string): string {
  const titles: Record<string, string> = {
    general:  'General',
    server:   'Server',
    database: 'Database',
    redis:    'Redis',
    jwt:      'JWT & Tokens',
    session:  'Sessions',
    email:    'Email',
    security: 'Security',
    oauth:    'OAuth & Social',
    mfa:      'Multi-Factor Authentication',
    webhook:  'Webhooks',
    hibp:     'HIBP (Breach Detection)',
    admin:    'Admin Dashboard',
    org:      'Organizations',
    siem:     'SIEM Export',
    import:   'Bulk Import',
  };
  return titles[group] ?? group.charAt(0).toUpperCase() + group.slice(1).replace(/-/g, ' ');
}

function varRow(v: EnvVar): string {
  const badge = v.required ? '`required`' : '`optional`';
  const defaultCell = v.default ? `\`${v.default}\`` : '—';
  const desc = v.example
    ? `${v.description}<br/>Example: \`${v.example}\``
    : v.description;
  return `| \`${v.name}\` | ${badge} | ${defaultCell} | ${desc} |`;
}

let mdx = `---
title: Environment Variables
description: Complete reference for all Irongate environment variables, grouped by subsystem.
sidebar:
  order: 0
---

# Environment Variables

All Irongate configuration is done via environment variables. Copy \`.env.example\`
from the \`irongate-server\` repository to get started.

\`\`\`bash
cp .env.example .env
\`\`\`

:::caution[Auto-Generated]
This page is auto-generated from the F-01 Zod schema \`.describe()\` annotations.
Do not edit it directly — changes will be overwritten on the next CI run.
:::

---

`;

for (const group of sortGroups(Object.keys(grouped))) {
  const groupVars = grouped[group];
  const title = groupTitle(group);

  mdx += `## ${title}\n\n`;
  mdx += `| Variable | Required | Default | Description |\n`;
  mdx += `|----------|----------|---------|-------------|\n`;
  for (const v of groupVars) {
    mdx += `${varRow(v)}\n`;
  }
  mdx += '\n';
}

// Required variables quick reference
const requiredVars = vars.filter(v => v.required);
mdx += `## Minimum Required Configuration\n\n`;
mdx += `These variables have no default and must be set before the server will start:\n\n`;
for (const v of requiredVars) {
  mdx += `- \`${v.name}\` — ${v.description}\n`;
}
mdx += '\n';

// ── Write output ──────────────────────────────────────────────────────────────
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_FILE, mdx, 'utf8');

console.log(`✅  generate-env-docs: ${vars.length} variables → ${OUTPUT_FILE}`);
