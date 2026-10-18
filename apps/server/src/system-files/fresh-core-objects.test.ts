import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FRESH_CORE_OBJECTS,seedFreshCoreObjects} from './fresh-core-objects.js';
import {FRESH_STANDARD_FIELDS} from './fresh-standard-fields.js';

test('fresh core contains precisely the approved 12 standard and 10 system objects',()=>{
 assert.equal(FRESH_CORE_OBJECTS.length,22);
 assert.equal(FRESH_CORE_OBJECTS.filter(x=>x.category==='standard').length,12);
 assert.equal(FRESH_CORE_OBJECTS.filter(x=>x.category==='system').length,10);
 assert.equal(new Set(FRESH_CORE_OBJECTS.map(x=>x.apiName)).size,22);
});
test('all lookup targets exist in fresh core and all fields have unique names',()=>{
 const names=new Set<string>(FRESH_CORE_OBJECTS.map(x=>x.apiName));
 for(const object of FRESH_CORE_OBJECTS){
  assert.equal(new Set(object.fields.map(x=>x.apiName)).size,object.fields.length);
  for(const field of object.fields)if('relatedObject' in field)assert.ok(names.has(field.relatedObject));
 }
});
test('fresh core seeds definitions only and reruns without overwriting customisations',async()=>{
 const statements:string[]=[];
 const client={query:async(sql:string,args:unknown[])=>{
  statements.push(sql);
  assert.equal(args[0],'new-tenant');
  assert.match(sql,/ON CONFLICT.*DO NOTHING/);
  return {rows:[],rowCount:1};
 }};
 await seedFreshCoreObjects(client as never,'new-tenant');
 assert.equal(statements.filter(sql=>sql.includes('md_object_definitions')).length,22);
 assert.equal(statements.filter(sql=>sql.includes('md_field_definitions')).length,FRESH_CORE_OBJECTS.reduce((sum,o)=>sum+o.fields.length+(o.category==='standard'?FRESH_STANDARD_FIELDS[o.apiName].length:0),0));
 assert.equal(statements.some(sql=>/INSERT INTO md_records|INSERT INTO md_record_values/.test(sql)),false);
});

test('standard fields are valid, related to the approved objects and unique',()=>{
 const objects=new Set<string>(FRESH_CORE_OBJECTS.map(o=>o.apiName));
 for(const obj of FRESH_CORE_OBJECTS.filter(o=>o.category==='standard')){
  const names=new Set(obj.fields.map(f=>f.apiName));
  for(const field of FRESH_STANDARD_FIELDS[obj.apiName]){
   assert.ok(!names.has(field.apiName),`Duplicate field ${obj.apiName}.${field.apiName}`);
   names.add(field.apiName);
   if('relatedObject' in field)assert.ok(objects.has(field.relatedObject));
   if('maxLength' in field)assert.ok(field.maxLength>0);
  }
 }
});
