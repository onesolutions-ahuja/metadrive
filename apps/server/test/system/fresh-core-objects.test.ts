import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {FRESH_CORE_OBJECTS,seedFreshCoreObjects,seedCoreObjectsForExistingTenants} from '../../src/app-seeders/fresh-core-objects.js';
import {FRESH_STANDARD_FIELDS} from '../../src/app-seeders/fresh-standard-fields.js';

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
 assert.equal(statements.filter(sql=>sql.includes('md_field_definitions')).length,1+FRESH_CORE_OBJECTS.reduce((sum,o)=>sum+o.fields.length+(o.category==='standard'?FRESH_STANDARD_FIELDS[o.apiName].length:0),0));
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

test('existing tenants receive Core metadata exactly once via the versioned seeder',async()=>{
 const statements:string[]=[];
 const checksum=createHash('sha256').update(JSON.stringify([FRESH_CORE_OBJECTS,FRESH_STANDARD_FIELDS])).digest('hex');
 let applied=false;
 const client={query:async(sql:string,args:unknown[]=[])=>{
  statements.push(sql);
  if(sql.startsWith('SELECT checksum FROM md_system_migrations'))
   return {rows:applied?[{checksum}]:[],rowCount:applied?1:0};
  if(sql.startsWith('SELECT id FROM md_tenants'))
   return {rows:[{id:'existing-tenant'}],rowCount:1};
  if(sql.startsWith('INSERT INTO md_system_migrations')){
   assert.equal(args[1],checksum);applied=true;
  }
  if(sql.includes('INSERT INTO md_object_definitions')||sql.includes('INSERT INTO md_field_definitions')){
   assert.equal(args[0],'existing-tenant');
   assert.match(sql,/ON CONFLICT.*DO NOTHING/);
  }
  return {rows:[],rowCount:1};
 }};
 const db={transaction:async(run:(client:typeof client)=>Promise<number>)=>run(client)};
 assert.equal(await seedCoreObjectsForExistingTenants(db as never),1);
 assert.equal(statements.filter(sql=>sql.includes('INSERT INTO md_object_definitions')).length,22);
 assert.equal(statements.filter(sql=>sql.includes('INSERT INTO md_field_definitions')).length,
  1+FRESH_CORE_OBJECTS.reduce((total,o)=>total+o.fields.length+
   (o.category==='standard'?FRESH_STANDARD_FIELDS[o.apiName].length:0),0));
 // Idempotent reconciliation visits tenants again without overwriting seeded or customised fields.
 assert.equal(await seedCoreObjectsForExistingTenants(db as never),1);
 assert.equal(statements.filter(sql=>sql.startsWith('INSERT INTO md_system_migrations')).length,1);
});
test('existing Core seed versions cannot silently change after deployment',async()=>{
 const client={query:async(sql:string)=>{
  if(sql.startsWith('SELECT checksum FROM md_system_migrations'))return {rows:[{checksum:'outdated'}]};
  return {rows:[]};
 }};
 const db={transaction:async(run:(client:typeof client)=>Promise<number>)=>run(client)};
 await assert.rejects(seedCoreObjectsForExistingTenants(db as never),
  /Core object seeder changed after application/);
});
