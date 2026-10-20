import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ExternalIdUpsert} from '../../src/system-files/external-id-upsert.js';
const tenant='00000000-0000-4000-8000-000000000001';
const user='00000000-0000-4000-8000-000000000002';
const existing='00000000-0000-4000-8000-000000000003';
const created='00000000-0000-4000-8000-000000000004';
function fixture(found:{id:string}[]=[],caseSensitive=false){
 const queries:string[]=[],calls:string[]=[];
 const client={query:async(sql:string)=>{
  queries.push(sql);
  if(sql.includes('FROM md_field_definitions'))return {rows:[{data_type:'text',case_sensitive:caseSensitive}]};
  if(sql.includes('FROM md_records r'))return {rows:found};
  return {rows:[]};
 }};
 const db={transaction:async(fn:(client:typeof client)=>Promise<unknown>)=>fn(client)};
 const rbac={require:async()=>{},requireRecord:async()=>{}};
 const records={
  createWithTriggersInTransaction:async()=>{calls.push('create');return created},
  updateWithTriggersInTransaction:async()=>{calls.push('update')}
 };
 return {upsert:new ExternalIdUpsert(db as never,rbac as never,records as never),queries,calls};
}
test('external-ID upsert creates atomically when key absent',async()=>{
 const f=fixture();
 assert.deepEqual(await f.upsert.execute(tenant,user,'Contact','Email','test@example.com',{}),
  {id:created,created:true});
 assert.deepEqual(f.calls,['create']);
 assert.ok(f.queries.some(q=>q.includes('pg_advisory_xact_lock')));
});
test('external-ID upsert updates exactly one matching record',async()=>{
 const f=fixture([{id:existing}]);
 assert.deepEqual(await f.upsert.execute(tenant,user,'Contact','Email','test@example.com',{}),
  {id:existing,created:false});
 assert.deepEqual(f.calls,['update']);
});
test('upsert rejects ambiguous matches and inconsistent case-sensitive payloads',async()=>{
 const duplicate=fixture([{id:existing},{id:created}]);
 await assert.rejects(()=>duplicate.upsert.execute(tenant,user,'Contact','Email','test@example.com',{}),
  /Duplicate external ID matches/);
 const mismatch=fixture([],true);
 await assert.rejects(()=>mismatch.upsert.execute(tenant,user,'Contact','Email','AbC',{Email:'abc'}),
  /External ID path and payload mismatch/);
});
