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
 '1b':['scripts/audit-component-registry.mjs','apps/web/src/componentCatalog.ts'],
 '1c':['scripts/phase1c-page-dependencies.test.mjs','apps/web/src/pageDependencies.ts'],
 '1d':['scripts/phase1d-component-reuse.test.mjs','apps/web/src/componentCatalog.ts'],
 '1e':['contracts/metadata-schema-compatibility.v1.json','scripts/phase1e-schema-contract.test.mjs'],
 '1f':['apps/server/src/scheduler/runtime-bootstrap.ts','scripts/phase1f-migration-dependencies.test.mjs'],
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
test('current SQL-first runtime has separate reusable engines and lightweight bootstrap', () => {
  const audit=buildInventory({root});
  assert.ok(audit.sourceFileCount > 0);
  const engines=[
    'apps/server/src/core/security/record-access.ts',
    'apps/server/src/modules/flows/flow-context-runtime.ts',
    'apps/server/src/scheduler/runtime-bootstrap.ts',
    'apps/server/src/modules/integrations/http-callout-executor.ts',
    'apps/server/src/modules/reports/filter-validation.ts',
    'apps/server/src/modules/dashboards/runtime.ts'
  ];
  for (const path of engines) assert.ok(existsSync(join(root,path)),path);
  const index=readFileSync(join(root,'apps/server/src/index.ts'),'utf8');
  assert.ok(index.split('\n').length < 4000,'bootstrap architectural ceiling');
});

test('platform data preservation and central RBAC remain contractual requirements', () => {
  const contract=readJson('contracts/metadata-self-hosting.v1.json');
  const policy=readFileSync(join(root,'DEVELOPER_POLICY.md'),'utf8');
  assert.ok(contract.securityInvariants.some(value=>value.includes('server-side RBAC')));
  assert.ok(contract.securityInvariants.some(value=>value.includes('OneEngine')));
  assert.match(policy,/Data Recovery/i);
  assert.match(policy,/Tenant/i);
});

test('Phase 1g checks are mandatory in the architecture workflow',()=>{
 const workflow=readFileSync(join(root,'.github/workflows/metadata-architecture-phase1.yml'),'utf8');
 for(const file of ['phase1f-migration-dependencies.test.mjs','phase1g-acceptance.test.mjs','phase1-final-acceptance.test.mjs']){
  assert.ok(workflow.includes(file),'CI must execute '+file);
 }
});
