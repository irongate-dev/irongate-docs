#!/usr/bin/env tsx
/**
 * check-links.ts
 * irongate-docs CI — checks for broken links in the built Astro site.
 *
 * Modes:
 *   --internal-only   Check only internal links (fast, runs on every PR — blocking)
 *   --external-only   Check only external links (slow, runs on weekly schedule — advisory)
 *   (no flag)         Check both internal and external links
 *
 * Internal links:  href="/..." or href="./..." — resolved against the dist/ build
 * External links:  href="https://..." — fetched with HEAD requests
 *
 * Source:   dist/   (Astro build output — must run after pnpm astro build)
 * Exit 0:   all checked links pass
 * Exit 1:   broken internal links found (or broken external links if not --internal-only)
 *
 * Usage:
 *   pnpm tsx scripts/check-links.ts --internal-only
 *   pnpm tsx scripts/check-links.ts --external-only
 *   pnpm tsx scripts/check-links.ts
 */

import fs   from 'node:fs';
import path from 'node:path';

const DIST_DIR = path.join(process.cwd(), 'dist');
const args     = process.argv.slice(2);

const INTERNAL_ONLY = args.includes('--internal-only');
const EXTERNAL_ONLY = args.includes('--external-only');

// ── Validate dist/ exists ─────────────────────────────────────────────────────
if (!fs.existsSync(DIST_DIR)) {
  console.error(`❌  dist/ directory not found at ${DIST_DIR}`);
  console.error('    Run pnpm astro build before check-links.ts');
  process.exit(1);
}

// ── Collect all HTML files in dist/ ──────────────────────────────────────────
function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      results.push(full);
    }
  }
  return results;
}

const htmlFiles = walkDir(DIST_DIR);
console.log(`🔍  Scanning ${htmlFiles.length} HTML files in dist/`);

