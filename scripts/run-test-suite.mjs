#!/usr/bin/env node
// Suite taxonomy over the existing canonical test files; no duplicated test sources.
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const suites=new Set(['unit','integration','tenant-isolation','app-lifecycle','browser-e2e']);
const category=process.argv[2];
if(!suites.has(category)){console.error('Usage: node scripts/run-test-suite.mjs <'+[...suites].join('|')+'>');process.exit(2);}
const suite=JSON.parse(readFileSync(new URL('../tests/'+category+'/suite.json',import.meta.url),'utf8'));
if(category==='browser-e2e'){
 if(!process.env.METADRIVE_SQL_TEST_DATABASE_URL){
  console.error('Browser E2E requires METADRIVE_SQL_TEST_DATABASE_URL and the existing SQL CI setup.');
  process.exit(2);
 }
 const result=spawnSync(process.execPath,['apps/server/scripts/builder-browser-smoke.mjs'],{stdio:'inherit',env:process.env});
 process.exit(result.status??1);
}
if(!Array.isArray(suite.tests)||!suite.tests.length)throw new Error('No tests in suite: '+category);
for(const path of suite.tests){
 if(typeof path!=='string'||!/^apps\/(server\/test\/system|web\/test)\//.test(path)||!existsSync(path))
  throw new Error('Invalid test suite entry: '+String(path));
}
const result=spawnSync(process.execPath,['--import','tsx','--test',...suite.tests],{stdio:'inherit',env:process.env});
if(result.error)throw result.error;
process.exit(result.status??1);
