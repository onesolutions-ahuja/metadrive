import test from 'node:test';
import assert from 'node:assert/strict';
import { flowPackageAdmission } from '../src/modules/flows/package-admission.js';
import { assertFlowRuntimeAdmission } from '../src/modules/flows/execution-admission.js';

const packages = [
  { appKey:'optional-app', flows:[{ apiName:'OPTIONAL_ACTION' }] },
  { appKey:'bundled-app', flows:[{ apiName:'BUNDLED_ACTION' }],
    installation:{ allowInstalledMetadataWithoutLicence:true } }
];
const now = new Date('2026-10-15T12:00:00Z');
test('agent1: Core Flow has no optional-app dependency', () => {
  assert.deepEqual(flowPackageAdmission('CORE_ACTION',packages,[],now),
    {installed:true,licensed:true,activated:true});
});
test('agent1: disabled or uninstalled app cannot dispatch nested or scheduled Flow', () => {
  for (const installs of [[],[{AppKey__c:'optional-app',Installed__c:false}]]) {
    const admission = flowPackageAdmission('OPTIONAL_ACTION',packages,installs,now);
    assert.equal(admission.activated,false);
    assert.throws(()=>assertFlowRuntimeAdmission({
      tenantId:'a',principalTenantId:'a',principalId:'u',status:'Active',
      allowDraftExecution:false,...admission
    }));
  }
});
test('agent1: active licence and trial must not be expired', () => {
  const base = {AppKey__c:'optional-app',Installed__c:true};
  assert.equal(flowPackageAdmission('OPTIONAL_ACTION',packages,[{
    ...base,LicenceExpiresAt__c:'2026-10-14T12:00:00Z'
  }],now).licensed,false);
  assert.equal(flowPackageAdmission('OPTIONAL_ACTION',packages,[{
    ...base,TrialUsed__c:true,TrialExpiresAt__c:'2026-10-16T12:00:00Z'
  }],now).activated,true);
  assert.equal(flowPackageAdmission('BUNDLED_ACTION',packages,[{
    AppKey__c:'bundled-app',Installed__c:true
  }],now).activated,true);
  assert.equal(flowPackageAdmission('BUNDLED_ACTION',packages,[],now).activated,false);
});
test('agent1: runtime rejects cross tenant and inactive Flow', () => {
  const allowed = {
    tenantId:'a',principalTenantId:'a',principalId:'u',status:'Active',
    allowDraftExecution:false,installed:true,licensed:true,activated:true
  };
  assert.doesNotThrow(()=>assertFlowRuntimeAdmission(allowed));
  assert.throws(()=>assertFlowRuntimeAdmission({...allowed,principalTenantId:'b'}),/tenant/);
  assert.throws(()=>assertFlowRuntimeAdmission({...allowed,status:'Draft'}),/not active/);
  assert.doesNotThrow(()=>assertFlowRuntimeAdmission({...allowed,status:'Draft',allowDraftExecution:true}));
});
