import assert from 'node:assert/strict';
import test from 'node:test';
import {DurableJobService} from '../../src/system-support/durable-job-service.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';

test('recurring schedule has bounded and validated cadence',async()=>{
 const db={query:async()=>({rows:[{id:'j'}]})} as unknown as SqlPersistence;
 const jobs=new DurableJobService(db);
 await assert.rejects(jobs.enqueue('tenant','flow.execute',{recurrenceSeconds:30}),/Invalid recurring interval/);
 await assert.rejects(jobs.enqueue('tenant','flow.execute',{recurrenceSeconds:31536001}),/Invalid recurring interval/);
 assert.equal(await jobs.enqueue('tenant','flow.execute',{recurrenceSeconds:60}),'j');
});

test('successful recurring job reschedules atomically under owned lease',async()=>{
 let sql='';
 const db={query:async(text:string,parameters:unknown[])=>{
  sql=text;
  assert.deepEqual(parameters,['tenant','job','worker']);
  return {rowCount:1,rows:[]};
 }} as unknown as SqlPersistence;
 await new DurableJobService(db).complete('tenant','job','worker');
 assert.match(sql,/recurrence_seconds IS NULL THEN 'completed' ELSE 'queued'/);
 assert.match(sql,/scheduled_at \+ recurrence_seconds/);
 assert.match(sql,/lease_owner=\$3 AND lease_until>now\(\)/);
});

test('cancelled job cannot be completed by stale worker lease',async()=>{
 const db={query:async()=>({rowCount:0,rows:[]})} as unknown as SqlPersistence;
 await assert.rejects(
  new DurableJobService(db).complete('tenant','job','worker'),
  /Job lease missing or expired/
 );
});
