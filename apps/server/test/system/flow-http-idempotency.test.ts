import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveFlowHttpCalloutKey} from '../../src/system-files/flow-http-mapping.js';
test('a payment attempt reuses its key through retry, never using a new interview ID',()=>{
 const resource=(reference:string)=>reference==='{!PaymentAttemptId}'?'attempt-1':null;
 const key='cart-{!PaymentAttemptId}';
 assert.equal(resolveFlowHttpCalloutKey(key,'interview-one',resource),'cart-attempt-1');
 assert.equal(resolveFlowHttpCalloutKey(key,'interview-two',resource),'cart-attempt-1');
 assert.equal(resolveFlowHttpCalloutKey('', 'interview-two',resource),'interview-two');
 assert.throws(()=>resolveFlowHttpCalloutKey(key,'any',()=>null));
 assert.throws(()=>resolveFlowHttpCalloutKey('bad key','any',resource));
});
