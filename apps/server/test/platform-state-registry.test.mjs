import assert from 'node:assert/strict';
import {test} from 'node:test';
import {platformStateSections,platformStateSectionKeys,platformSettingSections,identitySnapshotSections,forEachTenantSection} from '../src/platform-state-registry.mjs';

test('state registry keys are unique and preserve the persisted root contract',()=>{
  assert.equal(new Set(platformStateSectionKeys).size,platformStateSectionKeys.length);
  assert.deepEqual(platformStateSectionKeys,[
    'tenants','libraryComponents','users','refreshSessions','revokedAccessTokens',
    'platformPolicies','platformPolicyAudit','tenantRegistry','tenantManagementAudit'
  ]);
  assert.equal(platformStateSections.length,9);
});
test('setting registry retains platform scope and existing type contracts',()=>{
  assert.deepEqual(platformSettingSections.map(s=>[s.key,s.valueType]),[
    ['platformPolicies','object'],['platformPolicyAudit','array'],
    ['tenantRegistry','object'],['tenantManagementAudit','array']
  ]);
  assert.deepEqual(identitySnapshotSections,['libraryComponents','users','refreshSessions','revokedAccessTokens']);
});
test('tenant section iterator traverses arbitrary metadata once and does not mutate state',()=>{
  const state={tenants:{a:{pages:[{id:1}],customMetadata:{enabled:true}},b:{flows:[]}}};
  const before=structuredClone(state);const visits=[];
  forEachTenantSection(state,item=>visits.push(item));
  assert.deepEqual(visits.map(x=>x.tenantId+'.'+x.key),['a.pages','a.customMetadata','b.flows']);
  assert.deepEqual(state,before);
});
