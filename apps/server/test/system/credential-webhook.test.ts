import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {test} from 'node:test';
import express from 'express';
import {registerInboundWebhookPublicRoutes} from '../../src/system-support/inbound-webhook-service.js';

test('credential-linked webhook accepts verified request, creates Communication, and does not execute a Flow',async()=>{
 const tenant='22222222-2222-4222-8222-222222222222';
 const endpoint='11111111-1111-4111-8111-111111111111';
 const token='webhook-verification-token-value';
 const secret='provider-app-secret-value';
 const communications:Array<Record<string,unknown>>=[];
 let flowsCalled=0;
 let state='received';
 const db={query:async(sql:string)=>{
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
 registerInboundWebhookPublicRoutes(app,db as never,
  {decryptOpaque:()=>secret} as never,
  {execute:async()=>{flowsCalled++;}} as never,
  {allowed:async()=>true} as never,
  {create:async(_tenant:string,_actor:string,object:string,values:Record<string,unknown>)=>{
   assert.equal(object,'Communication');communications.push(values);
  }} as never);
 const server=app.listen(0);
 try{
  const address=server.address();
  if(!address||typeof address==='string')throw Error('No server port');
  const base='http://127.0.0.1:'+address.port+'/api/inbound-webhooks/'+endpoint;
  const challenge=await fetch(base+'?hub.mode=subscribe&hub.verify_token='+token+'&hub.challenge=verified');
  assert.equal(challenge.status,200);
  assert.equal(await challenge.text(),'verified');
  const raw=JSON.stringify({object:'whatsapp_business_account',entry:[{
   changes:[{value:{messages:[{text:{body:'hello'}}],access_token:'private'}}]
  }]});
  const signature='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
  const invalid=await fetch(base,{method:'POST',headers:{'content-type':'application/json',
   'x-hub-signature-256':'sha256='+'0'.repeat(64)},body:raw});
  assert.equal(invalid.status,401);
  assert.equal(communications.length,0);
  for(let attempt=0;attempt<2;attempt++){
   const received=await fetch(base,{method:'POST',
    headers:{'content-type':'application/json','x-hub-signature-256':signature},body:raw});
   assert.equal(received.status,200);
  }
  assert.equal(communications.length,1);
  assert.equal(communications[0].Direction,'Inbound');
  assert.equal(communications[0].Provider,'WhatsApp');
  assert.doesNotMatch(String(communications[0].Body),/private/);
  assert.equal(flowsCalled,0);
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});

test('credential webhook Flow routing preserves the Communication archive',async()=>{
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
  {create:async(_tenant:string,_actor:string,object:string,values:Record<string,unknown>)=>{
   assert.equal(object,'Communication');assert.equal(values.Direction,'Inbound');archived++;
  }} as never);
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
  assert.equal(executed,1);
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
  assert.equal(executed,1);
  assert.equal(archived,2);
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});
