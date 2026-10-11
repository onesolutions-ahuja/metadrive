import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCutoverCompatibility} from '../src/normalized-cutover-gate.mjs';
import {projectState,stateDigest} from '../src/relational-projection.mjs';

function fixture() {
  return {tenants:{tenant:{
    objects:[{apiName:'Example__c',fields:[{apiName:'Name',dataType:'Text'}]}],
    records:{Example__c:[{Id:'r1',Name:'Original'}]},
    flows:[{apiName:'Flow_A',elements:[{id:'a',config:{recordField:'Name'}}]}],
    pages:[{apiName:'Page_A',components:[]}],
    namedCredentials:[{name:'EXTERNAL_API',encryptedToken:'encrypted'}],
    accessControl:{profiles:[{id:'viewer',objectPermissions:{Example__c:{read:true}}}]}
  }},libraryComponents:[],users:[],refreshSessions:[],revokedAccessTokens:{}};
}
function markers(state) {const digest=stateDigest(state);return [{source_sha256:digest},{state_sha256:digest}];}

test('accepts exactly equal records, flows, RBAC, pages and credentials',()=>{
  const s=fixture();const [migration,runtime]=markers(s);
  const report=assessCutoverCompatibility(s,projectState(s),migration,runtime);
  assert.equal(report.ready,true);
  assert.equal(report.counts.live.records,1);
  assert.equal(report.counts.live.flows,1);
  assert.deepEqual(report.changedSections,[]);
});

test('blocks a late record and reports only section names, not record values',()=>{
  const s=fixture(), staged=structuredClone(s);
  staged.tenants.tenant.records.Example__c[0].Name='Outdated';
  const [migration,runtime]=markers(staged);
  const report=assessCutoverCompatibility(s,projectState(staged),migration,runtime);
  assert.equal(report.ready,false);
  assert.ok(report.changedSections.includes('records'));
  assert.ok(!JSON.stringify(report).includes('Outdated'));
  assert.ok(!JSON.stringify(report).includes('Original'));
});

test('blocks a changed flow, page, RBAC or credential without losing its identity',()=>{
  for (const section of ['flows','pages','accessControl','namedCredentials']) {
    const s=fixture(), staged=structuredClone(s);
    if (section==='flows') staged.tenants.tenant.flows[0].elements[0].config.recordField='Missing';
    if (section==='pages') staged.tenants.tenant.pages[0].components.push({id:'new'});
    if (section==='accessControl') staged.tenants.tenant.accessControl.profiles[0].objectPermissions.Example__c.read=false;
    if (section==='namedCredentials') staged.tenants.tenant.namedCredentials[0].encryptedToken='changed';
    const [migration,runtime]=markers(staged);
    const report=assessCutoverCompatibility(s,projectState(staged),migration,runtime);
    assert.equal(report.ready,false, section+' drift was accepted');
    assert.ok(report.changedSections.includes(section));
  }
});

test('blocks mismatched migration and runtime checksums independently',()=>{
  const s=fixture(),[migration,runtime]=markers(s);
  assert.equal(assessCutoverCompatibility(s,projectState(s),{source_sha256:'0'.repeat(64)},runtime).ready,false);
  assert.equal(assessCutoverCompatibility(s,projectState(s),migration,{state_sha256:'0'.repeat(64)}).ready,false);
});
