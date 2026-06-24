// irongate-docs/eslint.config.js
// ESLint 9 flat config — covers Astro components, TypeScript generator scripts,
// and MDX content files.
//
// Primary concerns:
//   1. Auto-generated directories must not be hand-edited (C.3 / F-00c §5.3)
//   2. Generator scripts output correct shapes for MDX
//   3. No console.log left in scripts (they write to stdout/stderr explicitly)
//   4. TypeScript quality for the generator scripts
//
// Plugins:
//   typescript-eslint    — TypeScript rules for scripts/
//   eslint-plugin-astro  — Astro component rules
//   eslint-plugin-mdx    — MDX file linting
//   eslint-plugin-n      — Node.js best practices for scripts

import tseslint    from 'typescript-eslint';
import astroPlugin from 'eslint-plugin-astro';
import mdxPlugin   from 'eslint-plugin-mdx';
import nodePlugin  from 'eslint-plugin-n';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(

  // ── Global ignores ─────────────────────────────────────────────────────────
  {
    ignores: [
      // Auto-generated directories — never linted, never hand-edited (F-00c §5.3)
      'src/content/docs/api-reference/**',
      'src/content/docs/configuration/**',
      'src/content/docs/errors/**',
      // Build output
      'dist/**',
      'node_modules/**',
      '.astro/**',
      // Generated artifacts from irongate-server
      'src/_generated/**',
    ],
  },

  // ── TypeScript generator scripts (scripts/) ────────────────────────────────
  {
    files: ['scripts/**/*.ts'],

    extends: [
      ...tseslint.configs.recommended,
    ],

    plugins: {
      n: nodePlugin,
    },

    languageOptions: {
      parserOptions: {
        project:        './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      // Scripts write to stdout/stderr directly — console is expected
      'no-console':                              'off',

      // Scripts are Node.js — allow process.exit()
      'n/no-process-exit':                       'off',

      // TypeScript quality
      '@typescript-eslint/no-explicit-any':      'warn',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-floating-promises': 'error',

      // ── Generator script correctness ───────────────────────────────────────
      // Ensure generated MDX files are written — not just logged
      'no-restricted-syntax': [
        'warn',
        {
          // Detect if scripts use console.log instead of fs.writeFileSync for output
          // This is a heuristic — actual check is done by CI test run
          selector: 'CallExpression[callee.object.name="console"][callee.property.name="log"]:has(TemplateLiteral:has(Identifier[name=/mdx|content|output/i]))',
          message:  'Generator scripts should write to files with fs.writeFileSync, not log to stdout',
        },
      ],

      // Prefer explicit error handling in scripts (no silent failures)
      '@typescript-eslint/no-misused-promises': 'error',
      'prefer-const':                           'error',
      'no-var':                                 'error',
    },
  },

  // ── Astro components (src/**/*.astro) ─────────────────────────────────────
  {
    files: ['src/**/*.astro'],

    extends: [
      ...astroPlugin.configs['flat/recommended'],
    ],

    rules: {
      // Astro-specific best practices
      'astro/no-unused-css-selector':       'warn',
      'astro/no-conflict-set-directives':   'error',
      'astro/no-unused-define-vars-in-style': 'warn',
      'astro/valid-compile':                'error',

      // MDX generation target — no editing auto-generated files
      // (Cannot detect this at lint time; enforced by CI gitignore check)
    },
  },

  // ── MDX content files (src/content/docs — hand-edited only) ───────────────
  {
    files: [
      'src/content/docs/index.mdx',
      'src/content/docs/getting-started/**/*.mdx',
      'src/content/docs/framework-guides/**/*.mdx',
      'src/content/docs/changelog.mdx',
    ],

    ...mdxPlugin.flat,

    processor: mdxPlugin.createRemarkProcessor({
      lintCodeBlocks: false,  // Don't lint code blocks in MDX — they're examples
      languageMapper:  {},
    }),

    rules: {
      // MDX prose quality
      'no-multiple-empty-lines': ['error', { max: 1 }],

      // Detect if auto-generated directory content ends up in hand-edited files
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MDXComment:has(Literal[value=/AUTO-GENERATED/i])',
          message:  'This file contains auto-generated content. It should be in api-reference/, configuration/, or errors/ instead.',
        },
      ],
    },
  },

  // ── Astro config and root TS files ─────────────────────────────────────────
  {
    files: ['*.mjs', '*.js', '*.ts', 'astro.config.*'],

    extends: [
      ...tseslint.configs.recommended,
    ],

    rules: {
      'no-console':                         'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'prefer-const':                       'error',
    },
  },

  // ── Prettier integration (must be LAST) ─────────────────────────────────────
  // Disables all ESLint formatting rules that conflict with Prettier.
  // Prettier owns formatting; ESLint owns code quality.
  // Format: pnpm format  |  Check: pnpm format:check
  prettierConfig,
);