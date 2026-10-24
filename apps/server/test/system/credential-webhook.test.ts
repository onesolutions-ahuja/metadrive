import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {test} from 'node:test';
import express from 'express';
import {registerInboundWebhookPublicRoutes} from '../../src/system-support/inbound-webhook-service.js';
import {createIntegrationCommunicationWriter} from '../../src/system-support/integration-api-log.js';

test('credential-linked webhook accepts verified request, creates Communication, and does not execute a Flow',async()=>{
 const tenant='22222222-2222-4222-8222-222222222222';
 const endpoint='11111111-1111-4111-8111-111111111111';
 const token='webhook-verification-token-value';
 const secret='provider-app-secret-value';
 const communications:Array<Record<string,unknown>>=[];
 let flowsCalled=0;
 let state='received';
 const db={query:async(sql:string)=>{
  if(sql.includes('md_communication_logger_accounts'))return {rows:[{user_id:'tenant-system-user'}]};
  if(sql.includes('FROM md_records r'))return {rows:[]};
  if(sql.includes('FROM md_inbound_webhook_endpoints w'))return {rows:[{
   tenant_id:tenant,id:endpoint,api_name:'Credential_WhatsApp',flow_api:null,
   execution_user_id:null,created_by:'33333333-3333-4333-8333-333333333333',
   credential_name:'WhatsApp',provider:'HmacSha256',enabled:true,
   verify_token_digest:createHash('sha256').update(token).digest(),
   signature_secret_ciphertext:Buffer.from('secret'),encryption_key_id:'active'
  }]};
  if(sql.includes('INSERT INTO md_inbound_webhook_events'))
   return {rows:[{id:'44444444-4444-4444-8444-444444444444',status:state}]};
  if(sql.includes("SET status='completed'"))state='completed';
  return {rows:[]};
 }};
 const app=express();
 app.use(express.json({verify:(req,_res,raw)=>{
  (req as typeof req&{rawWebhookBody?:Buffer}).rawWebhookBody=Buffer.from(raw);
 }}));
 const recordEngine={create:async(_tenant:string,_actor:string,object:string,values:Record<string,unknown>)=>{
  assert.equal(object,'Communication');communications.push(values);
 }};
 const activityWriter=createIntegrationCommunicationWriter(db as never,recordEngine as never);
 registerInboundWebhookPublicRoutes(app,db as never,
  {decryptOpaque:()=>secret} as never,
  {execute:async()=>{flowsCalled++;}} as never,
  {allowed:async()=>true} as never,recordEngine as never,activityWriter);
 const server=app.listen(0);
 try{
  const address=server.address();
  if(!address||typeof address==='string')throw Error('No server port');
  const base='http://127.0.0.1:'+address.port+'/api/inbound-webhooks/'+endpoint;
  const challenge=await fetch(base+'?hub.mode=subscribe&hub.verify_token='+token+'&hub.challenge=verified');
  assert.equal(challenge.status,200);
  assert.equal(await challenge.text(),'verified');
  const raw=JSON.stringify({object:'whatsapp_business_account',entry:[{
   changes:[{value:{metadata:{display_phone_number:'15551234567',phone_number_id:'phone-id'},
    contacts:[{wa_id:'447700900123',profile:{name:'Test Sender'}}],
    messages:[{id:'wamid.test-message',from:'447700900123',timestamp:'1792690000',
     type:'text',text:{body:'hello'}}],access_token:'private'}}]
  }]});
  const signature='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
  const invalid=await fetch(base,{method:'POST',headers:{'content-type':'application/json',
   'x-hub-signature-256':'sha256='+'0'.repeat(64)},body:raw});
  assert.equal(invalid.status,401);
  // Verification and rejected attempts each get one generic activity record.
  assert.equal(communications.length,2);
  for(let attempt=0;attempt<2;attempt++){
   const received=await fetch(base,{method:'POST',
    headers:{'content-type':'application/json','x-hub-signature-256':signature},body:raw});
   assert.equal(received.status,200);
  }
  // The first successful message itself carries the attempt metadata; the retry is
  // a distinct HTTP attempt and therefore gets one generic activity record.
  assert.equal(communications.length,4);
  const message=communications.find(record=>record.ExternalMessageId==='wamid.test-message');
  assert.ok(message);
  assert.equal(message.Direction,'Inbound');
  assert.equal(message.Channel,'WhatsApp');
  assert.equal(message.Provider,'WhatsApp');
  assert.equal(message.Body,'hello');
  assert.equal(message.Sender,'Test Sender (447700900123)');
  assert.equal(message.Recipient,'15551234567');
  assert.equal(message.RelatedObject,'InboundWebhookEndpoint');
  assert.equal(message.RelatedRecordId,endpoint);
  assert.equal(message.ConversationId,'447700900123');
  assert.match(String(message.Subject),/POST 200 · success/);
  assert.match(String(message.Subject),/req \d+B\/resp \d+B/);
  assert.equal(communications.filter(record=>record.RelatedObject==='IntegrationApiCall').length,3);
  assert.doesNotMatch(JSON.stringify(communications),/private/);
  assert.equal(flowsCalled,0);
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});


test('credential webhook retries skip inbound message IDs already stored before a partial failure',async()=>{
 const tenant='22222222-2222-4222-8222-222222222222';
 const endpoint='11111111-1111-4111-8111-111111111111';
 const actor='33333333-3333-4333-8333-333333333333';
 const secret='provider-app-secret-value';
 const communications:Array<Record<string,unknown>>=[];
 let eventStatus='received';
 const db={query:async(sql:string,params:unknown[] = [])=>{
  if(sql.includes('md_communication_logger_accounts'))return {rows:[{user_id:'tenant-system-user'}]};
  if(sql.includes('FROM md_inbound_webhook_endpoints w'))return {rows:[{
   tenant_id:tenant,id:endpoint,api_name:'Credential_WhatsApp',flow_api:null,
   execution_user_id:actor,created_by:actor,credential_name:'WhatsApp',provider:'HmacSha256',
   enabled:true,verify_token_digest:createHash('sha256').update('token').digest(),
   signature_secret_ciphertext:Buffer.from('secret'),encryption_key_id:'active'
  }]};
  if(sql.includes('FROM md_records r'))
   return {rows:params[1]==='wamid.existing'?[{id:'existing-record'}]:[]};
  if(sql.includes('INSERT INTO md_inbound_webhook_events'))
   return {rows:[{id:'44444444-4444-4444-8444-444444444444',status:eventStatus}]};
  if(sql.includes("SET status='completed'"))eventStatus='completed';
  return {rows:[]};
 }};
 const app=express();
 app.use(express.json({verify:(req,_res,raw)=>{
  (req as typeof req&{rawWebhookBody?:Buffer}).rawWebhookBody=Buffer.from(raw);
 }}));
 const recordEngine={create:async(_tenant:string,_actor:string,object:string,values:Record<string,unknown>)=>{
  assert.equal(object,'Communication');communications.push(values);
 }};
 const writer=createIntegrationCommunicationWriter(db as never,recordEngine as never);
 registerInboundWebhookPublicRoutes(app,db as never,
  {decryptOpaque:()=>secret} as never,
  {execute:async()=>{throw new Error('credential webhooks must not invoke a Flow');}} as never,
  {allowed:async()=>true} as never,recordEngine as never,writer);
 const server=app.listen(0);
 try{
  const address=server.address();
  if(!address||typeof address==='string')throw Error('No server port');
  const raw=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{value:{
   metadata:{display_phone_number:'15551234567'},
   messages:[
    {id:'wamid.existing',from:'447700900123',timestamp:'1792690000',type:'text',text:{body:'already stored'}},
    {id:'wamid.new',from:'447700900456',timestamp:'1792690001',type:'text',text:{body:'new message'}}
   ]
  }}]}]});
  const signature='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
  const response=await fetch('http://127.0.0.1:'+address.port+'/api/inbound-webhooks/'+endpoint,{
   method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':signature},body:raw
  });
  assert.equal(response.status,200);
  assert.equal(communications.length,1);
  assert.equal(communications[0].ExternalMessageId,'wamid.new');
  assert.equal(communications[0].Body,'new message');
  assert.match(String(communications[0].Subject),/POST 200 · success/);
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});

