import assert from 'node:assert/strict';
import test from 'node:test';
import {presentPageRecords} from '../src/recordPresentationAdapters';
const rows=[{Id:'one',Event_Type__c:'Message',Communication_Mode__c:'WhatsApp',
  Direction__c:'Incoming',Channel_Account__c:'1234567890',From_Number__c:'447700900123',
  Contact_Name__c:'Customer',Message_Body__c:'Hello',Occurred_At__c:'2026-10-14T21:00:00Z'}];
test('registered communication presenter denies ungranted channels',()=>{
  const denied=presentPageRecords('CommunicationThread',rows,{userId:'alice',viewAll:false,grants:[]});
  assert.deepEqual(denied.conversations,[]);
  assert.deepEqual(denied.messages,[]);
  assert.equal(denied.canSend,false);
});
test('granted channel renders messages with independent send and assignment rights',()=>{
  const visible=presentPageRecords('CommunicationThread',rows,{userId:'alice',viewAll:false,
    grants:[{channelAccountId:'1234567890',canRead:true,canSend:true,canAssign:false}]});
  assert.equal((visible.conversations as unknown[]).length,1);
  assert.equal((visible.messages as unknown[]).length,1);
  assert.equal(visible.canSend,true);
  assert.equal((visible.conversations as Array<{canAssign:boolean}>)[0].canAssign,false);
});
