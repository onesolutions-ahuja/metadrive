import assert from 'node:assert/strict';
import test from 'node:test';
import {DurableJobService} from '../../src/system-support/durable-job-service.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';

test('job inspection is tenant-scoped and contains no execution secrets',async()=>{
 let query='';
 const db={query:async(sql:string,params:unknown[])=>{
  query=sql;
  assert.deepEqual(params,['tenant','job']);
  return {rows:[{id:'job',status:'failed',attempt:1,error_code:'JOB_EXECUTION_FAILED'}]};
 }} as unknown as SqlPersistence;
 const result=await new DurableJobService(db).inspect('tenant','job');
 assert.equal(result.status,'failed');
 assert.match(query,/WHERE tenant_id=\$1 AND id=\$2/);
 assert.equal(Object.hasOwn(result,'value_text'),false);
});
test('only terminal failed jobs can be cancelled',async()=>{
 let query='';
 const db={query:async(sql:string)=>{
  query=sql;
  return {rowCount:0};
 }} as unknown as SqlPersistence;
 await assert.rejects(()=>new DurableJobService(db).cancelFailed('tenant','job'),/Failed job not found/);
 assert.match(query,/status='failed'/);
});

test('ambiguous Flow retry is terminal rather than silently rescheduled',async()=>{
 let sql='';
 const db={query:async(q:string)=>{sql=q;return {rowCount:1};}} as unknown as SqlPersistence;
 await new DurableJobService(db).fail('tenant','job','worker','FLOW_RECONCILIATION_REQUIRED');
 assert.match(sql,/\$4='FLOW_RECONCILIATION_REQUIRED' THEN 'failed'/);
});
test('reconciliation is tenant-scoped and requires a failed job plus enabled reviewer',async()=>{
 let sql='';
 let params:unknown[]=[];
 const db={query:async(q:string,p:unknown[])=>{sql=q;params=p;return {rowCount:1};}} as unknown as SqlPersistence;
 await new DurableJobService(db).reconcileFailed('tenant','job','reviewer','acknowledge');
 assert.match(sql,/WHERE tenant_id=\$1 AND id=\$2 AND status='failed'/);
 assert.match(sql,/md_users WHERE tenant_id=\$1 AND id=\$3 AND enabled=true/);
 assert.deepEqual(params,['tenant','job','reviewer','acknowledge']);
 await assert.rejects(()=>new DurableJobService(db).reconcileFailed('tenant','job','reviewer','unsafe' as 'retry'),/Invalid job reconciliation/);
});
