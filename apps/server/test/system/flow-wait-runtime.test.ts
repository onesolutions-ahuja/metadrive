import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {RecordEngine} from '../../src/system-files/record-engine.js';
import {FlowRuntime} from '../../src/system-files/flow-runtime.js';
import {encodeMetadataValue} from '../../src/system-files/component-runtime.js';
import {resolveFlowScheduledPathAt,resolveFlowWaitUntil} from '../../src/system-files/flow-wait-runtime.js';

const runId='00000000-0000-4000-8000-000000000001';

test('Flow Wait resolves bounded durations and IANA local times',()=>{
 const now=new Date('2026-10-19T12:00:00.000Z');
 assert.equal(resolveFlowWaitUntil({amount:2,unit:'Hours'},now).toISOString(),
  '2026-10-19T14:00:00.000Z');
 assert.equal(resolveFlowWaitUntil({
  waitType:'Specific Time',dateTime:'2026-10-20T09:30',timeZone:'America/Los_Angeles'
 },now).toISOString(),'2026-10-20T16:30:00.000Z');
 assert.throws(()=>resolveFlowWaitUntil({
  waitType:'Specific Time',dateTime:'2026-03-08T02:30',timeZone:'America/New_York'
 },new Date('2026-03-01T00:00:00.000Z')),/does not exist/);
 assert.throws(()=>resolveFlowWaitUntil({amount:0,unit:'Hours'},now),/duration configuration/);
});

test('Scheduled Paths resolve Date and timezone-qualified DateTime offsets durably',()=>{
 const now=new Date('2026-10-19T12:00:00.000Z');
 assert.equal(resolveFlowScheduledPathAt({DueDate:'2026-10-20'},{
  timeSourceFieldApiName:'DueDate',offsetAmount:2,offsetUnit:'Days'
 },now)?.toISOString(),'2026-10-22T00:00:00.000Z');
 assert.equal(resolveFlowScheduledPathAt({DueAt:'2026-10-20T09:00:00-04:00'},{
  timeSourceFieldApiName:'DueAt',offsetAmount:-1,offsetUnit:'Hours'
 },now)?.toISOString(),'2026-10-20T12:00:00.000Z');
 assert.equal(resolveFlowScheduledPathAt({DueDate:null},{
  timeSourceFieldApiName:'DueDate',offsetAmount:0,offsetUnit:'Days'
 },now),null);
 assert.equal(resolveFlowScheduledPathAt({DueDate:'2026-10-18'},{
  timeSourceFieldApiName:'DueDate',offsetAmount:0,offsetUnit:'Days'
 },now)?.toISOString(),now.toISOString());
 assert.throws(()=>resolveFlowScheduledPathAt({DueAt:'2026-10-20T09:00:00'},{
  timeSourceFieldApiName:'DueAt',offsetAmount:0,offsetUnit:'Hours'
 },now),/timezone-qualified/);
 assert.throws(()=>resolveFlowScheduledPathAt({DueDate:'2026-02-30'},{
  timeSourceFieldApiName:'DueDate',offsetAmount:0,offsetUnit:'Days'
 },now),/Date value is invalid/);
 assert.throws(()=>resolveFlowScheduledPathAt({DueDate:'2026-10-20'},{
  timeSourceFieldApiName:'DueDate',offsetAmount:1.5,offsetUnit:'Days'
 },now),/offset is invalid/);
});

test('after-save Record-Triggered Flow Wait persists interview state and enqueues a durable resume',async()=>{
 const graph={
  flowType:'Record-Triggered Flow',
  resources:[{name:'message',type:'Variable',dataType:'Text'}],
  elements:[
   {id:1,type:'Start',label:'Start',config:{
    object:'Account',trigger:'created',runWhen:'after-save'
   }},
   {id:2,type:'Assignment',label:'Set value',config:{variable:'message',value:'saved'}},
   {id:3,type:'Wait',label:'Wait',config:{amount:1,unit:'Hours'}},
   {id:4,type:'End',label:'End',config:{}}
  ],
  connectors:[
   {from:1,to:2,label:'Default',kind:'normal'},
   {from:2,to:3,label:'Default',kind:'normal'},
   {from:3,to:4,label:'Default',kind:'normal'}
  ]
 };
 const metadata:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(graph,'/builder',metadata);
 let cursor:number|undefined;
 let runStatus='pending';
 let scheduled:{runId:string;at:Date;step:number}|undefined;
 const client={query:async(sql:string,params:unknown[]=[]):Promise<{rows:unknown[];rowCount:number}>=>{
  if(sql.includes('SELECT r.flow_id,f.api_name,f.flow_type,f.version,r.started_by,r.initiated_by'))
   return {rows:[{flow_id:'flow-id',api_name:'WaitFlow',flow_type:'Record-Triggered Flow',
    version:2,started_by:'user-id',initiated_by:'user-id',execution_context:'User',
    system_context_approved_by:null,status:runStatus}],rowCount:1};
  if(sql.includes('FROM md_flow_editor_values'))return {rows:metadata.map(row=>({
   property_path:row.path,value_kind:row.kind,value_text:row.text
  })),rowCount:metadata.length};
  if(sql.includes('SELECT current_element,history_elements,step_count'))return {rows:cursor===undefined
   ?[]:[{current_element:cursor,history_elements:[],step_count:0}],rowCount:cursor===undefined?0:1};
  if(sql.includes('INSERT INTO md_flow_interview_state'))return {rows:[],rowCount:1};
  if(sql.includes('FROM md_flow_interview_loop_state'))return {rows:[],rowCount:0};
  if(sql.includes('FROM md_flow_run_inputs'))return {rows:[],rowCount:0};
  if(sql.includes('FROM md_flow_interview_values'))return {rows:[],rowCount:0};
  if(sql.includes('FROM md_flow_interview_records'))return {rows:[],rowCount:0};
  if(sql.includes('FROM md_flow_interview_record_fields'))return {rows:[],rowCount:0};
  if(sql.startsWith('SAVEPOINT '))return {rows:[],rowCount:0};
  if(sql.includes('UPDATE md_flow_interview_state SET current_element')){
   cursor=Number(params[2]);return {rows:[],rowCount:1};
  }
  if(sql.includes('INSERT INTO md_flow_interview_values'))return {rows:[],rowCount:1};
  if(sql.includes("UPDATE md_flow_runs SET status='waiting'")){
   runStatus='waiting';return {rows:[],rowCount:1};
  }
  throw new Error('Unexpected Flow Wait query: '+sql);
 }};
 const db={query:client.query} as unknown as SqlPersistence;
 const rbac={require:async()=>undefined} as unknown as RbacEngine;
 const scheduleResume=async(_client:typeof client,_tenant:string,_user:string,_flow:string,
  _version:number,id:string,at:Date,step:number)=>{scheduled={runId:id,at,step};};
 const runtime=new FlowRuntime(db,rbac,{} as RecordEngine,undefined,scheduleResume);
 const result=await runtime.advanceInterview('tenant-id','user-id',runId,{},client as never);
 assert.equal(result.status,'waiting');
 assert.equal(cursor,4);
 assert.equal(runStatus,'waiting');
 assert.equal(scheduled?.runId,runId);
 assert.equal(scheduled?.step,3);
 assert.ok(scheduled?.at instanceof Date);
});

