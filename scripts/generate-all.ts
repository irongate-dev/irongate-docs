#!/usr/bin/env tsx
import { execSync } from 'node:child_process';

const generators = [
  'generate-error-docs',
  'generate-env-docs',
  'generate-api-docs',
];

for (const gen of generators) {
  console.log(`\n[generate-all] Running ${gen}...`);
  execSync(`tsx scripts/${gen}.ts`, { stdio: 'inherit' });
}

console.log('\n[generate-all] All generators complete.');
