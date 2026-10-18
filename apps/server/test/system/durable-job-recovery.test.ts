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
