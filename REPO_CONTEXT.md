# Irongate — Repo Context (`irongate-docs`)

Reference for what Irongate is, the 3-repo architecture, and this repo's role.
Hard rules and content standards live in `CLAUDE.md` — this file is context, not constraints.

---

## What Irongate Is

Open-source, self-hosted enterprise identity and authentication platform.
`irongate-docs` is the documentation site at `irongate.dev`, built with Astro + Starlight.

---

## 3-Repo Architecture

| Repo | Purpose | Ships As |
|------|---------|----------|
| `irongate-server` | Fastify auth server + Next.js admin dashboard + Docker/Helm infra | Docker image |
| `irongate-js` | All `@irongate/*` npm SDK packages | npm packages |
| **`irongate-docs`** (this repo) | Astro + Starlight documentation site at `irongate.dev` | Static site |

---

## This Repo's Role

- Owns all hand-authored documentation: getting started guides, framework guides, changelog
- Auto-generated sections (`api-reference/`, `configuration/`, `errors/`) are produced by `irongate-server` CI — never authored here
- Never implement server-side logic or SDK package code here

---

## File Paths

| Concern | Path |
|---------|------|
| Getting started | `src/content/docs/getting-started/` |
| Framework guides | `src/content/docs/framework-guides/` |
| Changelog | `src/content/docs/changelog.mdx` |
| Home page | `src/content/docs/index.mdx` |
| Generation scripts | `scripts/` |
| Astro config | `astro.config.mjs` |
| Implementation status | `IMPLEMENTATION_STATUS.md` |
| Doc history | `docs/history/` |

## Auto-Generated — Never Edit

| Directory | Source | Fix in |
|-----------|--------|--------|
| `src/content/docs/api-reference/` | `irongate-server/.generated/openapi.json` | `irongate-server` routes |
| `src/content/docs/configuration/` | `irongate-server/.generated/env-schema.json` | `irongate-server` env.ts |
| `src/content/docs/errors/` | `irongate-server/.generated/error-registry.json` | `irongate-server` F-04 registry |

If content in these directories is wrong — fix the source in `irongate-server`, not the MDX here.

---

## CI / Cross-Repo Pipeline

1. Push to `main` in `irongate-server` triggers `generate-artifacts.yml`
2. That workflow commits updated `.generated/` files
3. Dispatches `repository_dispatch` to `irongate-docs`
4. Triggers `pnpm generate` + commit here

Concurrency: `cancel-in-progress: true` — latest push always wins.

---

## Key Commands

```bash
pnpm dev          # Local dev server at localhost:4321
pnpm build        # Production build
pnpm preview      # Preview production build
pnpm generate     # Regenerate auto-generated sections from .generated/ artifacts
pnpm typecheck    # Type check
```

---

## Scope Boundary

**In scope (Tier 1):**
- `getting-started/quickstart.mdx` — Docker Compose 5-minute guide
- `getting-started/concepts.mdx` — sessions, tokens, applications, orgs
- `framework-guides/` — Next.js, React, SvelteKit, Nuxt, Node.js
- Auto-generated: API reference, configuration reference, error reference
- `changelog.mdx`

**Out of scope (post-v1.0):**
- Advanced deployment guides, hardening, performance tuning
- Enterprise topics: SAML, SIEM, org management
- Native mobile SDK guides

---

## Implementation History

- Status board: `IMPLEMENTATION_STATUS.md` (repo root) — update after every session
- Doc history: `docs/history/{page-name}.md` — one file per page
- No plans or specs directory — docs has no planning phase