test('Loop records retain their declared Object when a Flow pauses between iterations',async()=>{
 const graph={
  flowType:'Autolaunched Flow',
  resources:[{name:'accounts',type:'Record Collection',dataType:'Account',isCollection:true}],
  elements:[
   {id:1,type:'Start',label:'Start',config:{}},
   {id:2,type:'Loop',label:'Loop accounts',config:{
    collection:'accounts',loopVariable:'currentAccount',direction:'First to last'
   }},
   {id:3,type:'Wait',label:'Wait',config:{amount:1,unit:'Hours'}},
   {id:4,type:'End',label:'End',config:{}}
  ],
  connectors:[
   {from:1,to:2,label:'Default',kind:'normal'},
   {from:2,to:3,label:'For Each',kind:'normal'},
   {from:2,to:4,label:'After Last',kind:'normal'},
   {from:3,to:2,label:'Default',kind:'normal'}
  ]
 };
 const metadata:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(graph,'/builder',metadata);
 const insertedRecords:string[]=[];
 let runStatus='pending';
 const client={query:async(sql:string,params:unknown[]=[]):Promise<{rows:unknown[];rowCount:number}>=>{
  if(sql.includes('SELECT r.flow_id,f.api_name,f.flow_type,f.version,r.started_by,r.initiated_by'))
   return {rows:[{flow_id:'flow-id',api_name:'LoopFlow',flow_type:'Autolaunched Flow',version:1,
    started_by:'user-id',initiated_by:'user-id',execution_context:'User',
    system_context_approved_by:null,status:runStatus}],rowCount:1};
  if(sql.includes('FROM md_flow_editor_values'))return {rows:metadata.map(row=>({
   property_path:row.path,value_kind:row.kind,value_text:row.text
  })),rowCount:metadata.length};
  if(sql.includes('SELECT current_element,history_elements,step_count'))return {rows:[],rowCount:0};
  if(sql.includes('INSERT INTO md_flow_interview_state'))return {rows:[],rowCount:1};
  if(sql.includes('FROM md_flow_interview_loop_state'))return {rows:[],rowCount:0};
  if(sql.includes('FROM md_flow_run_inputs')||sql.includes('FROM md_flow_interview_values'))
   return {rows:[],rowCount:0};
  if(sql.includes('FROM md_flow_interview_record_fields'))return {rows:[{
   api_name:'accounts',sort_order:0,field_api:'Name',value_text:'Acme',data_type:'string'
  }],rowCount:1};
  if(sql.includes('FROM md_flow_interview_records'))return {rows:[{
   api_name:'accounts',object_api:'Account',record_id:null,is_collection:true,sort_order:0
  }],rowCount:1};
  if(sql.startsWith('SAVEPOINT '))return {rows:[],rowCount:0};
  if(sql.includes('INSERT INTO md_flow_interview_records')){
   insertedRecords.push(String(params[2]));return {rows:[],rowCount:1};
  }
  if(sql.includes("UPDATE md_flow_runs SET status='waiting'")){
   runStatus='waiting';return {rows:[],rowCount:1};
  }
  return {rows:[],rowCount:1};
 }};
 const db={query:client.query} as unknown as SqlPersistence;
 const rbac={require:async()=>undefined} as unknown as RbacEngine;
 const runtime=new FlowRuntime(db,rbac,{} as RecordEngine,undefined,async()=>undefined);
 const result=await runtime.advanceInterview('tenant-id','user-id',runId,{},client as never);
 assert.equal(result.status,'waiting');
 assert.ok(insertedRecords.includes('currentAccount'));
 assert.ok(insertedRecords.includes('accounts'));
});
