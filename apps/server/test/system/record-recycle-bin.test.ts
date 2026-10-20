import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RecordEngine} from '../../src/system-files/record-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

const root='00000000-0000-4000-8000-000000000021';
const detail='00000000-0000-4000-8000-000000000022';
const group='00000000-0000-4000-8000-000000000023';
const actor='00000000-0000-4000-8000-000000000024';

test('Recycle Bin only exposes roots readable and deletable by the actor',async()=>{
  const checks:string[]=[];
  const db={query:async(sql:string)=>{
    checks.push(sql);
    if(sql.includes('count(*)::text AS total'))return {rows:[{total:'1'}],rowCount:1};
    return {rows:[{id:root,deleted_at:new Date('2026-10-20T00:00:00.000Z'),
      deleted_by:actor,deletion_group_id:group}],rowCount:1};
  }} as unknown as SqlPersistence;
  const rbac={require:async(_tenant:string,_user:string,resource:string,action:string)=>{
    checks.push(resource+':'+action);
  }} as unknown as RbacEngine;
  const result=await new RecordEngine(db,rbac).recycleBin('tenant',actor,'Invoice__c');
  assert.equal(result.total,1);
  assert.deepEqual(result.records[0],{
    Id:root,DeletedAt:'2026-10-20T00:00:00.000Z',DeletedBy:actor,DeletionGroupId:group
  });
  assert.ok(checks.includes('Invoice__c:read'));
  assert.ok(checks.includes('Invoice__c:delete'));
  assert.ok(checks.filter(text=>text.includes('md_record_access')).every(text=>
    text.includes('deletion_root_id=id')&&text.includes('is_deleted=true')));
});

test('restore unmarks the full Master-Detail deletion group with an audit entry',async()=>{
  const writes:string[]=[];
  const client={query:async(sql:string)=>{
    writes.push(sql);
    if(sql.includes('SELECT deletion_group_id,deletion_root_id'))
      return {rows:[{deletion_group_id:group,deletion_root_id:root}],rowCount:1};
    if(sql.includes('SELECT id,object_api FROM md_records'))
      return {rows:[{id:root,object_api:'Account__c'},
        {id:detail,object_api:'Invoice__c'}],rowCount:2};
    if(sql.includes('SELECT 1 FROM md_record_values v'))
      return {rows:[],rowCount:0};
    if(sql.includes('SELECT source_record_id,source_object_api'))
      return {rows:[],rowCount:0};
    if(sql.includes('FROM md_field_definitions WHERE tenant_id='))
      return {rows:[],rowCount:0};
    return {rows:[],rowCount:1};
  }};
  const db={transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)} as unknown as SqlPersistence;
  const rbac={require:async()=>{},requireRecord:async()=>{}} as unknown as RbacEngine;
  const outcome=await new RecordEngine(db,rbac).restore('tenant',actor,'Account__c',root);
  assert.deepEqual(outcome,{restored:2,unresolvedLookupLinks:0});
  assert.ok(writes.some(sql=>sql.startsWith('UPDATE md_records SET is_deleted=false')));
  assert.ok(writes.some(sql=>sql.includes("'restore')")));
  assert.ok(!writes.some(sql=>sql.startsWith('DELETE FROM md_deleted_lookup_links')),
    'unresolved recovery data must remain intact');
  assert.ok(writes.every(sql=>!sql.startsWith('DELETE FROM md_records')));
});

test('restore refuses a detail without its root and leaves tombstones unchanged',async()=>{
  const writes:string[]=[];
  const client={query:async(sql:string)=>{
    writes.push(sql);
    if(sql.includes('SELECT deletion_group_id,deletion_root_id'))
      return {rows:[{deletion_group_id:group,deletion_root_id:root}],rowCount:1};
    return {rows:[],rowCount:1};
  }};
  const db={transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)} as unknown as SqlPersistence;
  const rbac={require:async()=>{},requireRecord:async()=>{}} as unknown as RbacEngine;
  await assert.rejects(()=>new RecordEngine(db,rbac).restore('tenant',actor,'Invoice__c',detail),
    /Restore the deleted parent/);
  assert.ok(!writes.some(sql=>sql.startsWith('UPDATE md_records SET is_deleted=false')));
});
