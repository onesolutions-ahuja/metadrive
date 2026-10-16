#!/usr/bin/env node
// Rule 13: new modules <= 1,000 lines; existing oversized legacy files may shrink during phased extraction.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
const BASE = process.env.POLICY_BASE_SHA;
const HEAD = process.env.POLICY_HEAD_SHA || 'HEAD';
const LIMIT = 1000;
const CODE_EXT = /\.(?:[cm]?[jt]sx?|vue|svelte|py|go|rs|java|kt|swift|cs|c|cc|cpp|h|hpp|php|rb|sh|sql)$/i;
const lines = content => content.length ? content.split('\n').length - Number(content.endsWith('\n')) : 0;
if (!BASE) { console.error('POLICY_BASE_SHA required.'); process.exit(2); }
const diff = execFileSync('git',['diff','--name-only','--diff-filter=ACMR',BASE,HEAD,'--'],{encoding:'utf8'});
const paths = diff.split('\n').filter(Boolean).filter(path => CODE_EXT.test(path));
// The retired Phase 1 migration inventory was intentionally deleted. Compare each
// changed file against the real Git base instead of maintaining a stale owner map.
const failures = [], transitional = [];
for (const path of paths) {
  if (!existsSync(path)) continue;
  const current = lines(readFileSync(path,'utf8'));
  if (current <= LIMIT) continue;
  let original = 0;
  try { original = lines(execFileSync('git',['show',BASE+':'+path],{
    encoding:'utf8',stdio:['ignore','pipe','ignore']
  })); } catch { /* New files have no base. */ }
  if (original > LIMIT && current <= original) {
    transitional.push(path+': '+original+' -> '+current);
    continue;
  }
  failures.push(path+': '+current+' lines (base: '+original+', limit: '+LIMIT+')');
}
if (failures.length) {
  console.error('MetaDrive rule 13: extract a module or reduce the oversized file:');
  for (const failure of failures) console.error(' - '+failure);
  process.exit(1);
}
console.log('Rule 13 passed for '+paths.length+' changed files; new modules <= '+LIMIT+' lines.');
for (const entry of transitional) console.log('Phased extraction: '+entry);
