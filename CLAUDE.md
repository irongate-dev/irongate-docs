# Irongate Docs — Claude Rules

Auto-loaded at the start of every session. All rules apply to every file you touch.
Repo overview, file paths, and scope: see `REPO_CONTEXT.md`.

---

## Never Do

| Don't | Because |
|-------|---------|
| Edit `api-reference/`, `configuration/`, or `errors/` | Auto-generated — overwritten by CI on next push to `irongate-server` main |
| Implement server-side logic or SDK package code | Wrong repo |
| Create Tier 2/3 content pages | Post-v1.0 scope |
| Hardcode `"irongate_at"`, `"irongate_rt"` in examples | Use `getAuthCookieNames(prefix)` — prefix is operator-configurable |
| Use `https://...` format for error type fields in examples | Always `urn:irongate:error:CODE` |
| Mix Divio doc types in the same page | Tutorial + reference in one page confuses readers |
| Commit a broken code example | A broken example is worse than no example |
| Reference SAML, SIEM, or org management in Tier 1 pages | Post-v1.0 — remove or defer clearly |

---

## Content Rules

| Rule | Requirement |
|------|------------|
| Auto-generated dirs | Never edit `api-reference/`, `configuration/`, `errors/` — fix source in `irongate-server` |
| Code examples | Must match current `@irongate/*` exported API exactly — mentally trace every example before committing |
| Cookie names | Always show `getAuthCookieNames(prefix)` — never hardcoded cookie name strings |
| Error codes | `urn:irongate:error:CODE` format in all documentation |
| Error doc URLs | `https://irongate.dev/errors/CODE` pattern |
| Tier 1 only | Getting started, framework guides, auto-generated references, changelog |

---

## Writing Standards

| Standard | Rule |
|----------|------|
| Voice | Second person — "you install", not "the package is installed" |
| Tense | Present tense — "returns", not "will return" |
| Active voice | "Irongate validates the token" — not "the token is validated" |
| Self-contained | Every page stands alone or links to prerequisites explicitly |

---

## Divio Documentation System

| Type | Purpose | Examples in this repo |
|------|---------|----------------------|
| **Tutorial** | Learning-oriented — teaches through doing | `getting-started/quickstart.mdx` |
| **How-to** | Task-oriented — "how do I do X" | `framework-guides/*.mdx` |
| **Reference** | Information-oriented — facts and specs | Auto-generated only |
| **Explanation** | Understanding-oriented — concepts and decisions | `getting-started/concepts.mdx` |

Never mix types in the same page.

---

## Commit Convention

```
docs: add Next.js App Router quickstart guide
docs: update SvelteKit framework guide for v2 hooks API
fix(docs): correct getAuthCookieNames example in react guide
chore(generate): regenerate api-reference from openapi.json
chore(history): update implementation record
```

Doc commits always separate from history commits.
