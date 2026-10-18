import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RecordEngine} from '../../src/system-files/record-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
test('single record read enforces Object and Field permissions and tenant scope',async()=>{
 const seen:unknown[][]=[];
 const db={query:async(_sql:string,args:unknown[])=>{seen.push(args);return {rows:[
  {id:'bbcf0d11-e7ee-41f6-8227-98ddcda29832',created_at:new Date(0),field_api:'Visible',value_text:'hello',reference_record_id:null,data_type:'text'},
  {id:'bbcf0d11-e7ee-41f6-8227-98ddcda29832',created_at:new Date(0),field_api:'Secret',value_text:'hidden',reference_record_id:null,data_type:'text'}
 ]};}} as unknown as SqlPersistence;
 const calls:string[]=[];
 const rbac={require:async(_t:string,_u:string,r:string,a:string)=>{calls.push(r+':'+a);},allowed:async(_t:string,_u:string,r:string)=>r==='Invoice.Visible'} as unknown as RbacEngine;
 const id='bbcf0d11-e7ee-41f6-8227-98ddcda29832';
 const record=await new RecordEngine(db,rbac).get('tenant-a','user-a','Invoice',id);
 assert.equal(record.Visible,'hello');
 assert.equal(record.Secret,undefined);
 assert.ok(calls.includes('Invoice:read'));
 assert.deepEqual(seen[0],['tenant-a','Invoice',id]);
});
