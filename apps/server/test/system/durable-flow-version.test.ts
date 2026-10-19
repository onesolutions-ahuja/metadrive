import assert from 'node:assert/strict';
import test from 'node:test';
import {DurableJobService} from '../../src/system-support/durable-job-service.js';
import {DurableJobWorker,type ClaimedJob} from '../../src/system-support/durable-job-worker.js';
import {registerFlowJobHandler} from '../../src/system-support/flow-job-handler.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {FlowRuntime} from '../../src/system-files/flow-runtime.js';
import type {PoolClient} from 'pg';

test('enqueued Flow persists published version',async()=>{
 let params:unknown[]=[];
 const db={query:async(_sql:string,values:unknown[])=>{params=values;return {rows:[{id:'job'}]};}} as unknown as SqlPersistence;
 await new DurableJobService(db).enqueue('tenant','flow.execute',{resourceId:'MyFlow',resourceVersion:3});
 assert.equal(params.at(-1),3);
});
test('durable Wait resume enqueue uses the interview transaction client',async()=>{
 let clientCalls=0,dbCalls=0;
 const client={query:async()=>{clientCalls++;return {rows:[{id:'resume-job'}]};}};
 const db=({query:async()=>{dbCalls++;throw new Error('Wait scheduling must stay in the transaction');}}) as unknown as SqlPersistence;
 const id=await new DurableJobService(db).enqueue('tenant','flow.resume',{
  actorUserId:'actor',resourceId:'00000000-0000-4000-8000-000000000001',
  resourceVersion:2,scheduledAt:new Date('2026-10-20T00:00:00.000Z'),
  idempotencyKey:'run:3'
 },client as unknown as PoolClient);
 assert.equal(id,'resume-job');
 assert.equal(clientCalls,1);
 assert.equal(dbCalls,0);
});
test('worker never executes a Flow when its published version has changed',async()=>{
 let calls=0;
 const job={id:'job',tenant_id:'t',job_type:'flow.execute',actor_user_id:'u',
  app_api_name:null,resource_id:'MyFlow',resource_version:2,attempt:1};
 const queries={query:async(sql:string)=>({
  rows:sql.includes('md_flow_editor_values')?[]:
   sql.includes('md_flow_definitions')?[{id:'flow'}]:[{id:'user'}]
 })} as unknown as SqlPersistence;
 const rbac={allowed:async()=>true} as unknown as RbacEngine;
 const flows={loadActive:async()=>({id:'newFlow',version:3}),execute:async()=>{calls++;}} as unknown as FlowRuntime;
 const service={
  claim:async()=>[job],
  complete:async()=>{throw new Error('Must not complete');},
  fail:async()=>{}
 } as unknown as DurableJobService;
 let auth:((x:ClaimedJob)=>Promise<boolean>)|undefined;
 const worker=new DurableJobWorker(service,j=>auth?.(j)??Promise.resolve(false),'worker');
 auth=registerFlowJobHandler(worker,queries,rbac,flows);
 assert.deepEqual(await worker.runOnce(),{claimed:1,completed:0,failed:1});
 assert.equal(calls,0);
});

test('worker refuses to replay Flow side effects on recovered lease',async()=>{
 let executed=0,failed=0;
 const job={id:'job',tenant_id:'t',job_type:'flow.execute',actor_user_id:'u',
  app_api_name:null,resource_id:'MyFlow',resource_version:2,attempt:2};
 const db={query:async(sql:string)=>({rows:sql.includes('md_flow_editor_values')?[]:
  sql.includes('md_flow_definitions')?[{id:'flow'}]:[{id:'user'}]})} as unknown as SqlPersistence;
 const rbac={allowed:async()=>true} as unknown as RbacEngine;
 const flows={loadActive:async()=>({id:'flow',version:2}),execute:async()=>{executed++;}} as unknown as FlowRuntime;
 const service={claim:async()=>[job],complete:async()=>{},fail:async()=>{failed++;}} as unknown as DurableJobService;
 let authorize:((job:ClaimedJob)=>Promise<boolean>)|undefined;
 const worker=new DurableJobWorker(service,j=>authorize?.(j)??Promise.resolve(false),'worker');
 authorize=registerFlowJobHandler(worker,db,rbac,flows);
 assert.deepEqual(await worker.runOnce(),{claimed:1,completed:0,failed:1});
 assert.equal(executed,0);
 assert.equal(failed,1);
});

test('durable Wait resumes only the authorized tenant interview and active version',async()=>{
 let resumeCalls=0;
 const job={id:'job',tenant_id:'tenant-a',job_type:'flow.resume',actor_user_id:'actor-a',
  app_api_name:null,resource_id:'00000000-0000-4000-8000-000000000001',
  resource_version:2,attempt:1};
 const db={query:async(sql:string,params:unknown[])=>{
  if(sql.includes('FROM md_users'))return {rows:params[0]==='tenant-a'&&params[1]==='actor-a'?[{id:'actor'}]:[]};
  if(sql.includes('FROM md_flow_runs'))return {rows:[{api_name:'WaitFlow'}]};
  if(sql.includes('FROM md_flow_editor_values'))return {rows:[]};
  throw new Error('Unexpected authorization query: '+sql);
 }} as unknown as SqlPersistence;
 const rbac={allowed:async(tenant:string,user:string,resource:string,action:string)=>
  tenant==='tenant-a'&&user==='actor-a'&&resource==='Flow:WaitFlow'&&action==='execute'
 } as unknown as RbacEngine;
 const flows={resumeWaitingInterview:async(tenant:string,user:string,id:string,version:number)=>{
  assert.deepEqual([tenant,user,id,version],['tenant-a','actor-a',job.resource_id,2]);
  resumeCalls++;
 }} as unknown as FlowRuntime;
 const service={claim:async()=>[job],complete:async()=>{},fail:async()=>{}} as unknown as DurableJobService;
 let authorize:((value:ClaimedJob)=>Promise<boolean>)|undefined;
 const worker=new DurableJobWorker(service,value=>authorize?.(value)??Promise.resolve(false),'worker');
 authorize=registerFlowJobHandler(worker,db,rbac,flows);
 assert.deepEqual(await worker.runOnce(),{claimed:1,completed:1,failed:0});
 assert.equal(resumeCalls,1);
});
