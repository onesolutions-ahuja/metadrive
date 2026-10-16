import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCustomConditionLogic} from '../../apps/server/src/modules/flows/condition-logic.js';
import {validateFlowFormulaSyntax} from '../../apps/server/src/flow-formula-syntax.mjs';
import {flowPackageAdmission} from '../../apps/server/src/modules/flows/package-admission.js';
import {assertFlowRuntimeAdmission} from '../../apps/server/src/modules/flows/execution-admission.js';
import {retryBudgetExhausted,retryDelayMs,shouldTriggerInboundMessage}
 from '../../apps/server/src/automation-policy.js';

test('metadata decision logic parses precedence and rejects invalid references',()=>{
 assert.equal(evaluateCustomConditionLogic('1 AND (2 OR 3)',[true,false,true]),true);
 assert.equal(evaluateCustomConditionLogic('1 AND 2',[true,false]),false);
 assert.throws(()=>evaluateCustomConditionLogic('1 OR 9',[true,false]),/only 2/);
});
test('Flow formulas validate without executing runtime resources',()=>{
 const formula=validateFlowFormulaSyntax('IF(Amount > 10, "high", "low")');
 assert.equal(formula.hasReferences,true);
 assert.ok(formula.references.includes('Amount'));
 assert.throws(()=>validateFlowFormulaSyntax('IF(TRUE(), 1)'),/requires/);
});
test('app-owned Flow requires valid installation and licence',()=>{
 const pkgs=[{appKey:'booking',flows:[{apiName:'Book'}]}];
 const now=new Date('2026-10-16T12:00:00Z');
 assert.deepEqual(flowPackageAdmission('Core',pkgs,[],now),
  {installed:true,licensed:true,activated:true});
 assert.deepEqual(flowPackageAdmission('Book',pkgs,[],now),
  {installed:false,licensed:false,activated:false});
 assert.deepEqual(flowPackageAdmission('Book',pkgs,[{AppKey__c:'booking',Installed__c:true,
  TrialUsed__c:true,TrialExpiresAt__c:'2026-12-01T00:00:00Z'}],now),
  {installed:true,licensed:true,activated:true});
});
test('Flow runtime fails closed for tenant mismatch, uninstall and drafts',()=>{
 const baseline={tenantId:'a',principalTenantId:'a',principalId:'user',
  status:'Active',allowDraftExecution:false,installed:true,licensed:true,activated:true};
 assert.doesNotThrow(()=>assertFlowRuntimeAdmission(baseline));
 assert.throws(()=>assertFlowRuntimeAdmission({...baseline,principalTenantId:'b'}),/tenant/i);
 assert.throws(()=>assertFlowRuntimeAdmission({...baseline,installed:false}),/not installed/i);
 assert.throws(()=>assertFlowRuntimeAdmission({...baseline,status:'Draft'}),/not active/i);
});
test('retries and inbound chat start windows stay bounded',()=>{
 assert.equal(retryBudgetExhausted(2,3),false);
 assert.equal(retryBudgetExhausted(3,3),true);
 assert.throws(()=>retryBudgetExhausted(0,2),/Invalid/);
 assert.equal(retryDelayMs(1),60000);
 assert.equal(retryDelayMs(100),3600000);
 const now=Date.UTC(2026,9,16,12);
 assert.equal(shouldTriggerInboundMessage(String(now/1000),now,15),true);
 assert.equal(shouldTriggerInboundMessage(String(now/1000-901),now,15),false);
});
