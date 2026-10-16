import assert from 'node:assert/strict';
import test from 'node:test';
import {chatterRecordVisible,prepareChatterFlowInputs} from '../apps/server/src/modules/chatter/authorization.ts';

const user={tenantId:'tenant-a',userId:'alice'};
const phoneId='123456789012',contact='447000123456';
const conversationId=JSON.stringify([phoneId,contact]);
const now=new Date().toISOString();
function fixture(){
  const incoming={
    Id:'message-1',Communication_Mode__c:'WhatsApp',Event_Type__c:'Message',
    Direction__c:'Incoming',Channel_Account__c:phoneId,From_Number__c:contact,
    Occurred_At__c:now
  };
  return {
    pages:[{apiName:'UNE_CHATTER',status:'Active'}],
    records:{
      Communication_Records__c:[incoming],
      Chatter_Channel_Account__c:[{Active__c:true,Phone_Number_Id__c:phoneId,
        Named_Credential_Id__c:'credential-a',Display_Number__c:'447000999999'}],
      Chatter_Channel_Grant__c:[{Active__c:true,User_Id__c:'alice',Channel_Account__c:phoneId,
        Can_Read__c:true,Can_Send__c:true,Can_Assign__c:false,View_All__c:false}]
    },
    namedCredentials:[{id:'credential-a',protocol:'HTTPS',baseUrl:'https://graph.facebook.com/v22.0/',enabled:true}]
  };
}
const users=[{id:'alice',tenantId:'tenant-a',disabled:false},{id:'bob',tenantId:'tenant-a',disabled:false}];
const send={ConversationId:conversationId,ChannelAccountId:phoneId,RecipientPhone:contact,Body:'Hi'};
test('server injects its own credential and ignores forged client credential',()=>{
  const result=prepareChatterFlowInputs(fixture(),user,'CHATTER_SEND_MESSAGE',
    {...send,CredentialId:'forged',PhoneNumberId:'other'},users);
  assert.equal(result.error,undefined);
  assert.equal(result.inputs.CredentialId,'credential-a');
  assert.equal(result.inputs.PhoneNumberId,phoneId);
  assert.equal(result.inputs.Body,'Hi');
});
test('ungranted or cross-tenant agents cannot see, send or assign',()=>{
  const data=fixture(); data.records.Chatter_Channel_Grant__c=[];
  assert.equal(chatterRecordVisible(data,user,data.records.Communication_Records__c[0],'Read'),false);
  assert.ok(prepareChatterFlowInputs(data,user,'CHATTER_SEND_MESSAGE',send,users).error);
  const other={tenantId:'tenant-b',userId:'alice'};
  assert.ok(prepareChatterFlowInputs(fixture(),other,'CHATTER_SEND_MESSAGE',send,users).error);
});
test('replies reject other numbers and stale inbound windows',()=>{
  const data=fixture();
  assert.ok(prepareChatterFlowInputs(data,user,'CHATTER_SEND_MESSAGE',
    {...send,RecipientPhone:'447000222222'},users).error);
  data.records.Communication_Records__c[0].Occurred_At__c='2020-01-01T00:00:00.000Z';
  assert.match(prepareChatterFlowInputs(data,user,'CHATTER_SEND_MESSAGE',send,users).error,/24-hour/);
});
test('assigned conversations and assignment require explicit per-account grant',()=>{
  const data=fixture();
  data.records.Communication_Records__c[0].Assigned_User__c='bob';
  assert.equal(chatterRecordVisible(data,user,data.records.Communication_Records__c[0],'Read'),false);
  assert.ok(prepareChatterFlowInputs(data,user,'CHATTER_ASSIGN_CONVERSATION',
    {ConversationId:conversationId,ChannelAccountId:phoneId,TargetUserId:'alice'},users).error);
  data.records.Communication_Records__c[0].Assigned_User__c='';
  data.records.Chatter_Channel_Grant__c[0].Can_Assign__c=true;
  const assigned=prepareChatterFlowInputs(data,user,'CHATTER_ASSIGN_CONVERSATION',
    {ConversationId:conversationId,ChannelAccountId:phoneId,TargetUserId:'bob'},users);
  assert.equal(assigned.error,undefined);
  assert.equal(assigned.inputs.TargetUserId,'bob');
});
