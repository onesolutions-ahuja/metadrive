import test from 'node:test';
import assert from 'node:assert/strict';
import {validateComponentEventBinding,prepareComponentEventInvocation} from '../apps/web/src/componentEventBinding.ts';
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
