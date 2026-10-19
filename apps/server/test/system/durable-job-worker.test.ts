import assert from 'node:assert/strict';
import test from 'node:test';
import {DurableJobWorker} from '../../src/system-support/durable-job-worker.js';
import type {DurableJobService} from '../../src/system-support/durable-job-service.js';

const job={id:'job-1',tenant_id:'tenant-a',job_type:'flow.execute',actor_user_id:'actor-a',
 app_api_name:'app-a',resource_id:'flow-a',attempt:1};

test('worker enforces authorizer before dispatch',async()=>{
 const calls:string[]=[];
 const service={
  claim:async()=>[job],
  complete:async()=>{calls.push('complete');},
  fail:async()=>{calls.push('fail');}
 } as unknown as DurableJobService;
 const worker=new DurableJobWorker(service,async()=>false,'worker-a');
 worker.register('flow.execute',async()=>{calls.push('execute');});
 assert.deepEqual(await worker.runOnce(),{claimed:1,completed:0,failed:1});
 assert.deepEqual(calls,['fail']);
});

test('worker dispatches only registered jobs, completing successful work',async()=>{
 const calls:string[]=[];
 const service={
  claim:async()=>[job,{...job,id:'job-2',job_type:'unknown'}],
  complete:async()=>{calls.push('complete');},
  fail:async()=>{calls.push('fail');}
 } as unknown as DurableJobService;
 const worker=new DurableJobWorker(service,async()=>true,'worker-a');
 worker.register('flow.execute',async()=>{calls.push('execute');});
 assert.deepEqual(await worker.runOnce(),{claimed:2,completed:1,failed:1});
 assert.deepEqual(calls,['execute','complete','fail']);
});

test('worker does not leak errors into durable failure reason',async()=>{
 let failureCode='';
 const service={
  claim:async()=>[job],
  complete:async()=>{throw Error('should not complete');},
  fail:async(_tenant:string,_id:string,_worker:string,code:string)=>{failureCode=code;}
 } as unknown as DurableJobService;
 const worker=new DurableJobWorker(service,async()=>true,'worker-a');
 worker.register('flow.execute',async()=>{throw Error('secret token');});
 const result=await worker.runOnce();
 assert.deepEqual(result,{claimed:1,completed:0,failed:1});
 assert.equal(failureCode,'JOB_EXECUTION_FAILED');
});

test('standalone worker dispatches both shared SQL job and HTTP queues',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../../src/system-support/job-worker-entrypoint.ts',import.meta.url),'utf8');
 assert.match(source,/await worker\.runOnce\(10\)/);
 assert.match(source,/await credentials\.dispatchOne\(\)/);
});
