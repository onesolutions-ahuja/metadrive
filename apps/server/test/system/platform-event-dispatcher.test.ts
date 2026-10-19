import assert from 'node:assert/strict';
import test from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {PlatformEventDispatcher} from '../../src/system-support/platform-event-dispatcher.js';

const event={id:'00000000-0000-4000-8000-000000000011',tenant_id:'tenant-a',
 event_api_name:'Order_Updated__e',status:'pending'};
const actor='00000000-0000-4000-8000-000000000012';
const subscription={id:'00000000-0000-4000-8000-000000000013',
 api_name:'OrderUpdatedFlow',version:7,app_api_name:null};

test('Platform Event dispatcher persists one tenant-authorized durable delivery per active subscriber',async()=>{
 const writes:Array<{sql:string;params:unknown[]}>=[];
 const client={
  query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
   writes.push({sql,params});
   if(sql.includes('FROM md_platform_event_messages'))return {rows:[event]};
   if(sql.includes('FROM md_system_definitions'))return {rows:[{id:'definition'}]};
   if(sql.includes('FROM md_tenant_automation_settings'))return {rows:[{flow_service_user_id:actor}]};
   if(sql.includes('FROM md_flow_trigger_subscriptions'))return {rows:[subscription]};
   if(sql.includes('INSERT INTO md_platform_event_deliveries'))return {rows:[{id:'delivery-id',status:'queued'}]};
   if(sql.includes('FROM md_platform_event_deliveries'))return {rows:[{id:'delivery-id'}]};
   if(sql.includes('INSERT INTO md_durable_jobs'))return {rows:[{id:'job-id'}]};
   return {rows:[]};
  }
 } as const;
 const db={
  transaction:async<T>(callback:(tx:typeof client)=>Promise<T>)=>callback(client),
  query:async()=>({rows:[]})
 } as unknown as SqlPersistence;
 const result=await new PlatformEventDispatcher(db).enqueuePending();
 assert.deepEqual(result,{events:1,queued:1});
 const job=writes.find(write=>write.sql.includes('INSERT INTO md_durable_jobs'));
 assert.ok(job);
 assert.equal(job.params[1],'flow.platform-event');
 assert.equal(job.params[2],actor);
 assert.equal(job.params[4],'delivery-id');
 assert.equal(job.params[9],7);
 assert.match(String(job.params[6]),/^platform-event-delivery:/);
});

test('Platform Event dispatcher rejects an event with more than 500 active subscribers',async()=>{
 const client={
  query:async(sql:string):Promise<{rows:Array<Record<string,unknown>>}>=>{
   if(sql.includes('FROM md_platform_event_messages'))return {rows:[event]};
   if(sql.includes('FROM md_system_definitions'))return {rows:[{id:'definition'}]};
   if(sql.includes('FROM md_tenant_automation_settings'))return {rows:[{flow_service_user_id:actor}]};
   if(sql.includes('FROM md_flow_trigger_subscriptions'))return {rows:Array.from({length:501},(_,index)=>({
    ...subscription,id:String(index)
   }))};
   return {rows:[]};
  }
 };
 const db={transaction:async<T>(callback:(tx:typeof client)=>Promise<T>)=>callback(client)} as unknown as SqlPersistence;
 await assert.rejects(new PlatformEventDispatcher(db).enqueuePending(),
  /subscriber limit exceeded/);
});
