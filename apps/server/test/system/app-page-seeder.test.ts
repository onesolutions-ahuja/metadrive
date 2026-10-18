import test from 'node:test';
import assert from 'node:assert/strict';
import {flattenAppProperties,expandAppProperties,seedAppPage} from '../../src/system-support/app-page-seeder.js';
import {conversationPageSeed} from '../../src/app-seeders/conversation.js';
import {FlowRuntime} from '../../src/system-files/flow-runtime.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {RecordEngine} from '../../src/system-files/record-engine.js';
import type {PoolClient} from 'pg';
const id='11111111-1111-4111-8111-111111111111';
test('relational app properties preserve types and stable references without JSON state',()=>{
 const props={objectApiName:'metadata:'+id,enabled:true,count:0,title:'',filters:[{field:'metadata:'+id,operator:'equals',value:'A'}],actionFlows:{send:{flowApiName:'metadata:'+id}}};
 const flat=flattenAppProperties(props);
 assert.equal(flat.find(x=>x.path==='objectApiName')?.objectId,id);
 const restored=expandAppProperties(flat.map(row=>({property_path:row.path,value_text:row.text,data_type:row.type,
  object_id:row.objectId,field_id:row.fieldId,flow_id:row.flowId})));
 assert.equal(JSON.stringify(restored),JSON.stringify(props));
 assert.throws(()=>flattenAppProperties(JSON.parse('{"__proto__":{"x":true}}')),/Invalid/);
 assert.throws(()=>flattenAppProperties({objectApiName:'metadata:bad'}),/Invalid/);
 assert.throws(()=>expandAppProperties([{property_path:'__proto__.polluted',value_text:'true',data_type:'boolean'}]),/Invalid/);
});
test('already-applied app seed performs no writes or customisation overwrites',async()=>{
 let writes=0;
 const client={query:async(sql:string)=>{
  if(sql.startsWith('SELECT page_id'))return {rows:[{page_id:id,component_id:id,version:2}]};
  writes++;throw Error('Unexpected write');
 }} as unknown as PoolClient;
 await seedAppPage(client,id,id,{key:'home',version:2,pageApiName:'AnyPage',title:'Any title',componentId:id,properties:{}});
 assert.equal(writes,0);
});
test('conversation app pack requires selected model dependencies, not fixed API names',()=>{
 const config={pageApiName:'AnyPage',title:'Messages',componentId:id,objectId:id,sendFlowId:id,
  fields:Object.fromEntries(['direction','account','from','to','occurred','body'].map(k=>[k,id])),
  incomingValue:'I',outgoingValue:'O',channelAccessPath:'/channel-access',sendInputs:{Body:'$event.body'}};
 const seed=conversationPageSeed(config);assert.equal(seed.properties.objectApiName,'metadata:'+id);
 assert.equal((seed.properties.actionFlows as any).send.flowApiName,'metadata:'+id);
 assert.throws(()=>conversationPageSeed({...config,fields:{}}),/must be selected/);
});
test('Flow returns only explicitly configured End outputs, never its other inputs',async()=>{
 const client={query:async(sql:string)=>{
  if(sql.includes('FROM md_flow_runs r JOIN'))return {rows:[{flow_id:'flow',started_by:'user',status:'pending',api_name:'AnyFlow'}]};
  if(sql.includes('FROM md_flow_nodes WHERE'))return {rows:[{id:'start',api_name:'start',node_type:'Start'},{id:'end',api_name:'end',node_type:'End'}]};
  if(sql.includes('FROM md_flow_edges'))return {rows:[{source_api:'start',target_api:'end',outcome:'default'}]};
  if(sql.includes('FROM md_flow_node_properties'))return {rows:[{node_id:'end',api_name:'output.State',value_text:'complete',data_type:'text'},
   {node_id:'end',api_name:'output.Request',value_text:'@request',data_type:'text'}]};
  if(sql.includes('FROM md_flow_run_inputs'))return {rows:[{api_name:'request',value_text:'one',data_type:'text'},
   {api_name:'private',value_text:'hidden',data_type:'text'}]};
  if(sql.startsWith('UPDATE md_flow_runs'))return {rows:[]};
  throw Error('Unexpected query');
 }};
 const db={transaction:async(fn:(c:typeof client)=>unknown)=>fn(client)} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const result=await new FlowRuntime(db,rbac,{} as RecordEngine).run('tenant','run','user');
 assert.deepEqual(result.outputs,{State:'complete',Request:'one'});
});
