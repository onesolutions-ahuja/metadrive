import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import {test} from 'node:test';
import express from 'express';
import {registerInboundWebhookPublicRoutes} from '../../src/system-support/inbound-webhook-service.js';

test('Meta verification and signatures are mandatory before an inbound Flow runs',async()=>{
 const token='whatsapp-test-verify-token-123456789';
 const secret='whatsapp-test-application-secret';
 const endpoint='11111111-1111-4111-8111-111111111111';
 const tenant='22222222-2222-4222-8222-222222222222';
 let called=0,inserted=0;
 const warningLogs:string[]=[];
 const originalWarn=console.warn;
 console.warn=(...args:unknown[])=>warningLogs.push(args.map(String).join(' '));
 const db={query:async(sql:string)=>{
  if(sql.includes('FROM md_inbound_webhook_endpoints w'))return {rows:[{
   tenant_id:tenant,id:endpoint,api_name:'Inbox',flow_api:'AceChatterReceive',
   execution_user_id:'actor',enabled:true,app_api:'AceChatter',provider:'Meta',
   verify_token_digest:createHash('sha256').update(token).digest(),
   signature_secret_ciphertext:Buffer.from('encrypted'),encryption_key_id:'active'
  }]};
  if(sql.includes('SELECT 1 FROM md_flow_definitions'))return {rows:[{ok:true}]};
  if(sql.includes('INSERT INTO md_inbound_webhook_events')){
   inserted++;return {rows:[{id:'event-1',status:'received'}]};
  }
  return {rows:[]};
 }};
 const app=express();
 app.use(express.json({verify:(req,_res,raw)=>{
  (req as typeof req&{rawWebhookBody?:Buffer}).rawWebhookBody=Buffer.from(raw);
 }}));
 registerInboundWebhookPublicRoutes(app,db as never,
  {decryptOpaque:()=>secret} as never,
  {execute:async()=>{called++;return {status:'completed'}}} as never,
  {allowed:async()=>true} as never,undefined,async()=>undefined);
 const server=app.listen(0);
 try{
  const address=server.address();
  if(!address||typeof address==='string')throw Error('No server port');
  const base='http://127.0.0.1:'+address.port+'/api/inbound-webhooks/'+endpoint;
  const bad=await fetch(base+'?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=hello');
  assert.equal(bad.status,403);
  const ok=await fetch(base+'?hub.mode=subscribe&hub.verify_token='+token+'&hub.challenge=hello');
  assert.equal(ok.status,200);assert.equal(await ok.text(),'hello');
  const raw=JSON.stringify({object:'whatsapp_business_account'});
  const invalid=await fetch(base,{method:'POST',
   headers:{'content-type':'application/json','x-hub-signature-256':'sha256='+'0'.repeat(64)},
   body:raw});
  assert.equal(invalid.status,401);assert.equal(called,0);assert.equal(inserted,0);
  assert.match(warningLogs.join(' '),/signature_mismatch/);
  assert.doesNotMatch(warningLogs.join(' '),/whatsapp-test-application-secret|whatsapp-test-verify-token/);
  const signature=createHmac('sha256',secret).update(raw).digest('hex');
  const valid=await fetch(base,{method:'POST',
   headers:{'content-type':'application/json','x-hub-signature-256':'sha256='+signature},body:raw});
  assert.equal(valid.status,200);assert.equal(called,1);assert.equal(inserted,1);
 }finally{
  console.warn=originalWarn;
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});
