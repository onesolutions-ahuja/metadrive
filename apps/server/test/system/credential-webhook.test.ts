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
  assert.doesNotMatch(String(communications[0].Body),'private');
  assert.equal(flowsCalled,0);
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});
