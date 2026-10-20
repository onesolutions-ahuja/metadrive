import assert from 'node:assert/strict';
import {test} from 'node:test';
import {OutboundWebhookService} from '../../src/system-support/outbound-webhook-service.js';
import {OutboundWebhookDispatcher} from '../../src/system-support/outbound-webhook-worker.js';
import {toPermissionRule} from '../../src/system-support/permission-resource-map.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';

const credentialId='123e4567-e89b-42d3-a456-426614174000';

test('webhook permissions map to the central RBAC resource/action contract',()=>{
 assert.deepEqual(toPermissionRule('webhooks:manage'),
  {resource:'WebhookSubscription',action:'manage'});
 assert.deepEqual(toPermissionRule('httpCallouts:execute'),
  {resource:'HTTPCallout',action:'execute'});
 assert.deepEqual(toPermissionRule('platformEvents:subscribe'),
  {resource:'PlatformEvent',action:'subscribe'});
});

test('webhook subscription records its starting replay cursor without secrets',async()=>{
 const statements:string[]=[];
 const db=({
  query:async(sql:string)=>{
   statements.push(sql);
   if(sql.includes('credential_name'))
    return {rows:[{id:'hook-1',api_name:'NotifyInvoice',
     event_api_name:'Invoice_Event__e',credential_id:credentialId,
     credential_name:'BillingWebhook',relative_path:'events/invoice',
     enabled:true,start_replay_id:'8',created_at:new Date(0),updated_at:new Date(0)}]};
   if(sql.includes('md_system_definitions'))return {rows:[{ok:true}]};
   if(sql.includes('md_named_credentials'))return {rows:[{ok:true}]};
   if(sql.includes('FROM md_webhook_subscriptions'))
    return {rows:[]};
   throw new Error('Unexpected webhook query');
  },
  transaction:async<T>(operation:(client:{query:(sql:string,params?:unknown[])=>Promise<{
   rows:Array<Record<string,unknown>>;rowCount?:number
  }>})=>Promise<T>)=>operation({query:async(sql:string)=>{
   statements.push(sql);
   if(sql.includes('max(replay_id)'))return {rows:[{replay_id:'7'}]};
   if(sql.includes('INSERT INTO md_webhook_subscriptions'))return {rows:[]};
   throw new Error('Unexpected webhook transaction query');
  }})
 }) as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const result=await new OutboundWebhookService(db,rbac).save('tenant-1','user-1',{
  apiName:'NotifyInvoice',eventApiName:'Invoice_Event__e',namedCredentialId:credentialId,
  relativePath:'events/invoice'
 });
 assert.equal(result?.startReplayId,'8');
 assert.equal(result?.namedCredentialName,'BillingWebhook');
 assert.equal(Object.hasOwn(result??{},'secret'),false);
 assert.ok(statements.some(sql=>sql.includes('start_replay_id,enabled,created_by')));
});

test('webhook subscription input rejects unsafe URL and credential shapes before SQL',async()=>{
 let queried=false;
 const db=({query:async()=>{queried=true;return {rows:[]}}}) as unknown as SqlPersistence;
 const service=new OutboundWebhookService(db,{require:async()=>{}} as unknown as RbacEngine);
 await assert.rejects(()=>service.save('tenant-1','user-1',{
  apiName:'NotifyInvoice',eventApiName:'Invoice_Event__e',namedCredentialId:credentialId,
  relativePath:'//untrusted.example/receive'
 }),/Invalid webhook subscription/);
 assert.equal(queried,false);
});

test('webhook dispatcher durably queues one delivery per event subscription',async()=>{
 const calls:Array<{sql:string;args:unknown[]|undefined}>=[];
 const db=({
  transaction:async<T>(operation:(client:{query:(sql:string,args?:unknown[])=>Promise<{
   rows:Array<Record<string,unknown>>;rowCount?:number
  }>})=>Promise<T>)=>operation({query:async(sql,args)=>{
   calls.push({sql,args});
   if(sql.includes('FROM md_webhook_subscriptions s'))return {rows:[{
    tenant_id:'tenant-1',subscription_id:'subscription-1',event_id:'event-1',
    delivery_id:'delivery-1',actor_user_id:'user-1',api_name:'NotifyInvoice'
   }]};
   if(sql.includes('INSERT INTO md_webhook_deliveries'))return {rows:[{id:'delivery-1'}]};
   if(sql.includes('INSERT INTO md_durable_jobs'))return {rows:[{id:'job-1'}]};
   throw new Error('Unexpected webhook dispatch query');
  }})
 }) as unknown as SqlPersistence;
 const result=await new OutboundWebhookDispatcher(db).enqueuePending();
 assert.deepEqual(result,{deliveries:1,queued:1});
 const job=calls.find(call=>call.sql.includes('INSERT INTO md_durable_jobs'));
 assert.equal(job?.args?.[1],'webhook.deliver');
 assert.equal(job?.args?.[2],'user-1');
 assert.equal(job?.args?.[6],'webhook-delivery:delivery-1');
});
