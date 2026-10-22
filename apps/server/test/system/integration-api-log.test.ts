import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createIntegrationCommunicationWriter,writeIntegrationActivity} from '../../src/system-support/integration-api-log.js';

test('central integration writer records every attempt as tenant-scoped Communication metadata',async()=>{
 let actor:string|undefined,object:string|undefined,values:Record<string,unknown>|undefined;
 const db={query:async(sql:string,params:unknown[]=[])=>{
  assert.match(sql,/md_tenant_developer_accounts/);
  assert.deepEqual(params,['tenant-a']);
  return {rows:[{user_id:'tenant-system-user'}]};
 }} as never;
 const records={create:async(tenant:string,user:string,api:string,record:Record<string,unknown>)=>{
  assert.equal(tenant,'tenant-a');actor=user;object=api;values=record;return 'record-id';
 }} as never;
 const writer=createIntegrationCommunicationWriter(db,records);
 await writeIntegrationActivity(db,{
  tenantId:'tenant-a',direction:'Outbound',provider:'WhatsApp Credential',
  credentialId:'credential-a',actorUserId:'user-a',
  endpoint:'https://provider.example/messages?access_token=secret',
  method:'POST',statusCode:200,outcome:'success',durationMs:15,
  requestBytes:48,responseBytes:25
 },writer);
 assert.equal(actor,'tenant-system-user');
 assert.equal(object,'Communication');
 assert.equal(values?.Direction,'Outbound');
 assert.equal(values?.OwnerId,'user-a');
 assert.equal(values?.Channel,'Other');
 assert.equal(values?.Status,'Sent');
 assert.equal(values?.Recipient,'https://provider.example/messages');
 assert.equal(values?.RelatedObject,'IntegrationApiCall');
 assert.equal(values?.RelatedRecordId,'credential-a');
 assert.match(String(values?.Subject),/POST 200/);
 assert.match(String(values?.Body),/requestBytes/);
 assert.doesNotMatch(JSON.stringify(values),/access_token|secret/);
});

test('metadata mapping records one business Communication with the provider message ID',async()=>{
 let values:Record<string,unknown>|undefined;
 const db={query:async()=>({rows:[{user_id:'tenant-system-user'}]})} as never;
 const records={create:async(_tenant:string,_user:string,_object:string,record:Record<string,unknown>)=>{
  values=record;return 'record-id';
 }} as never;
 const writer=createIntegrationCommunicationWriter(db,records);
 await writer({
  tenantId:'tenant-a',direction:'Outbound',transport:'HTTP',provider:'WhatsApp',
  credentialId:'credential-a',actorUserId:'user-a',endpoint:'https://graph.example/v26.0/123/messages',
  method:'POST',statusCode:200,outcome:'success',durationMs:30,requestBytes:88,responseBytes:40,
  communication:{channel:'WhatsApp',name:'WhatsApp outbound',sender:'WhatsApp Business',
   recipient:'447700900123',body:'Hello',provider:'WhatsApp',externalMessageId:'wamid.123'}
 });
 assert.equal(values?.Channel,'WhatsApp');
 assert.equal(values?.Body,'Hello');
 assert.equal(values?.Recipient,'447700900123');
 assert.equal(values?.ExternalMessageId,'wamid.123');
 assert.match(String(values?.Subject),/POST 200/);
});

test('communication logging failures do not replace the provider result or leak secrets',async()=>{
 const original=console.error;
 let logged=false;
 console.error=(...args:unknown[])=>{
  logged=true;
  assert.doesNotMatch(args.map(String).join(' '),/secret|token|body/i);
 };
 try{
  await writeIntegrationActivity({query:async()=>{throw new Error('database failed with secret token');}} as never,{
   tenantId:'tenant-a',direction:'Inbound',transport:'Webhook',
   endpoint:'/api/inbound-webhooks/example?verify_token=secret',method:'POST',
   statusCode:503,outcome:'http_error',errorCode:'FLOW_UNAVAILABLE'
  },async()=>{throw new Error('database failure with secret token');});
  assert.equal(logged,true);
 }finally{console.error=original;}
});
