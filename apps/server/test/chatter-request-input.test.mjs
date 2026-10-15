import {strict as assert} from 'node:assert';
import test from 'node:test';
import {sanitizeChatterCallerInput} from '../src/modules/flows/chatter-request-input.mjs';

test('legacy untrusted Chatter target record cannot override server-derived target',()=>{
 const submitted={ConversationId:'account-contact',TargetRecordId:'forged',Body:'hi'};
 for(const name of ['CHATTER_SEND_MESSAGE','CHATTER_ASSIGN_CONVERSATION']){
  assert.deepEqual(sanitizeChatterCallerInput(name,submitted),{ConversationId:'account-contact',Body:'hi'});
 }
 assert.equal(submitted.TargetRecordId,'forged');
});
test('non-Chatter Flow inputs are unchanged',()=>{
 const values={TargetRecordId:'own-input'};
 assert.strictEqual(sanitizeChatterCallerInput('ANOTHER_FLOW',values),values);
});
