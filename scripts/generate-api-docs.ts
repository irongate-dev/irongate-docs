#!/usr/bin/env tsx
/**
 * generate-api-docs.ts
 * irongate-docs CI — generates MDX API reference pages from the OpenAPI spec
 * produced by irongate-server's pnpm generate:openapi.
 *
 * Source:  src/_generated/openapi.json
 * Output:  src/content/docs/api-reference/{group}.mdx  (one per route group)
 *          src/content/docs/api-reference/index.mdx    (overview)
 *
 * Route groups are derived from the first path segment after /v1/:
 *   /v1/auth/register    → group: "auth"
 *   /v1/admin/users      → group: "admin"
 *   /v1/webhooks         → group: "webhooks"
 *
 * Exit 0: generation succeeded
 * Exit 1: source missing (if IRONGATE_ARTIFACTS_REQUIRED=true) or invalid spec
 */

import fs   from 'node:fs';
import path from 'node:path';

const OPENAPI_PATH = path.join(process.cwd(), 'src/_generated/openapi.json');
const OUTPUT_DIR   = path.join(process.cwd(), 'src/content/docs/api-reference');
const REQUIRED     = process.env.IRONGATE_ARTIFACTS_REQUIRED === 'true';

// ── Types (minimal OpenAPI 3.x subset) ───────────────────────────────────────
interface OpenAPISpec {
  info:    { title: string; version: string; description?: string };
  paths:   Record<string, PathItem>;
  components?: { schemas?: Record<string, Schema> };
}

interface PathItem {
  get?:    Operation;
  post?:   Operation;
  put?:    Operation;
  patch?:  Operation;
  delete?: Operation;
}

interface Operation {
  operationId?: string;
  summary?:     string;
  description?: string;
  tags?:        string[];
  security?:    unknown[];
  requestBody?: { content: Record<string, { schema?: Schema }> };
  responses:    Record<string, Response>;
  parameters?:  Parameter[];
}

interface Response {
  description: string;
  content?: Record<string, { schema?: Schema }>;
}

interface Parameter {
  name:     string;
  in:       'path' | 'query' | 'header';
  required?: boolean;
  description?: string;
  schema?:  Schema;
}

interface Schema {
  type?:        string;
  $ref?:        string;
  properties?:  Record<string, Schema>;
  required?:    string[];
  description?: string;
  example?:     unknown;
}

// ── Load spec ─────────────────────────────────────────────────────────────────
if (!fs.existsSync(OPENAPI_PATH)) {
  if (REQUIRED) {
    console.error(`❌  openapi.json not found at ${OPENAPI_PATH}`);
    process.exit(1);
  }
  console.warn('⚠️  openapi.json not found — skipping (scaffold phase).');
  process.exit(0);
}

let spec: OpenAPISpec;

try {
  spec = JSON.parse(fs.readFileSync(OPENAPI_PATH, 'utf8'));
} catch (e) {
  console.error(`❌  openapi.json parse error: ${e}`);
  process.exit(1);
}

