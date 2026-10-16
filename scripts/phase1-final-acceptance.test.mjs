import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildInventory} from './audit-platform-architecture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const readJson=relative=>JSON.parse(readFileSync(join(root,relative),'utf8'));
const acceptance={
 '1a':['scripts/audit-platform-architecture.mjs','scripts/audit-platform-architecture.test.mjs'],
 '1b':['docs/metadata-driven-platform/PHASE1B_COMPONENT_COVERAGE.md','scripts/audit-component-registry.mjs'],
 '1c':['scripts/phase1c-page-dependencies.test.mjs','apps/web/src/pageDependencies.ts'],
 '1d':['scripts/phase1d-component-reuse.test.mjs','apps/web/src/componentCatalog.ts'],
 '1e':['contracts/metadata-schema-compatibility.v1.json','scripts/phase1e-schema-contract.test.mjs'],
 '1f':['docs/metadata-driven-platform/MIGRATION_DEPENDENCIES.v1.json','scripts/phase1f-migration-dependencies.test.mjs'],
 '1g':['contracts/metadata-self-hosting.v1.json','scripts/phase1g-acceptance.test.mjs']
};
test('Phase 1a–g acceptance evidence is tracked and complete',()=>{
 const audit=buildInventory({root});
 const paths=new Set(audit.sourceFiles.map(item=>item.path));
 assert.ok(audit.sourceFileCount>0,'Source inventory must not be empty');
 assert.ok(audit.sourceAreas.web>0&&audit.sourceAreas.server>0,'Both runtimes must be inventoried');
 assert.ok(audit.systemWorkspaces.length>0,'Workspace identities must be recorded');
 assert.ok(audit.seedMetadata&&audit.components,'Checked-in seed and component catalogs must be inventoried');
 assert.equal(audit.checks.tenantStateRead,false);
 assert.equal(audit.checks.registryRuntimeQueried,false);
 assert.equal(audit.checks.dynamicFlowDefinitionsCaptured,false);
 for(const [phase,files] of Object.entries(acceptance)){
  for(const path of files){
   assert.ok(existsSync(join(root,path)),phase+': missing '+path);
   if(/\.(?:[cm]?[jt]sx?|css|sql)$/.test(path))assert.ok(paths.has(path),phase+': untracked '+path);
  }
 }
});
test('Phase 1 migration ownership covers all oversized tracked code',()=>{
 const audit=buildInventory({root});
 const map=readJson('docs/metadata-driven-platform/MIGRATION_MAP.v1.json');
 const ownership=new Map(map.sources.map(item=>[item.path,item]));
 for(const file of audit.oversized){
  assert.ok(ownership.has(file.path),'Unowned oversized source: '+file.path);
  assert.ok(ownership.get(file.path).reason?.length>20,'Insufficient ownership rationale: '+file.path);
 }
 const phases=new Set(map.phases.map(item=>item.number));
 assert.deepEqual([...phases].sort(),[1,2,3,4,5,6,7]);
});
test('Phase 1 migration remains non-destructive and central-security-first',()=>{
 const dependencies=readJson('docs/metadata-driven-platform/MIGRATION_DEPENDENCIES.v1.json');
 const contract=readJson('contracts/metadata-self-hosting.v1.json');
 assert.equal(dependencies.runtimeCutover,false,'Baseline must not silently enable runtime cutover');
 assert.ok(contract.securityInvariants.some(value=>value.includes('server-side RBAC')));
 assert.ok(contract.securityInvariants.some(value=>value.includes('OneEngine')));
 const stages=dependencies.stages;
 const visited=new Set();
 for(const stage of stages){
  for(const prior of stage.dependsOn)assert.ok(visited.has(prior),'Invalid dependency: '+prior);
  visited.add(stage.id);
  assert.ok(stage.rollback.length>30,'Missing rollback instruction: '+stage.id);
 }
 assert.equal(stages.length,6,'Phases 2–7 must have migration gates');
});
test('Phase 1g checks are mandatory in the architecture workflow',()=>{
 const workflow=readFileSync(join(root,'.github/workflows/metadata-architecture-phase1.yml'),'utf8');
 for(const file of ['phase1f-migration-dependencies.test.mjs','phase1g-acceptance.test.mjs','phase1-final-acceptance.test.mjs']){
  assert.ok(workflow.includes(file),'CI must execute '+file);
 }
});
