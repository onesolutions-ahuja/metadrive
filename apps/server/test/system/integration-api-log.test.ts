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

test('SMTP deliveries are recorded as outbound Email Communications',async()=>{
 let values:Record<string,unknown>|undefined;
 const db={query:async()=>({rows:[{user_id:'tenant-system-user'}]})} as never;
 const records={create:async(_tenant:string,_user:string,_object:string,record:Record<string,unknown>)=>{
  values=record;return 'record-id';
 }} as never;
 await createIntegrationCommunicationWriter(db,records)({
  tenantId:'tenant-a',direction:'Outbound',transport:'SMTP',provider:'Tenant Mail',
  credentialId:'smtp-credential',actorUserId:'user-a',endpoint:'smtp://mail.example:587',
  method:'SMTP',outcome:'success',durationMs:20,requestBytes:64,
  communication:{channel:'Email',name:'Outbound email',
   relatedObject:'NamedCredential',relatedRecordId:'smtp-credential'}
 });
 assert.equal(values?.Direction,'Outbound');
 assert.equal(values?.Channel,'Email');
 assert.equal(values?.Status,'Sent');
 assert.equal(values?.Sender,'MetaDrive');
 assert.equal(values?.Recipient,'smtp://mail.example:587');
 assert.equal(values?.RelatedObject,'NamedCredential');
 assert.equal(values?.RelatedRecordId,'smtp-credential');
 assert.match(String(values?.Subject),/SMTP NO_RESPONSE · success/);
 assert.doesNotMatch(JSON.stringify(values),/customer@example.com|Order update|Your order shipped/);
});

test('communication logging failures do not replace provider results or leak secrets',async()=>{
 const original=console.error;
 const diagnostics:string[]=[];
 console.error=(...args:unknown[])=>{
  const message=args.map(String).join(' ');
  diagnostics.push(message);
  assert.doesNotMatch(message,/secret|token|access_token|database failure/i);
 };
 try{
  await assert.doesNotReject(()=>writeIntegrationActivity(
   {query:async()=>{throw new Error('database failed with secret token');}} as never,{
    tenantId:'tenant-a',direction:'Outbound',transport:'HTTP',
    endpoint:'https://provider.example/messages?access_token=secret',method:'POST',
    statusCode:200,outcome:'success'
   },async()=>{throw new Error('database failure with secret token');}
  ));
  assert.match(diagnostics.join(' '),/Integration Communication write failed/);
  await assert.doesNotReject(()=>writeIntegrationActivity(
   {query:async()=>({rows:[]})} as never,{
    tenantId:'tenant-a',direction:'Outbound',transport:'HTTP',
    endpoint:'https://provider.example/messages',method:'POST',outcome:'success'
   }
  ));
  assert.match(diagnostics.join(' '),/WriterNotConfigured/);
 }finally{console.error=original;}
});
