import assert from 'node:assert/strict';
import test from 'node:test';
import {encodeMetadataValue} from '../../src/system-files/component-runtime.js';
import type {FlowRuntime} from '../../src/system-files/flow-runtime.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {FlowRecordTriggers} from '../../src/system-files/flow-record-triggers.js';
import {DurableJobWorker,type ClaimedJob} from '../../src/system-support/durable-job-worker.js';
import type {DurableJobService} from '../../src/system-support/durable-job-service.js';
import {registerFlowJobHandler} from '../../src/system-support/flow-job-handler.js';

const tenant='00000000-0000-4000-8000-000000000001';
const actor='00000000-0000-4000-8000-000000000002';
const flowJob:ClaimedJob={
 id:'job-1',tenant_id:tenant,job_type:'flow.scheduled',actor_user_id:actor,
 app_api_name:'Billing',resource_id:'DailyFlow',resource_version:3,attempt:1
};

function makeHandler() {
 const metadata:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue({builder:{appApiName:'Billing'}},'',metadata);
 const db={
  query:async(sql:string):Promise<{rows:Array<Record<string,unknown>>}>=>{
   if(sql.includes('FROM md_users'))return {rows:[{id:actor}]};
   if(sql.includes("flow_type='Schedule-Triggered Flow'"))return {rows:[{id:'flow-id'}]};
   if(sql.includes('FROM md_flow_definitions'))return {rows:[{id:'flow-id'}]};
   if(sql.includes('FROM md_flow_editor_values'))return {rows:metadata.map(row=>({
    property_path:row.path,value_kind:row.kind,value_text:row.text
   }))};
   if(sql.includes('FROM md_apps a'))return {rows:[{id:'app-id'}]};
   throw new Error('Unexpected authorization SQL: '+sql);
  }
 } as unknown as SqlPersistence;
 const rbac={allowed:async()=>true} as unknown as RbacEngine;
 let executed=0;
 const flows={} as FlowRuntime;
 const triggers=({executeScheduledFlow:async()=>{executed++;return {records:0};}} as unknown as FlowRecordTriggers);
 let authorize:((job:ClaimedJob)=>Promise<boolean>)|undefined;
 const service={
  claim:async()=>[flowJob],
  complete:async()=>undefined,
  fail:async()=>undefined
 } as unknown as DurableJobService;
 const worker=new DurableJobWorker(service,job=>authorize?.(job)??Promise.resolve(false),'worker');
 authorize=registerFlowJobHandler(worker,db,rbac,flows,triggers);
 return {authorize,worker,executed:()=>executed};
}

test('scheduled Flow authorization binds active Flow, actor, app entitlement and configured app',async()=>{
 const {authorize}=makeHandler();
 assert.equal(await authorize(flowJob),true);
 assert.equal(await authorize({...flowJob,app_api_name:null}),false);
});

test('durable worker dispatches an authorized scheduled Flow through the shared trigger runtime',async()=>{
 const {worker,executed}=makeHandler();
 assert.deepEqual(await worker.runOnce(),{claimed:1,completed:1,failed:0});
 assert.equal(executed(),1);
});

test('durable worker dispatches a tenant Platform Event delivery through the shared trigger runtime',async()=>{
 const eventJob:ClaimedJob={...flowJob,id:'event-job',job_type:'flow.platform-event',
  app_api_name:null,resource_id:'00000000-0000-4000-8000-000000000031'};
 const db={
  query:async(sql:string):Promise<{rows:Array<Record<string,unknown>>}>=>{
   if(sql.includes('FROM md_users'))return {rows:[{id:actor}]};
   if(sql.includes('FROM md_platform_event_deliveries d'))
    return {rows:[{api_name:'EventFlow',app_api_name:null}]};
   throw new Error('Unexpected Platform Event authorization query: '+sql);
  }
 } as unknown as SqlPersistence;
 const rbac={allowed:async()=>true} as unknown as RbacEngine;
 let deliveries=0;
 const triggers={executePlatformEventDelivery:async()=>{deliveries++;}} as unknown as FlowRecordTriggers;
 const service={claim:async()=>[eventJob],complete:async()=>{},fail:async()=>{}} as unknown as DurableJobService;
 let authorize:((job:ClaimedJob)=>Promise<boolean>)|undefined;
 const worker=new DurableJobWorker(service,job=>authorize?.(job)??Promise.resolve(false),'worker');
 authorize=registerFlowJobHandler(worker,db,rbac,{} as FlowRuntime,triggers);
 assert.deepEqual(await worker.runOnce(),{claimed:1,completed:1,failed:0});
 assert.equal(deliveries,1);
});
