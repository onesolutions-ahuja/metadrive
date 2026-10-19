import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PoolClient} from 'pg';
import {encodeMetadataValue} from '../../src/system-files/component-runtime.js';
import {executeFlowSubflow} from '../../src/system-files/flow-subflow-runtime.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

const tenant='00000000-0000-4000-8000-000000000001';
const user='00000000-0000-4000-8000-000000000002';
const childId='00000000-0000-4000-8000-000000000003';

function editorRows() {
 const graph={elements:[{id:1,type:'Start'}],resources:[
  {name:'count',type:'Variable',dataType:'Number',availableForInput:true},
  {name:'total',type:'Variable',dataType:'Number',availableForOutput:true}
 ]};
 const values:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(graph,'/builder',values);
 return values.map(value=>({
  property_path:value.path,value_kind:value.kind,value_text:value.text
 }));
}

test('Subflow maps enabled scalar inputs and outputs inside the caller transaction',async()=>{
 const persisted:Array<{sql:string;params:unknown[]}>=[],permissions:string[]=[];
 const client={
  query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
   persisted.push({sql,params});
   if(sql.includes('FROM md_flow_definitions'))return {rows:[{
    id:childId,flow_type:'Autolaunched Flow'
   }]};
   if(sql.includes('FROM md_flow_editor_values'))return {rows:editorRows()};
   if(sql.includes('INSERT INTO md_flow_runs'))return {rows:[{id:childId}]};
   return {rows:[]};
  }
 } as unknown as PoolClient;
 const rbac={require:async(_tenant:string,_user:string,resource:string)=>{
  permissions.push(resource);
 }} as unknown as RbacEngine;
 const assigned:Record<string,string|number|boolean|null>={};
 await executeFlowSubflow({
 client,tenantId:tenant,userId:user,initiatingUserId:'00000000-0000-4000-8000-000000000004',config:{
   flowApiName:'CalculateTotal',inputValues:'count={!ParentCount}',
   outputValues:'total=ParentTotal'
  },rbac,callStack:['ParentFlow'],
  evaluate:value=>value==='{!ParentCount}'?42:value,
  set:(name,value)=>{assigned[String(name)]=value},
  advance:async(runId,callStack)=>{
   assert.equal(runId,childId);
   assert.deepEqual(callStack,['ParentFlow','CalculateTotal']);
   return {status:'completed',outputs:{total:43}};
  }
 });
 assert.deepEqual(assigned,{ParentTotal:43});
 assert.deepEqual(permissions,['Flow:CalculateTotal']);
 const input=persisted.find(entry=>entry.sql.includes('INSERT INTO md_flow_run_inputs'));
 assert.deepEqual(input?.params,[tenant,childId,'count','42','number']);
 const run=persisted.find(entry=>entry.sql.includes('INSERT INTO md_flow_runs'));
 assert.deepEqual(run?.params,[tenant,childId,user,'00000000-0000-4000-8000-000000000004','User']);
});

test('Subflow rejects recursion before creating a child interview',async()=>{
 const client={query:async()=>({rows:[]})} as unknown as PoolClient;
 await assert.rejects(()=>executeFlowSubflow({
  client,tenantId:tenant,userId:user,config:{flowApiName:'ParentFlow'},
  rbac:{} as RbacEngine,callStack:['ParentFlow'],evaluate:value=>value,
  set:()=>{},advance:async()=>({status:'completed',outputs:{}})
 }),/Recursive Subflow invocation/);
});
