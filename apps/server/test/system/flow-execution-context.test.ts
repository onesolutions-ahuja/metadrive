import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PoolClient} from 'pg';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {encodeMetadataValue} from '../../src/system-files/component-runtime.js';
import {FlowRuntime} from '../../src/system-files/flow-runtime.js';
import {resolveFlowExecutionActor} from '../../src/system-files/flow-execution-context.js';
import {validateFlowDraft} from '../../src/system-files/flow-validation.js';

const tenant='00000000-0000-4000-8000-000000000001';
const flow='OrderFlow';
const initiatingUser='00000000-0000-4000-8000-000000000002';
const approver='00000000-0000-4000-8000-000000000003';
const serviceUser='00000000-0000-4000-8000-000000000004';

test('User context keeps the invoking identity and does not read automation settings',async()=>{
 let queried=false;
 const db={query:async()=>{queried=true;throw new Error('Unexpected SQL lookup');}} as unknown as SqlPersistence;
 const actor=await resolveFlowExecutionActor(db,{} as RbacEngine,tenant,flow,initiatingUser,
  'User',null);
 assert.deepEqual(actor,{mode:'User',actorUserId:initiatingUser});
 assert.equal(queried,false);
});

test('System context fails closed unless approval and the tenant service user remain authorized',async()=>{
 const permissionChecks:Array<[string,string,string]>=[];
 const rbac={require:async(_tenant:string,user:string,resource:string,action:string)=>{
  permissionChecks.push([user,resource,action]);
  if(user===approver)throw new Error('Permission denied');
 }} as unknown as RbacEngine;
 const db={query:async()=>({rows:[{flow_service_user_id:serviceUser}]})} as unknown as SqlPersistence;
 await assert.rejects(()=>resolveFlowExecutionActor(db,rbac,tenant,flow,initiatingUser,
  'System',approver),/Permission denied/);
 assert.deepEqual(permissionChecks,[[approver,'FlowDefinition','system-context']]);
});

test('System context resolves to the enabled tenant service principal and checks its Flow grant',async()=>{
 const permissionChecks:Array<[string,string,string]>=[];
 const rbac={require:async(_tenant:string,user:string,resource:string,action:string)=>{
  permissionChecks.push([user,resource,action]);
 }} as unknown as RbacEngine;
 const db={query:async()=>({rows:[{flow_service_user_id:serviceUser}]})} as unknown as SqlPersistence;
 const actor=await resolveFlowExecutionActor(db,rbac,tenant,flow,initiatingUser,'System',approver);
 assert.deepEqual(actor,{mode:'System',actorUserId:serviceUser});
 assert.deepEqual(permissionChecks,[
  [approver,'FlowDefinition','system-context'],
  [serviceUser,'Flow:OrderFlow','execute']
 ]);
});

test('Flow validation rejects System context for Screen and before-save flows',async()=>{
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 for(const draft of [
  {apiName:flow,flowType:'Screen Flow'},
  {apiName:flow,flowType:'Record-Triggered Flow'}
 ]){
  const startConfig=draft.flowType==='Record-Triggered Flow'
   ?{object:'Account',trigger:'created',runWhen:'before-save',executionContext:'System'}
   :{executionContext:'System'};
  const result=await validateFlowDraft(rbac,tenant,initiatingUser,flow,{
   ...draft,elements:[
    {id:1,type:'Start',label:'Start',config:startConfig},
    {id:2,type:'End',label:'End',config:{}}
   ],connectors:[{from:1,to:2,label:'Default',kind:'normal'}],resources:[]
  });
  assert.ok(result.errors.some(error=>error.includes('System execution context is not supported')));
 }
});

test('System-context Flow start records initiator, service actor, and audit in the same transaction',async()=>{
 const graph={
  apiName:flow,flowType:'Autolaunched Flow',appApiName:null,
  elements:[{id:1,type:'Start',label:'Start',config:{executionContext:'System'}}],
  connectors:[],resources:[]
 };
 const encoded:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue({builder:graph},'',encoded);
 const checks:Array<[string,string,string]>=[];
 const writes:Array<{sql:string;params:readonly unknown[]}>=[];
 const db={
  query:async(sql:string)=>{
   if(sql.includes('SELECT id,version,system_context_approved_by'))
    return {rows:[{id:'flow-id',version:3,system_context_approved_by:approver}]};
   if(sql.includes('FROM md_flow_editor_values'))return {rows:encoded.map(row=>({
    property_path:row.path,value_kind:row.kind,value_text:row.text
   }))};
   if(sql.includes('FROM md_tenant_automation_settings'))
    return {rows:[{flow_service_user_id:serviceUser}]};
   throw new Error('Unexpected Flow-context SQL: '+sql);
  },
  transaction:async(run:(client:PoolClient)=>Promise<unknown>)=>run({
   query:async(sql:string,params:readonly unknown[]=[])=>{
    writes.push({sql,params});
    return {rows:sql.includes('INSERT INTO md_flow_runs')?[{id:'run-id'}]:[]};
   }
  } as unknown as PoolClient)
 } as unknown as SqlPersistence;
 const rbac={require:async(_tenant:string,user:string,resource:string,action:string)=>{
  checks.push([user,resource,action]);
 }} as unknown as RbacEngine;
 const runId=await new FlowRuntime(db,rbac).start(tenant,flow,initiatingUser);
 assert.equal(runId,'run-id');
 assert.deepEqual(checks,[
  [initiatingUser,'Flow:OrderFlow','execute'],
  [approver,'FlowDefinition','system-context'],
  [serviceUser,'Flow:OrderFlow','execute']
 ]);
 const insert=writes.find(write=>write.sql.includes('INSERT INTO md_flow_runs'));
 assert.deepEqual(insert?.params,[tenant,'flow-id',serviceUser,initiatingUser,'System']);
 const audit=writes.find(write=>write.sql.includes('INSERT INTO md_flow_execution_audit'));
 assert.deepEqual(audit?.params,[tenant,'flow-id','run-id',serviceUser,initiatingUser,
  'system-context-run']);
});

test('resuming a Flow fails closed when its app is no longer entitled',async()=>{
 const graph={
  appApiName:'Billing',
  elements:[{id:1,type:'Start',label:'Start',config:{}}],
  connectors:[]
 };
 const encoded:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue({builder:graph},'',encoded);
 const queries:string[]=[];
 const client={
  query:async(sql:string)=>{
   queries.push(sql);
   if(sql.includes('SELECT r.flow_id,f.api_name'))
    return {rows:[{flow_id:'flow-id',api_name:flow,flow_type:'Autolaunched Flow',
     version:1,started_by:initiatingUser,initiated_by:initiatingUser,
     execution_context:'User',system_context_approved_by:null,status:'pending'}]};
   if(sql.includes('FROM md_flow_editor_values'))return {rows:encoded.map(row=>({
    property_path:row.path,value_kind:row.kind,value_text:row.text
   }))};
   if(sql.includes('FROM md_apps a'))return {rows:[]};
   throw new Error('Unexpected Flow query: '+sql);
  }
 } as unknown as PoolClient;
 const rbac={require:async()=>undefined} as unknown as RbacEngine;
 const runtime=new FlowRuntime({} as SqlPersistence,rbac,{} as never);
 await assert.rejects(()=>runtime.advanceInterview(tenant,initiatingUser,
  '00000000-0000-4000-8000-000000000005',{},client),/not installed or entitled/);
 assert.ok(queries.some(sql=>sql.includes('FROM md_apps a')));
 assert.ok(queries[0].includes('f.active=true AND f.archived=false'));
 assert.ok(queries[0].includes('FOR UPDATE OF r,f'));
});