if (!spec.paths || !Object.keys(spec.paths).length) {
  console.warn('⚠️  openapi.json has no paths — no API reference pages generated.');
  process.exit(0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function getRouteGroup(routePath: string): string {
  // /v1/auth/register → "auth"
  // /v1/admin/users/:id → "admin"
  // /v1/webhooks → "webhooks"
  const segments = routePath.replace(/^\/v[0-9]+\//, '').split('/');
  return segments[0] ?? 'general';
}

function groupTitle(group: string): string {
  const titles: Record<string, string> = {
    auth:      'Authentication',
    admin:     'Admin API',
    webhooks:  'Webhooks',
    orgs:      'Organizations',
    users:     'Users',
    sessions:  'Sessions',
    mfa:       'Multi-Factor Authentication',
    oauth:     'OAuth & Social',
    well_known: 'Well-Known Endpoints',
  };
  return titles[group] ?? group.charAt(0).toUpperCase() + group.slice(1).replace(/[-_]/g, ' ');
}

function methodBadge(method: string): string {
  const colors: Record<string, string> = {
    get: 'note', post: 'success', put: 'tip',
    patch: 'tip', delete: 'danger',
  };
  return `<span class="method-badge method-${method}">${method.toUpperCase()}</span>`;
}

function schemaToTable(schema: Schema | undefined, indent = 0): string {
  if (!schema || (!schema.properties && !schema.$ref)) return '';
  if (schema.$ref) return `*See schema: \`${schema.$ref.split('/').pop()}\`*\n`;

  const rows: string[] = [];
  const required = new Set(schema.required ?? []);

  rows.push('| Field | Type | Required | Description |');
  rows.push('|-------|------|----------|-------------|');

  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    const type = prop.$ref
      ? `\`${prop.$ref.split('/').pop()}\``
      : `\`${prop.type ?? 'any'}\``;
    const req  = required.has(name) ? '✓' : '—';
    const desc = prop.description ?? '';
    rows.push(`| \`${name}\` | ${type} | ${req} | ${desc} |`);
  }

  return rows.join('\n');
}

function formatExample(example: unknown): string {
  if (!example) return '';
  try {
    return '```json\n' + JSON.stringify(example, null, 2) + '\n```\n';
  } catch {
    return String(example);
  }
}

function renderOperation(routePath: string, method: string, op: Operation): string {
  const requiresAuth = op.security !== undefined && op.security.length > 0;
  const authNote = requiresAuth ? '\n:::note[Authentication Required]\nThis endpoint requires a valid access token.\n:::\n' : '';

  let md = `### ${methodBadge(method)} \`${routePath}\`\n\n`;

  if (op.summary)     md += `**${op.summary}**\n\n`;
  if (op.description) md += `${op.description}\n\n`;
  md += authNote;

  // Path/query parameters
  const params = op.parameters ?? [];
  if (params.length) {
    md += `#### Parameters\n\n`;
    md += `| Name | In | Required | Description |\n`;
    md += `|------|----|----------|-------------|\n`;
    for (const p of params) {
      md += `| \`${p.name}\` | ${p.in} | ${p.required ? '✓' : '—'} | ${p.description ?? ''} |\n`;
    }
    md += '\n';
  }

  // Request body
  if (op.requestBody) {
    const jsonBody = op.requestBody.content['application/json'];
    if (jsonBody?.schema) {
      md += `#### Request Body\n\n`;
      md += `\`Content-Type: application/json\`\n\n`;
      md += schemaToTable(jsonBody.schema) + '\n\n';

      if (jsonBody.schema.example) {
        md += `**Example:**\n\n`;
        md += formatExample(jsonBody.schema.example);
      }
    }
  }

  // Responses
  md += `#### Responses\n\n`;
  md += `| Status | Description |\n`;
  md += `|--------|-------------|\n`;
  for (const [status, resp] of Object.entries(op.responses)) {
    md += `| \`${status}\` | ${resp.description} |\n`;
  }
  md += '\n';

  // Success response schema (200 or 201)
  const successResp = op.responses['200'] ?? op.responses['201'];
  const successSchema = successResp?.content?.['application/json']?.schema;
  if (successSchema) {
    const ex = successSchema.example;
    if (ex) {
      md += `**Success Response:**\n\n`;
      md += formatExample(ex);
    }
  }

  return md;
}

// ── Group routes ──────────────────────────────────────────────────────────────
const groups: Record<string, Array<{
  routePath: string;
  method:    string;
  operation: Operation;
}>> = {};

for (const [routePath, pathItem] of Object.entries(spec.paths)) {
  const group = getRouteGroup(routePath);
  if (!groups[group]) groups[group] = [];

  for (const method of HTTP_METHODS) {
    const op = pathItem[method];
    if (op) groups[group].push({ routePath, method, operation: op });
  }
}

// ── Prepare output directory ──────────────────────────────────────────────────
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Generate per-group pages ──────────────────────────────────────────────────
const generatedGroups: string[] = [];

for (const [group, routes] of Object.entries(groups)) {
  const title = groupTitle(group);

  let mdx = `---
title: ${title}
description: API reference for Irongate ${title} endpoints.
sidebar:
  label: ${title}
---

import { Badge } from '@astrojs/starlight/components';

<style>{\`
  .method-badge { padding: 2px 8px; border-radius: 4px; font-weight: bold; font-family: monospace; font-size: 0.8em; }
  .method-get    { background: #dbeafe; color: #1e40af; }
  .method-post   { background: #dcfce7; color: #166534; }
  .method-put    { background: #fef9c3; color: #854d0e; }
  .method-patch  { background: #fef9c3; color: #854d0e; }
  .method-delete { background: #fee2e2; color: #991b1b; }
\`}</style>

:::caution[Auto-Generated]
This page is auto-generated from the OpenAPI spec. Do not edit directly.
:::

# ${title}

**Base URL:** \`https://your-irongate-instance.com\`

`;

  for (const { routePath, method, operation } of routes) {
    mdx += renderOperation(routePath, method, operation) + '\n---\n\n';
  }

  const outPath = path.join(OUTPUT_DIR, `${group}.mdx`);
  fs.writeFileSync(outPath, mdx, 'utf8');
  generatedGroups.push(group);
}

// ── Generate index page ───────────────────────────────────────────────────────
const totalRoutes = Object.values(groups).reduce((sum, r) => sum + r.length, 0);

let indexMdx = `---
title: API Reference
description: Complete REST API reference for Irongate. All endpoints, request/response schemas, and authentication requirements.
sidebar:
  order: 0
---

# API Reference

Irongate exposes a REST API on port 3000 (auth server). All endpoints are prefixed with \`/v1\`.

:::caution[Auto-Generated]
This section is auto-generated from the OpenAPI spec. Do not edit directly.
:::

## Base URL

\`\`\`
https://your-irongate-instance.com/v1
\`\`\`

## Authentication

Most endpoints require a valid access token passed via httpOnly cookie (\`irongate_at\`).
The cookie is set automatically by the Irongate SDK after a successful login.

## Endpoint Groups

| Group | Description | Endpoints |
|-------|-------------|-----------|
`;

for (const group of Object.keys(groups).sort()) {
  const count = groups[group].length;
  const title = groupTitle(group);
  indexMdx += `| [${title}](/api-reference/${group}) | ${title} API | ${count} |\n`;
}

indexMdx += `\n**Total:** ${totalRoutes} endpoints across ${generatedGroups.length} groups\n`;

fs.writeFileSync(path.join(OUTPUT_DIR, 'index.mdx'), indexMdx, 'utf8');

console.log(`✅  generate-api-docs: ${totalRoutes} endpoints across ${generatedGroups.length} groups → ${OUTPUT_DIR}`);
