import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PoolClient} from 'pg';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import {encodeMetadataValue} from '../../src/system-files/component-runtime.js';
import {FlowRecordTriggers} from '../../src/system-files/flow-record-triggers.js';
import {FlowRuntime} from '../../src/system-files/flow-runtime.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';

const tenant='00000000-0000-4000-8000-000000000001';
const user='00000000-0000-4000-8000-000000000002';
const recordId='00000000-0000-4000-8000-000000000003';
const flowRows=[
 {id:'00000000-0000-4000-8000-000000000011',api_name:'LaterFlow'},
 {id:'00000000-0000-4000-8000-000000000012',api_name:'FirstFlow'},
 {id:'00000000-0000-4000-8000-000000000013',api_name:'WrongObject'}
];
function metadata(object:string,order:number,trigger='created-or-updated',
 conditions:unknown[]=[],runWhen='after-save') {
 const graph={flowType:'Record-Triggered Flow',elements:[
  {id:1,type:'Start',label:'Start',config:{
   object,runWhen,trigger,triggerOrder:order,
   entryConditions:conditions,conditionLogic:'All'
  }},
  {id:2,type:'End',label:'End',config:{}}
 ],connectors:[{from:1,to:2,label:'Default',kind:'normal'}],resources:[]};
 const rows:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(graph,'/builder',rows);
 return rows.map(row=>({property_path:row.path,value_kind:row.kind,value_text:row.text}));
}

test('record-triggered Flows honor trigger conditions and trigger order transactionally',async()=>{
 const documents=new Map([
  [flowRows[0].id,metadata('Account',20,'created',[{field:'Status',operator:'Equals',value:'Active'}])],
  [flowRows[1].id,metadata('Account',2,'created',[{field:'Status',operator:'Equals',value:'Active'}])],
  [flowRows[2].id,metadata('Contact',1)]
 ]);
 const calls:Array<{tenant:string;user:string;runId:string}>=[];
 const runOrder:string[]=[];
 const client={
  query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
   if(sql.includes('FROM md_flow_definitions'))return {rows:flowRows};
   if(sql.includes('FROM md_flow_editor_values'))return {rows:documents.get(String(params[1]))??[]};
   if(sql.includes('INSERT INTO md_flow_runs')){
    runOrder.push(String(params[1]));return {rows:[{id:params[1]}]};
   }
   return {rows:[]};
  }
 } as unknown as PoolClient;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const flows={advanceInterview:async(_tenant:string,_user:string,runId:string)=>{
  calls.push({tenant:_tenant,user:_user,runId});return {status:'completed'};
 }} as never;
 const runtime=new FlowRecordTriggers(rbac,flows);
 await runtime.execute(client,tenant,user,'Account','created',
  {Id:recordId,Status:'Inactive'},null);
 assert.equal(calls.length,0);
 await runtime.execute(client,tenant,user,'Account','created',
  {Id:recordId,Status:'Active'},null);
 assert.deepEqual(calls.map(call=>call.tenant),[tenant,tenant]);
 assert.deepEqual(calls.map(call=>call.user),[user,user]);
 assert.deepEqual(runOrder,[flowRows[1].id,flowRows[0].id]);
});

test('Flow validation accepts supported before-save and after-save trigger paths',async()=>{
 const runtime=new FlowRuntime({} as SqlPersistence,{require:async()=>{}} as unknown as RbacEngine);
 const draft={apiName:'AccountTrigger',flowType:'Record-Triggered Flow',
  elements:[
   {id:1,type:'Start',label:'Start',config:{
    object:'Account',trigger:'created-or-updated',runWhen:'after-save',triggerOrder:10
   }},
   {id:2,type:'End',label:'End',config:{}}
  ],
  connectors:[{from:1,to:2,label:'Default',kind:'normal'}],resources:[]};
 assert.equal((await runtime.validateDraft(tenant,user,'AccountTrigger',draft)).valid,true);
 const beforeSave={...draft,elements:draft.elements.map(element=>element.id===1
  ?{...element,config:{...element.config,runWhen:'before-save'}}:element)};
 assert.equal((await runtime.validateDraft(tenant,user,'AccountTrigger',beforeSave)).valid,true);
 const assignment={...beforeSave,elements:[
  beforeSave.elements[0],
  {id:3,type:'Assignment',label:'Set Name',config:{variable:'$Record.Name',operator:'Assign',value:'Updated'}},
  {id:2,type:'End',label:'End',config:{}}
 ],connectors:[{from:1,to:3,label:'Default',kind:'normal'},{from:3,to:2,label:'Default',kind:'normal'}]};
 assert.equal((await runtime.validateDraft(tenant,user,'AccountTrigger',assignment)).valid,true);
 const unsupported={...assignment,elements:[
  ...assignment.elements,
  {id:4,type:'Create Records',label:'Create',config:{object:'Contact'}}
 ]};
 const result=await runtime.validateDraft(tenant,user,'AccountTrigger',unsupported);
 assert.equal(result.valid,false);
 assert.ok(result.errors.some(error=>error.includes('Before-save Record-Triggered Flows support only')));
});

