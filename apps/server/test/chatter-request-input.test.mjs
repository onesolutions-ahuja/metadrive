import {strict as assert} from 'node:assert';
import test from 'node:test';
import {sanitizeChatterCallerInput, trustedChatterExecutionFlow} from '../src/modules/flows/chatter-request-input.mjs';

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

test('trusted protected Flow variables remain private in published metadata',()=>{
 const published={apiName:'CHATTER_SEND_MESSAGE',resources:[
  {name:'Body',availableForInput:true},
  {name:'AuthorisedCredentialId',availableForInput:false},
  {name:'AuthorisedMessagePath',availableForInput:false}
 ]};
 const trusted=trustedChatterExecutionFlow(published,{Body:'hello',AuthorisedCredentialId:'server-derived',AuthorisedMessagePath:'messages'});
 assert.equal(published.resources[1].availableForInput,false);
 assert.equal(trusted.resources[1].availableForInput,true);
 assert.equal(trusted.resources[2].availableForInput,true);
 const noOverride=trustedChatterExecutionFlow(published,{Body:'hello'});
 assert.equal(noOverride.resources[1].availableForInput,false);
});
