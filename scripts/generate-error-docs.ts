#!/usr/bin/env tsx
/**
 * generate-error-docs.ts
 * irongate-docs CI — generates one MDX page per error code from the F-04
 * error registry JSON.
 *
 * Source:  src/_generated/error-registry.json
 * Output:  src/content/docs/errors/{CODE}.mdx
 *          src/content/docs/errors/index.mdx  (error code directory)
 *
 * Each MDX page contains:
 *   - Error code and URN
 *   - HTTP status code
 *   - Title and description
 *   - Likely causes (list)
 *   - Resolution steps (list)
 *   - SDK usage example (TypeScript)
 *
 * Exit 0: generation succeeded
 * Exit 1: source file missing (and IRONGATE_ARTIFACTS_REQUIRED=true) or parse error
 */

import fs   from 'node:fs';
import path from 'node:path';

const REGISTRY_PATH = path.join(process.cwd(), 'src/_generated/error-registry.json');
const OUTPUT_DIR    = path.join(process.cwd(), 'src/content/docs/errors');
const REQUIRED      = process.env.IRONGATE_ARTIFACTS_REQUIRED === 'true';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ErrorEntry {
  code:        string;
  httpStatus:  number;
  title:       string;
  description: string;
  causes?:     string[];
  resolution?: string[];
  group?:      string;  // e.g. "auth", "mfa", "webhook", "org"
}

// ── Load registry ─────────────────────────────────────────────────────────────
if (!fs.existsSync(REGISTRY_PATH)) {
  if (REQUIRED) {
    console.error(`❌  error-registry.json not found at ${REGISTRY_PATH}`);
    process.exit(1);
  }
  console.warn('⚠️  error-registry.json not found — skipping (scaffold phase).');
  process.exit(0);
}

let registry: ErrorEntry[];

try {
  const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  // Support both array and { errors: [] } shapes
  registry = Array.isArray(raw) ? raw : raw.errors ?? Object.values(raw);
} catch (e) {
  console.error(`❌  error-registry.json parse error: ${e}`);
  process.exit(1);
}

if (!registry.length) {
  console.warn('⚠️  error-registry.json is empty — no error pages generated.');
  process.exit(0);
}

// ── Prepare output directory ──────────────────────────────────────────────────
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeYaml(s: string): string {
  // Escape for YAML frontmatter — wrap in quotes if contains special chars
  if (/[:#\[\]{}|>&!,]/.test(s) || s.includes('"')) {
    return `'${s.replace(/'/g, "''")}'`;
  }
  return s;
}

function httpStatusText(status: number): string {
  const map: Record<number, string> = {
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
    404: 'Not Found', 409: 'Conflict', 410: 'Gone',
    422: 'Unprocessable Entity', 429: 'Too Many Requests',
    500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable',
  };
  return map[status] ?? String(status);
}

function generateErrorPage(entry: ErrorEntry): string {
  const urn = `urn:irongate:error:${entry.code}`;
  const causesList = (entry.causes ?? ['No additional detail available.'])
    .map(c => `- ${c}`)
    .join('\n');
  const resolutionList = (entry.resolution ?? ['Check the error context for more detail.'])
    .map(r => `- ${r}`)
    .join('\n');

  return `---
title: ${escapeYaml(entry.code)}
description: ${escapeYaml(entry.description)}
sidebar:
  label: ${entry.code}
  badge:
    text: ${entry.httpStatus}
    variant: ${entry.httpStatus >= 500 ? 'danger' : entry.httpStatus >= 400 ? 'caution' : 'note'}
---

import { Badge } from '@astrojs/starlight/components';

# \`${entry.code}\`

<Badge text="${entry.httpStatus} ${httpStatusText(entry.httpStatus)}" variant="${entry.httpStatus >= 500 ? 'danger' : 'caution'}" />

**${entry.title}**

${entry.description}

## Error Details

| Field | Value |
|-------|-------|
| Error Code | \`${entry.code}\` |
| URN | \`${urn}\` |
| HTTP Status | \`${entry.httpStatus}\` |
${entry.group ? `| Category | \`${entry.group}\` |` : ''}

## Likely Causes

${causesList}

## Resolution

${resolutionList}

## SDK Usage

\`\`\`typescript
import { IrongateError } from '@irongate/core';

try {
  // ... your irongate operation
} catch (err) {
  if (err instanceof IrongateError && err.code === '${entry.code}') {
    // Handle ${entry.code}
    console.error(err.title);   // "${entry.title}"
    console.error(err.status);  // ${entry.httpStatus}
    console.error(err.type);    // "${urn}"
  }
}
\`\`\`

## Response Shape

When this error is returned from the Irongate server, the JSON response body is:

\`\`\`json
{
  "error": {
    "code": "${entry.code}",
    "type": "${urn}",
    "title": "${entry.title}",
    "status": ${entry.httpStatus},
    "detail": "...",
    "documentation_url": "https://irongate.dev/errors/${entry.code}"
  }
}
\`\`\`
`;
}

// ── Generate individual error pages ───────────────────────────────────────────
let generated = 0;

for (const entry of registry) {
  const outPath = path.join(OUTPUT_DIR, `${entry.code}.mdx`);
  fs.writeFileSync(outPath, generateErrorPage(entry), 'utf8');
  generated++;
}

// ── Generate index page ───────────────────────────────────────────────────────
// Group by HTTP status category and by group field
const byGroup: Record<string, ErrorEntry[]> = {};

for (const entry of registry) {
  const group = entry.group ?? 'general';
  if (!byGroup[group]) byGroup[group] = [];
  byGroup[group].push(entry);
}

let indexContent = `---
title: Error Reference
description: Complete reference for all Irongate error codes, HTTP statuses, causes, and resolutions.
sidebar:
  order: 0
---

# Error Reference

All Irongate errors follow a consistent envelope format. The \`type\` field is always
a URN in the format \`urn:irongate:error:CODE\`.

\`\`\`json
{
  "error": {
    "code": "ERROR_CODE",
    "type": "urn:irongate:error:ERROR_CODE",
    "title": "Human-readable title",
    "status": 400,
    "detail": "Context-specific detail",
    "documentation_url": "https://irongate.dev/errors/ERROR_CODE"
  }
}
\`\`\`

`;

for (const [group, entries] of Object.entries(byGroup).sort()) {
  const groupTitle = group.charAt(0).toUpperCase() + group.slice(1).replace(/-/g, ' ');
  indexContent += `## ${groupTitle}\n\n`;
  indexContent += `| Code | Status | Description |\n`;
  indexContent += `|------|--------|-------------|\n`;
  for (const entry of entries.sort((a, b) => a.code.localeCompare(b.code))) {
    indexContent += `| [\`${entry.code}\`](/errors/${entry.code}) | ${entry.httpStatus} | ${entry.description} |\n`;
  }
  indexContent += '\n';
}

fs.writeFileSync(path.join(OUTPUT_DIR, 'index.mdx'), indexContent, 'utf8');

console.log(`✅  generate-error-docs: ${generated} error pages + index written to ${OUTPUT_DIR}`);
