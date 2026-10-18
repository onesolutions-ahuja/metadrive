import assert from 'node:assert/strict';
import {test} from 'node:test';
import {seedIndependentAppMetadata} from '../../src/system-files/app-metadata-seeder.js';
type Entry={sql:string;args:unknown[]};
function fake(existing:Record<string,unknown>={}) {
 const writes:Entry[]=[];
 const client={query:async(sql:string,args:unknown[]=[])=>{
  writes.push({sql,args});
  if(sql.includes("FROM md_permission_sets"))return {rows:[{id:'developer-set'}]};
  if(sql.includes('FROM md_field_definitions'))return {rows:existing.field?[existing.field]:[]};
  if(sql.includes('FROM md_component_definitions'))return {rows:existing.component?[existing.component]:[]};
  if(sql.includes('FROM md_object_definitions'))return {rows:existing.object?[{id:'existing'}]:[]};
  return {rows:[]};
 }};
 return {client,writes};
}
test('app extension reuses dependent Object and grants Object/Field CRUD',async()=>{
 const {client,writes}=fake({object:true});
 await seedIndependentAppMetadata(client as never,'tenant',{
  objects:[{apiName:'Product',label:'Product',fields:[{apiName:'Warranty',label:'Warranty',dataType:'text'}]}]});
 assert.equal(writes.some(x=>x.sql.startsWith('INSERT INTO md_object_definitions')),false);
 assert.ok(writes.some(x=>x.sql.startsWith('INSERT INTO md_field_definitions')));
 const grants=writes.filter(x=>x.sql.startsWith('INSERT INTO md_permission_rules')).map(x=>[x.args[2],x.args[3]]);
 for(const resource of ['Product','Product.Warranty'])
  for(const action of ['read','create','edit','delete'])assert.ok(grants.some(x=>x[0]===resource&&x[1]===action));
});
test('existing incompatible field fails before overwriting or granting it',async()=>{
 const {client,writes}=fake({object:true,field:{data_type:'number',related_object:null,max_length:null,required:false}});
 await assert.rejects(()=>seedIndependentAppMetadata(client as never,'tenant',{
  objects:[{apiName:'Product',label:'Product',fields:[{apiName:'Warranty',label:'Warranty',dataType:'text'}]}]}),/Incompatible existing field/);
 assert.equal(writes.some(x=>x.sql.startsWith('UPDATE md_field_definitions')),false);
});
test('duplicate fields inside package are rejected',async()=>{
 const {client}=fake();
 await assert.rejects(()=>seedIndependentAppMetadata(client as never,'tenant',{
  objects:[{apiName:'Product',label:'Product',fields:[
   {apiName:'Name',label:'Name',dataType:'text'},
   {apiName:'Name',label:'Name',dataType:'text'}]}]}),/Duplicate/);
});
