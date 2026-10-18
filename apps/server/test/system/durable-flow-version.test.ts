import assert from 'node:assert/strict';
import test from 'node:test';
import {DurableJobService} from '../../src/system-support/durable-job-service.js';
import {DurableJobWorker} from '../../src/system-support/durable-job-worker.js';
import {registerFlowJobHandler} from '../../src/system-support/flow-job-handler.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {FlowRuntime} from '../../src/system-files/flow-runtime.js';

test('enqueued Flow persists published version',async()=>{
 let params:unknown[]=[];
 const db={query:async(_sql:string,values:unknown[])=>{params=values;return {rows:[{id:'job'}]};}} as unknown as SqlPersistence;
 await new DurableJobService(db).enqueue('tenant','flow.execute',{resourceId:'MyFlow',resourceVersion:3});
 assert.equal(params.at(-1),3);
});
test('worker never executes a Flow when its published version has changed',async()=>{
 let calls=0;
 const job={id:'job',tenant_id:'t',job_type:'flow.execute',actor_user_id:'u',
  app_api_name:null,resource_id:'MyFlow',resource_version:2,attempt:1};
 const queries={query:async(sql:string)=>({
  rows:sql.includes('md_flow_definitions')?[{id:'flow'}]:[{id:'user'}]
 })} as unknown as SqlPersistence;
 const rbac={allowed:async()=>true} as unknown as RbacEngine;
 const flows={loadActive:async()=>({id:'newFlow',version:3}),execute:async()=>{calls++;}} as unknown as FlowRuntime;
 const service={
  claim:async()=>[job],
  complete:async()=>{throw new Error('Must not complete');},
  fail:async()=>{}
 } as unknown as DurableJobService;
 let auth:((x:typeof job)=>Promise<boolean>)|undefined;
 const worker=new DurableJobWorker(service,j=>auth?.(j as typeof job)??Promise.resolve(false),'worker');
 auth=registerFlowJobHandler(worker,queries,rbac,flows);
 assert.deepEqual(await worker.runOnce(),{claimed:1,completed:0,failed:1});
 assert.equal(calls,0);
});
