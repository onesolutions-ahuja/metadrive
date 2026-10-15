import assert from 'node:assert/strict';
import test from 'node:test';
import {authoriseChatterFlow} from '../src/chatter-flow-authorisation.js';
const id='447700900123',account='1234567890';
const row={Id:'inbound-1',Event_Type__c:'Message',Communication_Mode__c:'WhatsApp',
  Direction__c:'Incoming',Channel_Account__c:account,From_Number__c:id,
  To_Number__c:'447700900999',Assigned_User__c:'alice',Occurred_At__c:new Date().toISOString()};
const grant=(user:string,canSend=true,canAssign=true)=>({User_Id__c:user,Channel_Account__c:account,
  Active__c:true,Can_Read__c:true,Can_Send__c:canSend,Can_Assign__c:canAssign,View_All__c:false});
const ctx=()=>({tenantId:'tenant-a',userId:'alice',
  tenant:{records:{Communication_Records__c:[row],Chatter_Channel_Grant__c:[grant('alice'),grant('bob',false,false)]}},
  input:{ConversationId:JSON.stringify([account,id]),ChannelAccountId:account,
    RecipientPhone:'99999999999',AuthorisedCredentialId:'spoof',Body:'Hello!'},
  credentials:[{id:'trusted',protocol:'HTTPS',name:'WhatsApp',enabled:true,
    baseUrl:'https://graph.facebook.com/v22.0/'+account+'/',configuration:{PhoneNumberId:account}}],
  users:[{id:'alice',tenantId:'tenant-a',disabled:false},{id:'bob',tenantId:'tenant-a',disabled:false}]});
test('send replaces browser recipient and credential using signed inbound conversation mapping',()=>{
  const d=authoriseChatterFlow('CHATTER_SEND_MESSAGE',ctx());
  assert.equal(d?.ok,true);
  if(d?.ok){assert.equal(d.input.RecipientPhone,id);assert.equal(d.input.AuthorisedCredentialId,'trusted');assert.equal(d.input.AuthorisedMessagePath,'messages');}
});
test('ungranted and forged channel messages cannot send, Meta decides window eligibility',()=>{
  const no=ctx();no.tenant.records.Chatter_Channel_Grant__c=[];
  assert.equal(authoriseChatterFlow('CHATTER_SEND_MESSAGE',no)?.ok,false);
  const stale=ctx();stale.tenant.records.Communication_Records__c=[{...row,Occurred_At__c:'2020-01-01T00:00:00Z'}];
  assert.equal(authoriseChatterFlow('CHATTER_SEND_MESSAGE',stale)?.ok,true);
  const forged=ctx();forged.input.ChannelAccountId='another-account';
  assert.equal(authoriseChatterFlow('CHATTER_SEND_MESSAGE',forged)?.ok,false);
});
test('assignment validates assignee channel access and derives record id',()=>{
  const context=ctx();
  const allowed=authoriseChatterFlow('CHATTER_ASSIGN_CONVERSATION',{...context,
    input:{ConversationId:JSON.stringify([account,id]),ChannelAccountId:account,AssigneeId:'bob',TargetRecordId:'forged'}});
  assert.equal(allowed?.ok,true);
  if(allowed?.ok)assert.equal(allowed.input.TargetRecordId,'inbound-1');
  const denied=authoriseChatterFlow('CHATTER_ASSIGN_CONVERSATION',{...context,
    input:{ConversationId:JSON.stringify([account,id]),ChannelAccountId:account,AssigneeId:'other'}});
  assert.equal(denied?.ok,false);
});

test('new outbound chat requires a tenant-scoped sending grant and derives trusted recipient',()=>{
  const context=ctx();context.tenant.records.Communication_Records__c=[];
  const send=authoriseChatterFlow('CHATTER_SEND_MESSAGE',context);
  assert.equal(send?.ok,true);
  if(send?.ok){assert.equal(send.input.RecipientPhone,id);assert.equal(send.input.AssignedUserId,'alice');}
  context.tenant.records.Chatter_Channel_Grant__c=[];
  assert.equal(authoriseChatterFlow('CHATTER_SEND_MESSAGE',context)?.ok,false);
});

test('version-only Meta credential uses trusted configured phone number for account-specific path',()=>{
  const c=ctx();c.credentials=[{...c.credentials[0],baseUrl:'https://graph.facebook.com/v22.0'}];
  const decision=authoriseChatterFlow('CHATTER_SEND_MESSAGE',c);
  assert.equal(decision?.ok,true);
  if(decision?.ok)assert.equal(decision.input.AuthorisedMessagePath,account+'/messages');
});
