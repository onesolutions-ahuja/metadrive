import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRecoveryFlowDefinition,recoveryFlowActions} from '../src/recovery-flow.ts';
test('recovery flow validates request and confirmation security action order',()=>{
 const flow=defaultRecoveryFlowDefinition();
 assert.deepEqual(recoveryFlowActions(flow,'request').map(n=>n.config.actionType),['Generate Verification','Send Recovery Communication']);
 assert.deepEqual(recoveryFlowActions(flow,'confirm').map(n=>n.config.actionType),['Verify Verification','Reset Password']);
});
test('recovery flow rejects metadata replacement of reset protection',()=>{
 const flow=defaultRecoveryFlowDefinition();
 flow.elements.find(n=>n.id===5)!.config.actionType='Create Records';
 assert.throws(()=>recoveryFlowActions(flow,'confirm'));
});
test('recovery flow does not allow bypassing verification by rewriting connectors',()=>{
 const flow=defaultRecoveryFlowDefinition();
 const edge=flow.connectors.find(c=>c.from===2 && c.label==='confirm')!;
 edge.to=6;
 assert.throws(()=>recoveryFlowActions(flow,'confirm'));
});
