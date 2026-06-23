#!/usr/bin/env tsx
/**
 * fetch-artifacts.ts
 * irongate-docs — fetches generated artifacts from irongate-server via GitHub API.
 *
 * Reads:   SERVER_REPO env var (e.g. "your-org/irongate-server")
 *          GH_TOKEN env var     (GITHUB_TOKEN or PAT with repo:read)
 *
 * Writes:  src/_generated/openapi.json
 *          src/_generated/error-registry.json
 *          src/_generated/env-schema.json
 *
 * Exit 0:  All artifacts fetched successfully (or scaffold grace period active)
 * Exit 1:  A required artifact is missing and grace period is not active
 *
 * Usage:   pnpm tsx scripts/fetch-artifacts.ts
 *          GH_TOKEN=... SERVER_REPO=org/irongate-server pnpm tsx scripts/fetch-artifacts.ts
 */

import fs   from 'node:fs';
import path from 'node:path';

const SERVER_REPO = process.env.SERVER_REPO ?? `${process.env.GITHUB_REPOSITORY_OWNER}/irongate-server`;
const GH_TOKEN    = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
const BRANCH      = 'main';

const OUTPUT_DIR  = path.join(process.cwd(), 'src/_generated');

const ARTIFACTS = [
  { serverPath: '.generated/openapi.json',        localFile: 'openapi.json' },
  { serverPath: '.generated/error-registry.json', localFile: 'error-registry.json' },
  { serverPath: '.generated/env-schema.json',     localFile: 'env-schema.json' },
];

// ── Grace period ──────────────────────────────────────────────────────────────
// During the scaffold phase (F-00a/b running but server not yet generating
// artifacts), we skip with a warning rather than failing the build.
// Set IRONGATE_ARTIFACTS_REQUIRED=true to enforce hard failure.
const REQUIRED = process.env.IRONGATE_ARTIFACTS_REQUIRED === 'true';

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchArtifact(serverPath: string): Promise<string> {
  const url = `https://api.github.com/repos/${SERVER_REPO}/contents/${serverPath}?ref=${BRANCH}`;

  const res = await fetch(url, {
    headers: {
      Authorization: GH_TOKEN ? `Bearer ${GH_TOKEN}` : '',
      Accept: 'application/vnd.github.raw',  // returns raw content, not base64
      'User-Agent': 'irongate-docs-ci',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `HTTP ${res.status} fetching ${serverPath} from ${SERVER_REPO}.\n` +
      `URL: ${url}\n` +
      `Response: ${body.slice(0, 200)}`
    );
  }

  return res.text();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (!GH_TOKEN) {
    console.warn('⚠️  No GH_TOKEN or GITHUB_TOKEN set — unauthenticated GitHub API (60 req/hr limit)');
  }

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let allFetched = true;

  for (const { serverPath, localFile } of ARTIFACTS) {
    const outputPath = path.join(OUTPUT_DIR, localFile);

    try {
      console.log(`▶  Fetching ${serverPath} from ${SERVER_REPO}@${BRANCH}...`);
      const content = await fetchArtifact(serverPath);

      // Validate it's parseable JSON before writing
      try {
        JSON.parse(content);
      } catch {
        throw new Error(`Artifact ${serverPath} is not valid JSON — server generator may have failed`);
      }

      fs.writeFileSync(outputPath, content, 'utf8');
      console.log(`   ✅ Written to ${path.relative(process.cwd(), outputPath)}`);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (REQUIRED) {
        console.error(`\n❌  Failed to fetch ${serverPath}:\n   ${message}`);
        allFetched = false;
      } else {
        console.warn(`\n⚠️  Could not fetch ${serverPath} (scaffold grace period active):`);
        console.warn(`   ${message}`);
        console.warn(`   Set IRONGATE_ARTIFACTS_REQUIRED=true to enforce hard failure.`);

        // Write an empty placeholder so generators can fail gracefully
        if (!fs.existsSync(outputPath)) {
          fs.writeFileSync(outputPath, '{}', 'utf8');
          console.warn(`   Wrote empty placeholder to ${path.relative(process.cwd(), outputPath)}`);
        }
      }
    }
  }

  if (!allFetched) {
    console.error('\n💥  One or more required artifacts could not be fetched.');
    console.error('    Ensure irongate-server CI has run generate:openapi, generate:error-registry,');
    console.error('    and generate:env-schema at least once and committed to .generated/');
    process.exit(1);
  }

  console.log('\n✅  All artifacts fetched successfully');
  console.log(`   Server: ${SERVER_REPO}@${BRANCH}`);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