// ── Extract links from HTML ───────────────────────────────────────────────────
// Matches href="..." and src="..." — handles single and double quotes
const LINK_RE = /(?:href|src)=["']([^"'#?]+)(?:[#?][^"']*)?["']/g;

interface LinkOccurrence {
  sourceFile: string;
  link:       string;
}

const internalLinks: LinkOccurrence[] = [];
const externalLinks: LinkOccurrence[] = [];

for (const htmlFile of htmlFiles) {
  const content = fs.readFileSync(htmlFile, 'utf8');
  const relativeSrc = path.relative(DIST_DIR, htmlFile);
  let match: RegExpExecArray | null;

  // Reset lastIndex for global regex
  LINK_RE.lastIndex = 0;
  const src = content;

  // Re-run regex on each file
  const linkRe = new RegExp(LINK_RE.source, 'g');
  while ((match = linkRe.exec(src)) !== null) {
    const link = match[1];
    if (!link || link.startsWith('mailto:') || link.startsWith('javascript:')) continue;

    if (link.startsWith('https://') || link.startsWith('http://')) {
      externalLinks.push({ sourceFile: relativeSrc, link });
    } else if (link.startsWith('/') || link.startsWith('./') || link.startsWith('../')) {
      internalLinks.push({ sourceFile: relativeSrc, link });
    }
    // Relative bare links (e.g. "page.html") — skip, too ambiguous
  }
}

console.log(`   Found ${internalLinks.length} internal links, ${externalLinks.length} external links`);

// ── Check internal links ──────────────────────────────────────────────────────
const internalBroken: Array<{ sourceFile: string; link: string; reason: string }> = [];

if (!EXTERNAL_ONLY) {
  console.log('\n▶  Checking internal links...');

  // Build a set of all valid paths in dist/
  const validPaths = new Set<string>();
  for (const f of walkDir(DIST_DIR)) {
    const rel = path.relative(DIST_DIR, f);
    validPaths.add('/' + rel.replace(/\\/g, '/'));
    // Also add the directory-style path (index.html → /dir/)
    if (rel.endsWith('/index.html')) {
      validPaths.add('/' + rel.replace(/\/index\.html$/, '/').replace(/\\/g, '/'));
    }
    if (rel === 'index.html') {
      validPaths.add('/');
    }
  }

  for (const { sourceFile, link } of internalLinks) {
    // Normalise link to absolute path
    let absLink: string;
    if (link.startsWith('/')) {
      absLink = link;
    } else {
      // Relative — resolve against source file's directory
      const sourceDir = '/' + path.dirname(sourceFile).replace(/\\/g, '/');
      absLink = path.posix.resolve(sourceDir, link);
    }

    // Strip trailing slash for lookup (except root)
    const lookupPath = absLink === '/' ? '/' : absLink.replace(/\/$/, '');

    // Check if file exists: exact match, or with /index.html, or with .html
    const exists =
      validPaths.has(absLink) ||
      validPaths.has(lookupPath) ||
      validPaths.has(lookupPath + '/') ||
      fs.existsSync(path.join(DIST_DIR, lookupPath.replace(/^\//, ''))) ||
      fs.existsSync(path.join(DIST_DIR, lookupPath.replace(/^\//, '') + '.html')) ||
      fs.existsSync(path.join(DIST_DIR, lookupPath.replace(/^\//, ''), 'index.html'));

    if (!exists) {
      internalBroken.push({
        sourceFile,
        link,
        reason: `No file found at dist${lookupPath}(.html|/index.html)`,
      });
    }
  }

  if (internalBroken.length === 0) {
    console.log(`   ✅ All ${internalLinks.length} internal links are valid`);
  } else {
    console.error(`\n❌  ${internalBroken.length} broken internal link(s) found:\n`);
    // Group by source file for readability
    const bySource: Record<string, typeof internalBroken> = {};
    for (const b of internalBroken) {
      if (!bySource[b.sourceFile]) bySource[b.sourceFile] = [];
      bySource[b.sourceFile].push(b);
    }
    for (const [src, broken] of Object.entries(bySource)) {
      console.error(`  ${src}`);
      for (const b of broken) {
        console.error(`    ✗ ${b.link}`);
        console.error(`      ${b.reason}`);
      }
    }
  }
}

// ── Check external links ──────────────────────────────────────────────────────
const externalBroken: Array<{ sourceFile: string; link: string; status: number | string }> = [];

if (!INTERNAL_ONLY && externalLinks.length > 0) {
  console.log('\n▶  Checking external links (HEAD requests)...');
  console.log('   This may take a while for large numbers of links.\n');

  // Deduplicate external links — only check each URL once
  const uniqueExternal = [...new Map(externalLinks.map(l => [l.link, l])).values()];
  console.log(`   Checking ${uniqueExternal.length} unique external URLs...`);

  // Known-good domains — skip checking (avoids rate limiting on common CDNs)
  const SKIP_DOMAINS = new Set([
    'github.com', 'www.github.com',
    'npmjs.com', 'www.npmjs.com',
    'nodejs.org', 'www.nodejs.org',
    'typescriptlang.org', 'www.typescriptlang.org',
    'astro.build', 'starlight.astro.build',
  ]);

  const shouldSkip = (url: string): boolean => {
    try {
      const { hostname } = new URL(url);
      return SKIP_DOMAINS.has(hostname);
    } catch {
      return false;
    }
  };

  // Fetch with timeout
  async function checkUrl(url: string): Promise<{ ok: boolean; status: number | string }> {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, {
        method:  'HEAD',
        signal:  controller.signal,
        headers: { 'User-Agent': 'irongate-docs-link-checker/1.0' },
        redirect: 'follow',
      });
      clearTimeout(timeout);
      return { ok: res.ok || res.status === 405, status: res.status };
      // 405 Method Not Allowed = HEAD not supported but URL exists
    } catch (err: unknown) {
      clearTimeout(timeout);
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, status: msg.includes('abort') ? 'TIMEOUT' : 'NETWORK_ERROR' };
    }
  }

  // Check links with concurrency limit of 5
  const CONCURRENCY = 5;
  let checkedCount  = 0;

  async function processChunk(chunk: typeof uniqueExternal): Promise<void> {
    await Promise.all(chunk.map(async ({ sourceFile, link }) => {
      if (shouldSkip(link)) {
        checkedCount++;
        return;
      }

      const result = await checkUrl(link);
      checkedCount++;

      if (checkedCount % 10 === 0) {
        process.stdout.write(`   ${checkedCount}/${uniqueExternal.length} checked...\r`);
      }

      if (!result.ok) {
        externalBroken.push({ sourceFile, link, status: result.status });
      }
    }));
  }

  // Process in chunks
  for (let i = 0; i < uniqueExternal.length; i += CONCURRENCY) {
    await processChunk(uniqueExternal.slice(i, i + CONCURRENCY));
  }

  console.log(); // clear the \r line

  if (externalBroken.length === 0) {
    console.log(`   ✅ All checked external links are valid`);
  } else {
    // External link failures are warnings unless --external-only flag (scheduled run)
    const severity = EXTERNAL_ONLY ? '❌' : '⚠️ ';
    console.warn(`\n${severity}  ${externalBroken.length} broken external link(s):\n`);
    for (const b of externalBroken) {
      console.warn(`  ${b.sourceFile}`);
      console.warn(`    ✗ ${b.link}  [${b.status}]`);
    }
  }
}

// ── Summary and exit ──────────────────────────────────────────────────────────
console.log('\n── Summary ──────────────────────────────────────────────────');

const hasInternalFailures = !EXTERNAL_ONLY && internalBroken.length > 0;
const hasExternalFailures = EXTERNAL_ONLY  && externalBroken.length > 0;

if (!hasInternalFailures && !hasExternalFailures) {
  if (INTERNAL_ONLY) {
    console.log(`✅  Internal link check passed (${internalLinks.length} links checked)`);
  } else if (EXTERNAL_ONLY) {
    console.log(`✅  External link check passed (${externalLinks.length} links checked)`);
  } else {
    console.log(`✅  All links valid (${internalLinks.length} internal, ${externalLinks.length} external)`);
  }
  process.exit(0);
} else {
  if (hasInternalFailures) {
    console.error(`❌  ${internalBroken.length} broken internal link(s) — fix before merging`);
  }
  if (hasExternalFailures) {
    console.error(`❌  ${externalBroken.length} broken external link(s) — investigate and fix`);
  }
  process.exit(1);
}
