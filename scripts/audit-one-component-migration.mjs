#!/usr/bin/env node
/**
 * Read-only Phase 1/2 migration inventory. No database connections or writes.
 * Outputs are derived from the checked-out repository; live tenant metadata
 * requires a separate authorised, tenant-scoped SQL inspection.
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const one = read('apps/web/src/custom-components/one/manifest.json');
const legacy = read('apps/web/src/custom-components/manifest.json');
const contract = read('contracts/component-reference-compatibility.v1.json');
const candidates = {
  SystemPanel: ['OneCard', 'OneText'], AdminField: ['OneInput', 'OneSelect'],
  ChatterInbox: ['OneList', 'OneTable'], CustomerBasketDisplay: ['OneCard', 'OneTable'],
  RecordCatalogCart: ['OneTable', 'OneCard']
};
const excluded = new Set(['node_modules','.git','dist','build','coverage','.next','playwright-report','test-results']);
const roots = ['apps/web/src','apps/server/src','apps/server/data','apps/server/sql'];
function files(path, out=[]) {
  if (!existsSync(path)) return out;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const next=join(path,entry.name);
    if (entry.isDirectory()) files(next,out);
    else if (entry.isFile() && /\.(tsx?|jsx?|mjs|mts|json|sql)$/.test(entry.name)) out.push(next);
  }
  return out;
}
export function audit({oneManifest=one, legacyManifest=legacy, sources=[]}={}) {
  const defs=oneManifest.components ?? [];
  const names=new Set();
  const failures=[];
  for(const item of defs){
    if(!/^One[A-Za-z0-9]+$/.test(item.apiName)) failures.push('invalid One API name: '+item.apiName);
    if(names.has(item.apiName)) failures.push('duplicate One API name: '+item.apiName);
    names.add(item.apiName);
    if(!item.jsxFile || !item.cssFile || !item.propertyDefinitions?.length) failures.push('incomplete registration: '+item.apiName);
    if(!item.surfaces?.includes('page') || !item.surfaces?.includes('flow')) failures.push('missing page/flow surface: '+item.apiName);
  }
  if(defs.length!==40) failures.push('expected 40 One components, found '+defs.length);
  if(!Array.isArray(oneManifest.commonProperties) || oneManifest.commonProperties.length===0) failures.push('common property schema absent');
  const legacyNames=legacyManifest.map(x=>x.apiName);
  const mapping=legacyNames.map(apiName=>({
    existing:apiName,
    candidates:(candidates[apiName]??[]).filter(n=>names.has(n)),
    disposition:'manual review required',
    automaticReplacementAllowed:false,
    reason:'Properties, events, data-binding, permission and published-layout parity are not established'
  }));
  const trackedNames=[...new Set([...legacyNames,...names])];
  const references=trackedNames.map(apiName=>({
    apiName,
    sourceReferences:sources.filter(s=>new RegExp('(^|[^\\w])'+apiName+'([^\\w]|$)').test(s.content))
      .map(s=>s.path).sort(),
    liveTenantReferences:'NOT_INSPECTED'
  }));
  return {schemaVersion:1,mode:'read-only-source-inventory',
    counts:{oneComponents:defs.length,legacyCustomComponents:legacyManifest.length,scannedFiles:sources.length},
    commonProperties:oneManifest.commonProperties.map(x=>x.propertyKey),
    oneComponents:defs.map(x=>({apiName:x.apiName,label:x.label,category:x.category,
      surfaces:x.surfaces,asset:x.jsxFile,propertyKeys:x.propertyDefinitions.map(p=>p.propertyKey)})),
    mapping,references,
    contractualReferences:contract.legacyReferences,
    limits:['Code and manifests are not evidence of live SQL registrations',
      'Static exact-name references miss aliases, dynamic bindings and records stored in SQL',
      'Suggested mappings are NOT proof of functionality or a migration instruction',
      'No live tenant/page/flow/dashboard usage or RBAC grants verified'],
    failures};
}
export function sourceFiles(){
  const all=roots.flatMap(p=>files(join(root,p)));
  return all.filter(p=>!/custom-components\/one\/manifest\.json$/.test(p))
    .map(p=>({path:relative(root,p).replaceAll('\\','/'),content:readFileSync(p,'utf8')}));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=audit({sources:sourceFiles()});
  const output=JSON.stringify(result,null,2)+'\n';
  if(process.argv.includes('--json')) process.stdout.write(output);
  else{
    console.log('Phase 1/2 source inventory',JSON.stringify(result.counts));
    console.log('Mapping requires manual review:',result.mapping.map(m=>m.existing).join(', '));
    console.log('Live SQL coverage: NOT INSPECTED');
    for(const issue of result.failures) console.error('FAIL:',issue);
  }
  if(result.failures.length) process.exitCode=1;
}
