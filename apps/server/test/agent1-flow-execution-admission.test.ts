import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAuthorisedFlowDecision } from '../src/modules/flows/decision-runtime.js';

const valid = {
  tenantId:'tenant-a',principalTenantId:'tenant-a',principalId:'user-a',
  grants:new Set(['flows:execute']), requiredPermission:'flows:execute',
  installed:true,licensed:true,activated:true,published:true
};
test('agent1: generic Flow decision requires tenant, RBAC and independent lifecycle gates', () => {
  assert.equal(evaluateAuthorisedFlowDecision(valid,'1 AND 2',[true,true]),true);
  assert.equal(evaluateAuthorisedFlowDecision(valid,'1 AND 2',[true,false]),false);
  assert.throws(() => evaluateAuthorisedFlowDecision({...valid,principalTenantId:'tenant-b'},'1',[true]),/Cross-tenant/);
  assert.throws(() => evaluateAuthorisedFlowDecision({...valid,grants:new Set()},'1',[true]),/permission denied/);
  for (const property of ['installed','licensed','activated','published'] as const) {
    assert.throws(() => evaluateAuthorisedFlowDecision({...valid,[property]:false},'1',[true]));
  }
});
