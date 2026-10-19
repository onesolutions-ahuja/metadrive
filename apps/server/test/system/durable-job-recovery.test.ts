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
 assert.match(sql,/status='failed'/);
 assert.doesNotMatch(sql,/ELSE 'queued'/);
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

test('expired Flow leases are quarantined before any re-claim',async()=>{
 const statements:string[]=[];
 const db={transaction:async(fn:(c:{query:(q:string)=>Promise<unknown>})=>Promise<unknown>)=>fn({
  query:async(sql:string)=>{statements.push(sql);return {rows:[]};}
 })} as unknown as SqlPersistence;
 await new DurableJobService(db).claim('worker');
 assert.match(statements[0],/status='queued' AND scheduled_at<=now\(\)/);
 assert.doesNotMatch(statements[0],/status='leased' AND lease_until<now\(\)/);
 assert.ok(statements.some(q=>q.includes("job_type='flow.execute'")&&q.includes("FLOW_RECONCILIATION_REQUIRED")));
});

test('all expired leases enter manual reconciliation, including non-Flow jobs',async()=>{
 const statements:string[]=[];
 const db={transaction:async(fn:(c:{query:(q:string)=>Promise<unknown>})=>Promise<unknown>)=>fn({
  query:async(sql:string)=>{statements.push(sql);return {rows:[]};}
 })} as unknown as SqlPersistence;
 await new DurableJobService(db).claim('worker');
 const recovery=statements.filter(sql=>sql.includes("lease_until<now()"));
 assert.equal(recovery.length,1);
 assert.match(recovery[0],/status='failed'/);
 assert.match(recovery[0],/status='leased' AND lease_until<now\(\)/);
 assert.doesNotMatch(recovery[0],/job_type='flow.execute'/);
 assert.doesNotMatch(statements.join('\n'),/SET status='queued'.*lease_owner=NULL/s);
});

test('all uncertain handler failures require explicit operator retry',async()=>{
 let sql='';
 const db={query:async(q:string)=>{sql=q;return {rowCount:1};}} as unknown as SqlPersistence;
 await new DurableJobService(db).fail('tenant','job','worker','JOB_EXECUTION_FAILED');
 assert.match(sql,/status='failed'/);
 assert.doesNotMatch(sql,/ELSE 'queued'/);
 assert.match(sql,/lease_owner=\$3 AND lease_until>now\(\)/);
});
