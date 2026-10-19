import test from 'node:test';
import assert from 'node:assert/strict';
import {RecordEngine} from '../../src/system-files/record-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

test('typed filter requires Object and Field read and applies record SQL visibility',async()=>{
 const grants:string[]=[];
 const statements:string[]=[];
 const db={query:async(sql:string)=>{
  statements.push(sql);
  if(sql.includes('FROM md_field_definitions'))return {rows:[{data_type:'number'}]};
  return {rows:[{id:'one'}]};
 }} as unknown as SqlPersistence;
 const rbac={require:async(_tenant:string,_actor:string,res:string,action:string)=>{
  grants.push(res+'.'+action);
 }} as unknown as RbacEngine;
 const engine=new RecordEngine(db,rbac);
 assert.deepEqual(await engine.filterTyped('tenant','user','Account','Amount','gte','100',10,'desc'),['one']);
 assert.deepEqual(grants,['Account.read','Account.Amount.read']);
 assert.ok(statements.some(s=>s.includes('md_record_access')&&s.includes('value_number DESC')));
});

test('typed filter rejects unsupported sortable types and unsafe sort direction',async()=>{
 const db={query:async()=>({rows:[{data_type:'text'}]})} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const engine=new RecordEngine(db,rbac);
 await assert.rejects(()=>engine.filterTyped('t','u','Account','Name','eq','A'),/Invalid typed filter field/);
 await assert.rejects(()=>engine.filterTyped('t','u','Account','Amount','eq','1',20,'random' as 'asc'),/Invalid sort direction/);
});