test('credential webhook ingests Communication without invoking the app Flow',async()=>{
 const tenant='22222222-2222-4222-8222-222222222222';
 const endpoint='11111111-1111-4111-8111-111111111111';
 const actor='33333333-3333-4333-8333-333333333333';
 const secret='provider-app-secret-value';
 let executed=0,archived=0,status='received',flowActive=true;
 const db={query:async(sql:string)=>{
  if(sql.includes('FROM md_inbound_webhook_endpoints w'))return {rows:[{
   tenant_id:tenant,id:endpoint,api_name:'Credential_WhatsApp',
   flow_api:'AceChatterReceiveWebhook',execution_user_id:actor,created_by:actor,
   credential_name:'WhatsApp',provider:'HmacSha256',enabled:true,
   verify_token_digest:createHash('sha256').update('token').digest(),
   signature_secret_ciphertext:Buffer.from('secret'),encryption_key_id:'active'
  }]};
  if(sql.includes('SELECT 1 FROM md_flow_definitions'))return {rows:flowActive?[{ok:true}]:[]};
  if(sql.includes('INSERT INTO md_inbound_webhook_events'))
   return {rows:[{id:'44444444-4444-4444-8444-444444444444',status}]};
  if(sql.includes("SET status='completed'"))status='completed';
  return {rows:[]};
 }};
 const app=express();
 app.use(express.json({verify:(req,_res,raw)=>{
  (req as typeof req&{rawWebhookBody?:Buffer}).rawWebhookBody=Buffer.from(raw);
 }}));
 registerInboundWebhookPublicRoutes(app,db as never,
  {decryptOpaque:()=>secret} as never,
  {execute:async(_tenant:string,_flow:string,_actor:string,inputs:Record<string,unknown>)=>{
   assert.equal(typeof inputs.webhookPayloadJson,'string');executed++;
  }} as never,
  {allowed:async()=>true} as never,
  undefined,async input=>{
   assert.equal(input.direction,'Inbound');
   if(input.communication?.externalMessageId)archived++;
  });
 const server=app.listen(0);
 try{
  const address=server.address();
  if(!address||typeof address==='string')throw Error('No server port');
  const raw=JSON.stringify({object:'whatsapp_business_account',entry:[{
   changes:[{value:{messages:[{id:'wamid.test',text:{body:'hello'}}]}}]
  }]});
  const signature='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
  const url='http://127.0.0.1:'+address.port+'/api/inbound-webhooks/'+endpoint;
  for(let attempt=0;attempt<2;attempt++){
   const response=await fetch(url,{method:'POST',
    headers:{'content-type':'application/json','x-hub-signature-256':signature},body:raw});
   assert.equal(response.status,200);
  }
  assert.equal(executed,0);
  assert.equal(archived,1);
  // An uninstalled/deactivated optional Flow cannot interrupt a credential
  // webhook shared by other apps: keep archiving the verified provider event.
  flowActive=false;status='received';
  const secondRaw=raw.replace('wamid.test','wamid.next');
  const secondSignature='sha256='+createHmac('sha256',secret).update(secondRaw).digest('hex');
  const fallback=await fetch(url,{method:'POST',
   headers:{'content-type':'application/json','x-hub-signature-256':secondSignature},
   body:secondRaw});
  assert.equal(fallback.status,200);
  assert.equal(executed,0);
  assert.equal(archived,2);
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});

test('generic inbound webhook is journaled centrally without any configured Flow or direct CRUD',async()=>{
 const tenant='22222222-2222-4222-8222-222222222222';
 const endpoint='11111111-1111-4111-8111-111111111111';
 const secret='provider-app-secret-value';
 const received:Array<{outcome:string;provider:string;statusCode:number|undefined}>=[];
 const db={query:async(sql:string)=>{
  if(sql.includes('FROM md_inbound_webhook_endpoints w'))return {rows:[{
   tenant_id:tenant,id:endpoint,api_name:'GenericWebhook',flow_api:null,
   execution_user_id:null,created_by:'33333333-3333-4333-8333-333333333333',
   credential_name:null,provider:'HmacSha256',enabled:true,
   verify_token_digest:Buffer.alloc(32),signature_secret_ciphertext:Buffer.from('secret'),
   encryption_key_id:'active',channel_id:null,channel_name:null
  }]};
  if(sql.includes('INSERT INTO md_inbound_webhook_events'))
   return {rows:[{id:'44444444-4444-4444-8444-444444444444',status:'received'}]};
  return {rows:[]};
 }} as never;
 const app=express();
 app.use(express.json({verify:(req,_res,bytes)=>{
  (req as typeof req&{rawWebhookBody?:Buffer}).rawWebhookBody=Buffer.from(bytes);
 }}));
 registerInboundWebhookPublicRoutes(app,db,
  {decryptOpaque:()=>secret} as never,
  {execute:async()=>{throw new Error('Flow should not execute');}} as never,
  {allowed:async()=>true} as never,
  {create:async()=>{throw new Error('Direct CRUD bypass forbidden');}} as never,
  async input=>{received.push({outcome:input.outcome,provider:input.provider,
   statusCode:input.statusCode??undefined});});
 const server=app.listen(0);
 try{
  const addr=server.address();
  if(!addr||typeof addr==='string')throw Error('Missing port');
  const url='http://127.0.0.1:'+addr.port+'/api/inbound-webhooks/'+endpoint;
  const raw=JSON.stringify({event:'example',secret:'do-not-log'});
  const signature='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
  const invalid=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},
   body:raw});
  assert.equal(invalid.status,401);
  const valid=await fetch(url,{method:'POST',headers:{'content-type':'application/json',
   'x-hub-signature-256':signature},body:raw});
  assert.equal(valid.status,200);
  assert.deepEqual(received,[{outcome:'rejected',provider:'HmacSha256',statusCode:401},
   {outcome:'success',provider:'HmacSha256',statusCode:200}]);
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});
