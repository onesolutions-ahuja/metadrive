import assert from 'node:assert/strict';
import test from 'node:test';
import {applyRecordViewAdapter} from '../apps/web/src/recordViewAdapterRegistry.ts';

test('registered Chatter adapter converts only supplied permission-filtered Communication rows',()=>{
 const props={recordViewAdapter:'Chatter',records:[
  {Id:'msg1',Event_Type__c:'Message',Communication_Mode__c:'WhatsApp',Direction__c:'Incoming',Channel_Account__c:'123456789012',From_Number__c:'447000111222',Message_Body__c:'Hello',Occurred_At__c:'2026-10-15T00:00:00Z'},
  {Id:'api1',Event_Type__c:'API Call',Communication_Mode__c:'API'}]};
 const result=applyRecordViewAdapter(props);
 assert.equal((result.conversations as Array<unknown>).length,1);
 assert.equal((result.messages as Array<unknown>).length,1);
 assert.equal((result.conversations as Array<{channelAccountId:string}>)[0].channelAccountId,'123456789012');
});
test('unknown adapters never bypass registered component input contract',()=>{
 const props={recordViewAdapter:'unknown',records:[]};
 assert.equal(applyRecordViewAdapter(props),props);
});
