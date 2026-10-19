import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {FlowRuntime} from '../../src/system-files/flow-runtime.js';
import type {DurableJobWorker} from '../../src/system-support/durable-job-worker.js';
import {registerFlowJobHandler} from '../../src/system-support/flow-job-handler.js';

test('Flow job eligibility requires an active tenant and enabled user at execution time',async()=>{
 let actorQuery='';
 const db={query:async(sql:string)=>{
  actorQuery=sql;return {rows:[]};
 }} as unknown as SqlPersistence;
 const worker={register:()=>{}} as unknown as DurableJobWorker;
 const authorize=registerFlowJobHandler(worker,db,{} as RbacEngine,{} as FlowRuntime);
 const allowed=await authorize({
  id:'job',tenant_id:'tenant',job_type:'flow.execute',actor_user_id:'actor',
  app_api_name:null,resource_id:'InvoiceFlow',resource_version:1,attempt:1
 });
 assert.equal(allowed,false);
 assert.match(actorQuery,/JOIN md_tenants t ON t.id=u.tenant_id AND t.status='ACTIVE'/);
 assert.match(actorQuery,/u.tenant_id=\$1 AND u.id=\$2 AND u.enabled=true/);
});