test('before-save dispatch returns $Record updates from ordered Flow interviews',async()=>{
 const flow=flowRows[0];
 const documents=new Map([[flow.id,metadata('Account',10,'created',[],'before-save')]]);
 const client={
  query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
   if(sql.includes('FROM md_flow_definitions'))return {rows:[flow]};
   if(sql.includes('FROM md_flow_editor_values'))return {rows:documents.get(String(params[1]))??[]};
   if(sql.includes('INSERT INTO md_flow_runs'))return {rows:[{id:params[1]}]};
   return {rows:[]};
  }
 } as unknown as PoolClient;
 const runtime=new FlowRecordTriggers({require:async()=>{}} as unknown as RbacEngine,{
  advanceInterview:async()=>({status:'completed',record:{Name:'Updated before save'}})
 } as never);
 const result=await runtime.execute(client,tenant,user,'Account','created',
  {Name:'Original'},null,'before-save');
 assert.deepEqual(result,{Name:'Updated before save'});
});

test('FlowRuntime applies before-save Assignment to the persisted $Record resource',async()=>{
 const graph={flowType:'Record-Triggered Flow',elements:[
  {id:1,type:'Start',label:'Start',config:{object:'Account',runWhen:'before-save'}},
  {id:2,type:'Assignment',label:'Set Name',config:{
   variable:'$Record.Name',operator:'Assign',value:'New Name'
  }},
  {id:3,type:'End',label:'End',config:{}}
 ],connectors:[
  {from:1,to:2,label:'Default',kind:'normal'},
  {from:2,to:3,label:'Default',kind:'normal'}
 ],resources:[]};
 const metadataRows:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(graph,'/builder',metadataRows);
 const editorRows=metadataRows.map(row=>({
  property_path:row.path,value_kind:row.kind,value_text:row.text
 }));
 const client={
  query:async(sql:string):Promise<{rows:Array<Record<string,unknown>>}>=>{
   if(sql.includes('SELECT r.flow_id,f.api_name'))return {rows:[{
    flow_id:flowRows[0].id,api_name:'BeforeSaveFlow',flow_type:'Record-Triggered Flow',
    started_by:user,status:'pending'
   }]};
   if(sql.includes('FROM md_flow_editor_values'))return {rows:editorRows};
   if(sql.includes('FROM md_flow_interview_state'))return {rows:[{
    current_element:1,history_elements:[],step_count:0
   }]};
   if(sql.includes('FROM md_flow_interview_loop_state')
     ||sql.includes('FROM md_flow_run_inputs')
     ||sql.includes('FROM md_flow_interview_values'))return {rows:[]};
   if(sql.includes('FROM md_flow_interview_records'))return {rows:[{
    api_name:'$Record',object_api:'Account',record_id:null,is_collection:false,sort_order:0
   }]};
   if(sql.includes('FROM md_flow_interview_record_fields'))return {rows:[{
    api_name:'$Record',sort_order:0,field_api:'Name',value_text:'Old Name',data_type:'string'
   }]};
   return {rows:[]};
  }
 } as unknown as PoolClient;
 const runtime=new FlowRuntime({} as SqlPersistence,
  {require:async()=>{}} as unknown as RbacEngine,{} as never);
 const result=await runtime.advanceInterview(tenant,user,flowRows[0].id,
  {},client);
 assert.equal(result.status,'completed');
 if(result.status==='completed')assert.deepEqual(result.record,{Name:'New Name'});
});
