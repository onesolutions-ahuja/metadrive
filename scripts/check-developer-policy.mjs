#!/usr/bin/env node
// MetaDrive policy rule 13: reject changed code files exceeding 1,000 lines.
// Applies to all new/modified code files, including previously oversized legacy files.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const BASE = process.env.POLICY_BASE_SHA;
const HEAD = process.env.POLICY_HEAD_SHA || 'HEAD';
const LIMIT = 1000;
const CODE_EXT = /\.(?:[cm]?[jt]sx?|vue|svelte|py|go|rs|java|kt|swift|cs|c|cc|cpp|h|hpp|php|rb|sh|sql)$/i;
if (!BASE) {
  console.error('POLICY_BASE_SHA is required (compare base for changed files).');
  process.exit(2);
}
const diff = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', BASE, HEAD, '--'], { encoding: 'utf8' });
const paths = diff.split('\n').filter(Boolean).filter((path) => CODE_EXT.test(path));
const failures = [];
for (const path of paths) {
  if (!existsSync(path)) continue;
  const contents = readFileSync(path, 'utf8');
  const lines = contents.length === 0 ? 0 : contents.split('\n').length - (contents.endsWith('\n') ? 1 : 0);
  if (lines > LIMIT) failures.push(`${path}: ${lines} lines (limit: ${LIMIT})`);
}
if (failures.length) {
  console.error('MetaDrive developer policy rule 13 violated. Split the affected code files into cohesive modules:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`Rule 13 passed: ${paths.length} changed code file(s) are within ${LIMIT} lines.`);
