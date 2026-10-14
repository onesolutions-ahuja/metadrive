import test from 'node:test';
import assert from 'node:assert/strict';
import {validateComponentEventBinding,prepareComponentEventInvocation,validateConfiguredFlowEvent,requireActiveComponentFlow} from '../apps/web/src/componentEventBinding.ts';
const events=new Set(['onSave']);const active=new Set(['SaveAccount']);
const binding={eventName:'onSave',flowApiName:'SaveAccount',typedInputs:{recordId:'text',approved:'boolean',count:'number'},faultPath:'SaveFailed'};
test('2e prepares typed values for authorised server Flow dispatch',()=>{
 const payload=prepareComponentEventInvocation(binding,{recordId:'id-1',approved:true,count:2,unknown:'secret'},events,active);
 assert.deepEqual({...payload.inputs},{recordId:'id-1',approved:true,count:2});
 assert.equal(payload.flowApiName,'SaveAccount');
 assert.equal(payload.faultPath,'SaveFailed');
});
test('2e rejects unregistered events and unavailable Flows',()=>{
 assert.ok(validateComponentEventBinding({...binding,eventName:'onHidden'},events,active).length);
 assert.equal(prepareComponentEventInvocation({...binding,flowApiName:'InactiveFlow'},{},events,active),undefined);
});
test('2e rejects wrong types and untrusted executable input metadata',()=>{
 assert.equal(prepareComponentEventInvocation(binding,{count:Infinity},events,active),undefined);
 assert.equal(prepareComponentEventInvocation(binding,{approved:'true'},events,active),undefined);
 assert.ok(validateComponentEventBinding({...binding,typedInputs:{'__proto__':'text',amount:'script'}},events,active).length);
});

test('2e guards existing dispatch and preserves legacy bindings',()=>{
 assert.deepEqual(validateConfiguredFlowEvent('submit','SaveAccount',undefined,{recordId:42},active),[]);
 assert.deepEqual(validateConfiguredFlowEvent('submit','SaveAccount',{recordId:'text'},{recordId:'123'},active),[]);
 assert.ok(validateConfiguredFlowEvent('submit','SaveAccount',{recordId:'text'},{recordId:123},active).length);
 assert.ok(validateConfiguredFlowEvent('submit','Inactive',undefined,{},active).length);
 assert.deepEqual(validateConfiguredFlowEvent('submit','SaveAccount',{amount:'script'}, {},active).length,1);
});
test('2e live page host validates event inputs before executing existing endpoint',()=>{
 const fs=await import('node:fs');
 const app=fs.readFileSync(new URL('../apps/web/src/App.tsx',import.meta.url),'utf8');
 const check=app.indexOf('requireActiveComponentFlow(action.event, flowApiName');
 const launch=app.indexOf("if (selected.flowType === 'Screen Flow')",check);
 const execute=app.indexOf("'/flows/' + encodeURIComponent(flowApiName) + '/execute'",launch);
 assert.ok(check>0&&launch>check&&execute>launch);
});

test('2e resolves active Flow and rejects inactive attempts before dispatch',()=>{
 const available=[{apiName:'SaveAccount',status:'Active',flowType:'Autolaunched Flow'},{apiName:'Inactive',status:'Draft',flowType:'Screen Flow'}];
 assert.equal(requireActiveComponentFlow('submit','SaveAccount',{count:'number'},{count:1},available).apiName,'SaveAccount');
 assert.throws(()=>requireActiveComponentFlow('submit','Inactive',undefined,{},available),/not active/);
 assert.throws(()=>requireActiveComponentFlow('submit','SaveAccount',{count:'number'},{count:'1'},available),/Invalid value/);
});
