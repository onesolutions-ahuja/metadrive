import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RecordEngine} from '../../src/system-files/record-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';

function harness(deny=false,forbidRecord=false) {
 const permissions:string[]=[];const writes:string[]=[];let transactions=0;
 const client={query:async(sql:string,params:unknown[])=>{
   if(sql.includes('FROM md_field_default_formulas')||sql.includes('FROM md_validation_rules'))
    return {rows:[],rowCount:0};
  if(sql.includes('FROM md_field_definitions'))return {rows:[
   {api_name:'VAT_Applicable__c',data_type:'boolean',related_object:null,required:false,max_length:null}
  ],rowCount:1};
  if(sql.includes('FROM md_records WHERE'))return forbidRecord
   ?{rows:[],rowCount:0}
   :{rows:[{updated_at:new Date('2026-10-01T00:00:00Z')}],rowCount:1};
  if(sql.includes('SELECT value_text,reference_record_id FROM md_record_values'))
   return {rows:[{value_text:null,reference_record_id:null}],rowCount:1};
  if(sql.startsWith('INSERT')||sql.startsWith('UPDATE'))writes.push(sql);
  return {rows:[{id:a}],rowCount:1};
 }};
 const db={transaction:async(fn:(client:typeof client)=>Promise<unknown>)=>{
  transactions++;
  return fn(client);
 },query:async()=>{throw Error('Out-of-transaction SQL is forbidden for importing');}} as unknown as SqlPersistence;
 const rbac={allowedMany:async()=>[],require:async(t:string,u:string,resource:string,permission:string)=>{
  assert.equal(t,'tenant-a');assert.equal(u,'actor');
  permissions.push(resource+'.'+permission);
  if(deny)throw Error('Permission denied');
 }} as unknown as RbacEngine;
 return {engine:new RecordEngine(db,rbac),permissions,writes,get transactions(){return transactions;}};
}

test('Existing-product CSV import uses shared tenant-scoped update and history',async()=>{
 const h=harness();
 const result=await h.engine.importRecords('tenant-a','actor','Product',[
  {Id:a,VAT_Applicable__c:true},{Id:b,VAT_Applicable__c:false}]);
 assert.deepEqual(result,{count:2,mode:'update'});
 assert.equal(h.transactions,1);
 assert.equal(h.writes.filter(sql=>sql.includes('md_record_history')).length,2);
 assert.ok(h.writes.every(sql=>!sql.includes('DROP TABLE')));
 assert.deepEqual(h.permissions,[
  'Product.edit','Product.VAT_Applicable__c.edit','Product.read',
  'Product.edit','Product.VAT_Applicable__c.edit','Product.read']);
});

test('Import checks record visibility before business data writes',async()=>{
 const h=harness(false,true);
 await assert.rejects(()=>h.engine.importRecords('tenant-a','actor','Product',
  [{Id:a,VAT_Applicable__c:true}]),/Record not found/);
 assert.equal(h.writes.length,0);
});

test('Import fails closed on denied RBAC permissions',async()=>{
 const h=harness(true);
 await assert.rejects(()=>h.engine.importRecords('tenant-a','actor','Product',
  [{Id:a,VAT_Applicable__c:true}]),/Permission denied/);
 assert.equal(h.writes.length,0);
});

test('Import rejects mixed create/update, duplicate IDs and malformed data before SQL',async()=>{
 const h=harness();
 await assert.rejects(()=>h.engine.importRecords('tenant-a','actor','Product',
  [{Id:a,VAT_Applicable__c:true},{VAT_Applicable__c:false}]),/mix creates and updates/);
 await assert.rejects(()=>h.engine.importRecords('tenant-a','actor','Product',
  [{Id:a,VAT_Applicable__c:true},{Id:a,VAT_Applicable__c:false}]),/Duplicate import/);
 await assert.rejects(()=>h.engine.importRecords('tenant-a','actor','Product',
  [{Id:'not-a-uuid',VAT_Applicable__c:true}]),/Invalid import record ID/);
 await assert.rejects(()=>h.engine.importRecords('tenant-a','actor','Product',
  Array.from({length:201},()=>({VAT_Applicable__c:true}))),/batch size/);
 await assert.rejects(()=>h.engine.importRecords('tenant-a','actor','User',
  [{VAT_Applicable__c:true}]),/Invalid import object/);
 assert.equal(h.transactions,0);
});

test('Create-only import uses shared create pipeline',async()=>{
 const h=harness();
 const result=await h.engine.importRecords('tenant-a','actor','Product',
  [{VAT_Applicable__c:true}]);
 assert.deepEqual(result,{count:1,mode:'create'});
 assert.ok(h.permissions.includes('Product.create'));
 assert.ok(h.writes.some(sql=>sql.includes('md_records')));
});
