import test from 'node:test';
import assert from 'node:assert/strict';
import {assessRegistrySource,inspectRegistrySource,requiredTables} from '../apps/server/src/modules/metadata/registry-activation-preflight.mjs';
const columns=Object.fromEntries(Object.entries(requiredTables).map(([table,names])=>[table,[...names]]));
test('Phase 2 activation refuses ordinal-only legacy registry rows',()=>{
 const result=assessRegistrySource({...columns,metadrive_rel_library_components:['position']},
  {components:39,migrations:1,revisions:1});
 assert.equal(result.ready,false);
 assert.deepEqual(result.errors,['metadrive_rel_library_components.payload missing']);
 assert.equal(result.componentCount,39);
});
test('Phase 2 activation requires exact migration and revision markers',()=>{
 assert.equal(assessRegistrySource(columns,{components:3,migrations:1,revisions:1}).ready,true);
 assert.equal(assessRegistrySource(columns,{components:3,migrations:0,revisions:1}).ready,false);
 assert.equal(assessRegistrySource(columns,{components:3,migrations:1,revisions:2}).ready,false);
});
test('Phase 2 source preflight is read only, parameterised, and returns counts not records',async()=>{
 const calls=[];
 const client={query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('information_schema'))return {rows:Object.entries(columns).flatMap(([table,names])=>
   names.map(column_name=>({table_name:table,column_name})))};
  return {rows:[{components:'39',migrations:'1',revisions:'1'}]};
 }};
 const result=await inspectRegistrySource(client);
 assert.equal(result.ready,true);
 assert.equal(result.componentCount,39);
 assert.equal(calls.length,2);
 assert.deepEqual(calls[0].args,['public',Object.keys(requiredTables)]);
 assert.ok(calls.every(({sql})=>/^SELECT /i.test(sql)));
});

test('Phase 2 SQL registry supports the protected platform surface',async()=>{
 const {readFileSync}=await import('node:fs');
 const sql=readFileSync(new URL('../apps/server/sql/component-registry-v4.sql',import.meta.url),'utf8');
 assert.equal(sql.split("surface IN ('page','dashboard','flow','platform')").length-1,2);
});
