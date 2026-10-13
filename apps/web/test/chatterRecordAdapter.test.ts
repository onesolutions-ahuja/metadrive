import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChatterView } from '../src/chatterRecordAdapter.js';

test('group communication rows by business number AND customer',()=>{
 const fields={Communication_Mode__c:'WhatsApp',Event_Type__c:'Message',From_Number__c:'4470001',Direction__c:'Incoming'};
 const result=buildChatterView([
  {Id:'1',...fields,Channel_Account__c:'a',Message_Body__c:'Hi',Occurred_At__c:'2026-10-13T10:00:00Z'},
  {Id:'2',...fields,Channel_Account__c:'b',Message_Body__c:'Different number',Occurred_At__c:'2026-10-13T11:00:00Z'},
  {Id:'3',...fields,Channel_Account__c:'a',Direction__c:'Outgoing',To_Number__c:'4470001',Message_Body__c:'Reply',Occurred_At__c:'2026-10-13T12:00:00Z'},
  {Id:'4',...fields,Message_Body__c:'Missing account'}
 ]);
 assert.equal(result.conversations.length,2);
 assert.equal(result.messages.length,3);
 assert.equal(result.conversations.find(x=>x.channelAccountId==='a')?.preview,'Reply');
 assert.equal(result.conversations.find(x=>x.channelAccountId==='a')?.unreadCount,1);
});
test('ignores non WhatsApp events and rows without trusted channel identifiers',()=>{
 assert.deepEqual(buildChatterView([{Id:'1',Communication_Mode__c:'API',Event_Type__c:'API Call'}]),
 {conversations:[],messages:[]});
});
