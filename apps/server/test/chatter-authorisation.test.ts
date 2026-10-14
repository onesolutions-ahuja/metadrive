import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessChatterRecord, chatterScopeForUser } from '../src/chatter-authorisation.js';
const tenant={records:{Chatter_Channel_Grant__c:[
  {User_Id__c:'alice',Channel_Account__c:'phone-a',Active__c:true,
    Can_Read__c:true,Can_Send__c:true,Can_Assign__c:false,View_All__c:false},
  {User_Id__c:'bob',Channel_Account__c:'phone-b',Active__c:true,
    Can_Read__c:true,Can_Send__c:false,Can_Assign__c:true,View_All__c:true}
]}};
const row={Event_Type__c:'Message',Communication_Mode__c:'WhatsApp',Channel_Account__c:'phone-a',Assigned_User__c:'alice'};
test('permission scope is tenant data derived, fail closed',()=>{
  assert.equal(canAccessChatterRecord('t','alice',tenant,row,'read'),true);
  assert.equal(canAccessChatterRecord('t','alice',tenant,row,'send'),true);
  assert.equal(canAccessChatterRecord('t','alice',tenant,row,'assign'),false);
  assert.equal(canAccessChatterRecord('t','bob',tenant,row,'read'),false);
  assert.equal(canAccessChatterRecord('t','alice',tenant,{...row,Channel_Account__c:''},'read'),false);
  assert.equal(canAccessChatterRecord('t','alice',{records:{}},row,'read'),false);
  assert.equal(chatterScopeForUser('t','alice',tenant).viewAllConversations,false);
  assert.equal(canAccessChatterRecord('t','alice',tenant,{...row,Assigned_User__c:'bob'},'read'),false);
  assert.equal(canAccessChatterRecord('t','bob',tenant,{...row,Channel_Account__c:'phone-b'},'read'),true);
});
