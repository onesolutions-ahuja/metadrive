import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PoolClient} from 'pg';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import {encodeMetadataValue} from '../../src/system-files/component-runtime.js';
import {FlowRecordTriggers} from '../../src/system-files/flow-record-triggers.js';
import {FlowRuntime} from '../../src/system-files/flow-runtime.js';
import {validateFlowDraft} from '../../src/system-files/flow-validation.js';
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
 conditions:unknown[]=[],runWhen='after-save',updatedRecordBehavior?:string) {
 const graph={flowType:'Record-Triggered Flow',elements:[
  {id:1,type:'Start',label:'Start',config:{
   object,runWhen,trigger,triggerOrder:order,
   entryConditions:conditions,conditionLogic:'All',
   ...(updatedRecordBehavior?{updatedRecordBehavior}:{})
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

test('after-save Record-Triggered Flow schedules a durable path with its record snapshot',async()=>{
 const flow={id:'00000000-0000-4000-8000-000000000031',api_name:'ScheduledPathFlow',
  version:3,app_api_name:'Orders'};
 const graph={flowType:'Record-Triggered Flow',appApiName:'Orders',elements:[
  {id:1,type:'Start',label:'Start',config:{
   object:'Account',trigger:'created-or-updated',runWhen:'after-save'
  }},
  {id:2,type:'End',label:'Immediate End',config:{}},
  {id:3,type:'End',label:'Scheduled End',config:{}}
 ],connectors:[
  {from:1,to:2,label:'Default',kind:'normal'},
  {from:1,to:3,label:'Follow up',kind:'scheduled',scheduledPath:{
   timeSourceFieldApiName:'DueDate',offsetAmount:1,offsetUnit:'Days'
  }}
 ],resources:[]};
 const encoded:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(graph,'/builder',encoded);
 const statements:Array<{sql:string;values:unknown[]}>=[];
 let runCount=0;
 const client={query:async(sql:string,values:unknown[]=[]):Promise<{
  rows:Array<Record<string,unknown>>;rowCount:number
 }>=>{
  statements.push({sql,values});
  if(sql.includes('FROM md_flow_definitions'))return {rows:[flow],rowCount:1};
  if(sql.includes('FROM md_flow_editor_values'))return {rows:encoded.map(row=>({
   property_path:row.path,value_kind:row.kind,value_text:row.text
  })),rowCount:encoded.length};
  if(sql.includes('INSERT INTO md_flow_runs'))return {
   rows:[{id:`00000000-0000-4000-8000-${String(++runCount).padStart(12,'0')}`}],rowCount:1
  };
  return {rows:[],rowCount:1};
 }} as unknown as PoolClient;
 const db={query:async(sql:string)=>sql.includes('FROM md_apps')
  ?{rows:[{id:'installed'}]}:{rows:[]},
  transaction:async<T>(callback:(tx:PoolClient)=>Promise<T>)=>callback(client)
 } as unknown as SqlPersistence;
 const permissions:string[]=[];
 const scheduled:Array<{runId:string;at:Date;version:number;app?:string}>=[];
 const runtime=new FlowRecordTriggers({require:async(_tenant,_user,resource)=>{
  permissions.push(resource);
 }} as unknown as RbacEngine,{advanceInterview:async()=>({status:'completed'})} as never,
 undefined,db,async(_client,_tenant,_user,_api,version,runId,at,_step,app)=>{
  scheduled.push({runId,at,version,app});
 });
 await runtime.execute(client,tenant,user,'Account','created',
  {Id:recordId,DueDate:'2026-10-20'},null);
 assert.equal(scheduled.length,1);
 assert.equal(scheduled[0].version,3);
 assert.equal(scheduled[0].app,'Orders');
 assert.equal(scheduled[0].at.toISOString(),'2026-10-21T00:00:00.000Z');
 assert.deepEqual(permissions,['Flow:ScheduledPathFlow','Account.DueDate']);
 assert(statements.some(item=>item.sql.includes("VALUES($1,$2,$3,'waiting','scheduled-path',$4)")
  &&item.values[3] instanceof Date));
 assert(statements.some(item=>item.sql.includes('INSERT INTO md_flow_interview_state')
  &&item.values[2]===3));
 assert(statements.some(item=>item.sql.includes('INSERT INTO md_flow_interview_records')
  &&item.values[2]==='$Record'&&item.values[4]===recordId));
 await runtime.execute(client,tenant,user,'Account','updated',
  {Id:recordId,DueDate:'2026-10-22'},{Id:recordId,DueDate:'2026-10-20'});
 assert.equal(scheduled.length,2);
 assert.equal(scheduled[1].at.toISOString(),'2026-10-23T00:00:00.000Z');
 assert.equal(statements.filter(item=>item.sql.includes('WITH cancelled AS')).length,2);
});

test('after-save Record-Triggered Flow may durably pause at a Wait element',async()=>{
 const flow=flowRows[0];
 const graph={flowType:'Record-Triggered Flow',elements:[
  {id:1,type:'Start',label:'Start',config:{
   object:'Account',trigger:'created',runWhen:'after-save'
  }},
  {id:2,type:'Wait',label:'Wait',config:{amount:1,unit:'Hours'}},
  {id:3,type:'End',label:'End',config:{}}
 ],connectors:[{from:1,to:2,label:'',kind:'normal'},{from:2,to:3,label:'',kind:'normal'}],resources:[]};
 const encoded:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(graph,'/builder',encoded);
 let advanced=0;
 const client={query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
  if(sql.includes('FROM md_flow_definitions'))return {rows:[{...flow,app_api_name:null}]};
  if(sql.includes('FROM md_flow_editor_values'))return {rows:encoded.map(row=>({
   property_path:row.path,value_kind:row.kind,value_text:row.text
  }))};
  if(sql.includes('INSERT INTO md_flow_runs'))return {rows:[{id:'waiting-run'}]};
  return {rows:[]};
 }} as unknown as PoolClient;
 const runtime=new FlowRecordTriggers({require:async()=>undefined} as unknown as RbacEngine,{
  advanceInterview:async()=>{advanced++;return {status:'waiting'};}
 } as never);
 await runtime.execute(client,tenant,user,'Account','created',{Id:recordId},null,'after-save');
 assert.equal(advanced,1);
});

test('Flow activation validates Scheduled Path context, source field type, and offset',async()=>{
 let dataType='date';
 const db={query:async()=>({rows:dataType?[{data_type:dataType}]:[]})} as never;
 const rbac={require:async()=>undefined} as unknown as RbacEngine;
 const draft=(runWhen='after-save',offsetAmount=1)=>({
  apiName:'ScheduledPathFlow',flowType:'Record-Triggered Flow',resources:[],
  elements:[
   {id:1,type:'Start',label:'Start',config:{
    object:'Account',trigger:'created',runWhen
   }},
   {id:2,type:'End',label:'Immediate',config:{}},
   {id:3,type:'End',label:'Scheduled',config:{}}
  ],
  connectors:[
   {from:1,to:2,label:'Default',kind:'normal'},
   {from:1,to:3,label:'Due',kind:'scheduled',scheduledPath:{
    timeSourceFieldApiName:'DueDate',offsetAmount,offsetUnit:'Days'
   }}
  ]
 });
 const valid=await validateFlowDraft(rbac,tenant,user,'ScheduledPathFlow',draft(),db);
 assert.equal(valid.valid,true,valid.errors.join('; '));
 dataType='text';
 const wrongType=await validateFlowDraft(rbac,tenant,user,'ScheduledPathFlow',draft(),db);
 assert.equal(wrongType.valid,false);
 assert.ok(wrongType.errors.some(error=>error.includes('Date or DateTime')));
 dataType='date';
 const beforeSave=await validateFlowDraft(rbac,tenant,user,'ScheduledPathFlow',
  draft('before-save'),db);
 assert.equal(beforeSave.valid,false);
 assert.ok(beforeSave.errors.some(error=>error.includes('after-save')));
 const invalidOffset=await validateFlowDraft(rbac,tenant,user,'ScheduledPathFlow',
  draft('after-save',3651),db);
 assert.equal(invalidOffset.valid,false);
 assert.ok(invalidOffset.errors.some(error=>error.includes('offset must be an integer')));
});

test('Platform Event delivery persists typed $Record and completes a waiting interview',async()=>{
 const flowId='00000000-0000-4000-8000-000000000031';
 const eventId='00000000-0000-4000-8000-000000000032';
 const deliveryId='00000000-0000-4000-8000-000000000033';
 const graph={flowType:'Platform Event-Triggered Flow',elements:[
  {id:1,type:'Start',label:'Start',config:{object:'Order_Updated__e',entryConditions:[
   {field:'Status__c',operator:'Equals',value:'Paid'}
  ]}},
  {id:2,type:'End',label:'End',config:{}}
 ],connectors:[{from:1,to:2,label:'Default',kind:'normal'}],resources:[]};
 const encoded:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue({builder:graph},'',encoded);
 const calls:Array<{sql:string;params:unknown[]}>=[];
 const updates:string[]=[];
 const client={query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
  calls.push({sql,params});
  if(sql.includes('INSERT INTO md_flow_runs'))return {rows:[{id:'platform-event-run'}]};
  if(sql.includes('INSERT INTO md_flow_interview_record_fields'))
   assert.deepEqual(params.slice(2),['$Record','Status__c','Paid','string']);
  return {rows:[]};
 }} as unknown as PoolClient;
 const db={
  query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
   updates.push(sql);
   if(sql.includes('SELECT d.event_id,e.event_api_name'))
    return {rows:[{event_id:eventId,event_api_name:'Order_Updated__e',flow_id:flowId,
     flow_api:'OrderFlow',app_api_name:null}]};
   if(sql.includes('FROM md_platform_event_values'))
    return {rows:[{field_api:'Status__c',value_kind:'string',value_text:'Paid'}]};
   if(sql.includes('FROM md_flow_editor_values'))
    return {rows:encoded.map(row=>({property_path:row.path,value_kind:row.kind,value_text:row.text}))};
   if(sql.includes('WITH finished AS')){
    assert.deepEqual(params,[tenant,deliveryId,'failed','FLOW_EXECUTION_FAILED']);
    return {rows:[]};
   }
   throw new Error('Unexpected Platform Event delivery SQL: '+sql);
  },
  transaction:async<T>(run:(transaction:PoolClient)=>Promise<T>)=>run(client)
 } as unknown as SqlPersistence;
 const permissions:string[]=[];
 const rbac={require:async(_tenant:string,_user:string,resource:string,action:string)=>{
  permissions.push(resource+':'+action);
 }} as unknown as RbacEngine;
 const flows={advanceInterview:async(_tenant:string,_user:string,runId:string)=>{
  assert.equal(runId,'platform-event-run');return {status:'waiting'};
 }} as never;
 const result=await new FlowRecordTriggers(rbac,flows,undefined,db)
  .executePlatformEventDelivery(tenant,user,deliveryId,2);
 assert.deepEqual(result,{deliveryId,flowApi:'OrderFlow',matched:true});
 assert.deepEqual(permissions,['Flow:OrderFlow:execute','PlatformEvent:Order_Updated__e.Status__c:read']);
 assert(calls.some(call=>call.sql.includes('INSERT INTO md_flow_interview_state')));
 assert(calls.some(call=>call.sql.includes('INSERT INTO md_flow_interview_record_fields')));
 assert(calls.some(call=>call.sql.includes("SET status='completed'")));
 assert(updates.some(sql=>sql.includes('SELECT d.event_id,e.event_api_name')));
});

test('Platform Event delivery marks rejected entry-condition access failed and rethrows',async()=>{
 const flowId='00000000-0000-4000-8000-000000000041';
 const eventId='00000000-0000-4000-8000-000000000042';
 const deliveryId='00000000-0000-4000-8000-000000000043';
 const graph={flowType:'Platform Event-Triggered Flow',elements:[
  {id:1,type:'Start',label:'Start',config:{object:'Order_Updated__e',entryConditions:[
   {field:'Status__c',operator:'Equals',value:'Paid'}
  ]}},
  {id:2,type:'End',label:'End',config:{}}
 ],connectors:[{from:1,to:2,label:'Default',kind:'normal'}],resources:[]};
 const encoded:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue({builder:graph},'',encoded);
 const statements:string[]=[];
 const db={
  query:async(sql:string):Promise<{rows:Array<Record<string,unknown>>}>=>{
   statements.push(sql);
   if(sql.includes('SELECT d.event_id,e.event_api_name'))
    return {rows:[{event_id:eventId,event_api_name:'Order_Updated__e',flow_id:flowId,
     flow_api:'OrderFlow',app_api_name:null}]};
   if(sql.includes('FROM md_platform_event_values'))
    return {rows:[{field_api:'Status__c',value_kind:'string',value_text:'Paid'}]};
   if(sql.includes('FROM md_flow_editor_values'))
    return {rows:encoded.map(row=>({property_path:row.path,value_kind:row.kind,value_text:row.text}))};
   return {rows:[]};
  }
 } as unknown as SqlPersistence;
 const rbac={require:async(_tenant:string,_user:string,resource:string)=>{
  if(resource==='PlatformEvent:Order_Updated__e.Status__c')throw new Error('Permission denied');
 }} as unknown as RbacEngine;
 const runtime=new FlowRecordTriggers(rbac,{} as never,undefined,db);
 await assert.rejects(runtime.executePlatformEventDelivery(tenant,user,deliveryId,2),/Permission denied/);
 const failure=statements.find(sql=>sql.includes('WITH finished AS'));
 assert.ok(failure);
 assert.match(failure,/status=\$3,error_code=\$4/);
});

test('scheduled Flow reads tenant records, filters entry conditions and persists a durable interview',async()=>{
 const flowId='00000000-0000-4000-8000-000000000021';
 const matchingId='00000000-0000-4000-8000-000000000022';
 const graph={flowType:'Schedule-Triggered Flow',elements:[
  {id:1,type:'Start',label:'Start',config:{object:'Account',
   entryConditions:[{field:'Status',operator:'Equals',value:'Active'}],conditionLogic:'All'}},
  {id:2,type:'End',label:'End',config:{}}
 ],connectors:[{from:1,to:2,label:'Default',kind:'normal'}],resources:[]};
 const encoded:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue({builder:graph},'',encoded);
 const queries:string[]=[];
 const client={
  query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
   queries.push(sql);
   if(sql.includes('INSERT INTO md_flow_runs'))return {rows:[{id:'run-scheduled'}]};
   if(sql.includes('INSERT INTO md_flow_interview_records'))
    assert.deepEqual(params.slice(2),['$Record','Account',matchingId]);
   if(sql.includes('INSERT INTO md_flow_interview_record_fields')
      &&params[3]==='Status')assert.equal(params[4],'Active');
   return {rows:[]};
  }
 } as unknown as PoolClient;
 const db={
  query:async(sql:string):Promise<{rows:Array<Record<string,unknown>>}>=>{
   if(sql.includes('FROM md_flow_definitions'))return {rows:[{id:flowId,version:2}]};
   if(sql.includes('FROM md_flow_editor_values'))return {rows:encoded.map(row=>({
    property_path:row.path,value_kind:row.kind,value_text:row.text
   }))};
   throw new Error('Unexpected scheduled Flow SQL: '+sql);
  },
  transaction:async<T>(callback:(tx:PoolClient)=>Promise<T>)=>callback(client)
 } as unknown as SqlPersistence;
 const permissionChecks:string[]=[];
 const rbac={require:async(_tenant:string,_user:string,resource:string)=>{
  permissionChecks.push(resource);
 }} as unknown as RbacEngine;
 const records={list:async(_tenant:string,_user:string,_object:string,_size:number,offset:number)=>{
  return offset===0?{total:2,records:[
   {Id:matchingId,Status:'Active'},{Id:'00000000-0000-4000-8000-000000000023',Status:'Inactive'}
  ]}:{total:2,records:[]};
 }} as never;
 const advances:string[]=[];
 const flows={advanceInterview:async(_tenant:string,_user:string,runId:string)=>{
  advances.push(runId);return {status:'waiting'};
 }} as never;
 const runtime=new FlowRecordTriggers(rbac,flows,records,db);
 const result=await runtime.executeScheduledFlow(tenant,user,'DailyFlow',2);
 assert.deepEqual(result,{flowApi:'DailyFlow',version:2,records:1});
 assert.deepEqual(permissionChecks,['Flow:DailyFlow','Account.Status']);
 assert.deepEqual(advances,['run-scheduled']);
 assert(queries.some(sql=>sql.includes('INSERT INTO md_flow_interview_state')));
});

test('transition entry conditions compare the prior snapshot and detect field changes',async()=>{
 const flow=flowRows[0];
 const documents=new Map([[flow.id,metadata('Account',10,'updated',[
  {field:'Status',operator:'Is Changed'}
 ],'after-save','transition')]]);
 const calls:string[]=[];
 const client={
  query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
   if(sql.includes('FROM md_flow_definitions'))return {rows:[flow]};
   if(sql.includes('FROM md_flow_editor_values'))return {rows:documents.get(String(params[1]))??[]};
   if(sql.includes('INSERT INTO md_flow_runs'))return {rows:[{id:'run-id'}]};
   return {rows:[]};
  }
 } as unknown as PoolClient;
 const runtime=new FlowRecordTriggers({require:async()=>{}} as unknown as RbacEngine,{
  advanceInterview:async()=>{calls.push('run');return {status:'completed'};}
 } as never);
 await runtime.execute(client,tenant,user,'Account','updated',
  {Id:recordId,Status:'Active'},{Id:recordId,Status:'Inactive'});
 assert.deepEqual(calls,['run']);
 calls.length=0;
 await runtime.execute(client,tenant,user,'Account','updated',
  {Id:recordId,Status:'Active'},{Id:recordId,Status:'Active'});
 assert.deepEqual(calls,[]);
});

test('Was Set entry conditions match only when an update populates a previously blank field',async()=>{
 const flow=flowRows[0],documents=new Map([[flow.id,metadata('Account',1,'updated',[
  {field:'Status',operator:'Was Set'}
 ])]]);
 let executions=0;
 const client={
  query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
   if(sql.includes('FROM md_flow_definitions'))return {rows:[flow]};
   if(sql.includes('FROM md_flow_editor_values'))return {rows:documents.get(String(params[1]))??[]};
   if(sql.includes('INSERT INTO md_flow_runs'))return {rows:[{id:'run-id'}]};
   return {rows:[]};
  }
 } as unknown as PoolClient;
 const runtime=new FlowRecordTriggers({require:async()=>{}} as unknown as RbacEngine,{
  advanceInterview:async()=>{executions++;return {status:'completed'};}
 } as never);
 await runtime.execute(client,tenant,user,'Account','updated',
  {Id:recordId,Status:'Active'},{Id:recordId,Status:null});
 await runtime.execute(client,tenant,user,'Account','updated',
  {Id:recordId,Status:'Active'},{Id:recordId,Status:'Inactive'});
 assert.equal(executions,1);
});

test('transition entry conditions run only when an update first satisfies criteria',async()=>{
 const flow=flowRows[0],documents=new Map([[flow.id,metadata('Account',1,'updated',[
  {field:'Status',operator:'Equals',value:'Active'}
 ],'after-save','transition')]]);
 let executions=0;
 const client={
  query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
   if(sql.includes('FROM md_flow_definitions'))return {rows:[flow]};
   if(sql.includes('FROM md_flow_editor_values'))return {rows:documents.get(String(params[1]))??[]};
   if(sql.includes('INSERT INTO md_flow_runs'))return {rows:[{id:'run-id'}]};
   return {rows:[]};
  }
 } as unknown as PoolClient;
 const runtime=new FlowRecordTriggers({require:async()=>{}} as unknown as RbacEngine,{
  advanceInterview:async()=>{executions++;return {status:'completed'};}
 } as never);
 await runtime.execute(client,tenant,user,'Account','updated',
  {Id:recordId,Status:'Active'},{Id:recordId,Status:'Inactive'});
 await runtime.execute(client,tenant,user,'Account','updated',
  {Id:recordId,Status:'Active'},{Id:recordId,Status:'Active'});
 await runtime.execute(client,tenant,user,'Account','updated',
  {Id:recordId,Status:'Inactive'},{Id:recordId,Status:'Active'});
 assert.equal(executions,1);
});

test('CRUD invoked inside a triggered Flow does not recursively dispatch record Flows',async()=>{
 const flow=flowRows[0],documents=new Map([[flow.id,metadata('Account',1)]]);
 let executions=0;
 const client={
  query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
   if(sql.includes('FROM md_flow_definitions'))return {rows:[flow]};
   if(sql.includes('FROM md_flow_editor_values'))return {rows:documents.get(String(params[1]))??[]};
   if(sql.includes('INSERT INTO md_flow_runs'))return {rows:[{id:'run-id'}]};
   return {rows:[]};
  }
 } as unknown as PoolClient;
 let runtime:FlowRecordTriggers;
 runtime=new FlowRecordTriggers({require:async()=>{}} as unknown as RbacEngine,{
  advanceInterview:async()=>{
   executions++;
   await runtime.execute(client,tenant,user,'Account','created',{Id:recordId},null);
   return {status:'completed'};
  }
 } as never);
 await runtime.execute(client,tenant,user,'Account','created',{Id:recordId},null);
 assert.equal(executions,1);
});

test('record-triggered Flow executions are capped per record operation',async()=>{
 const flows=Array.from({length:51},(_,index)=>({
  id:`00000000-0000-4000-8000-${String(index+100).padStart(12,'0')}`,
  api_name:`Flow${index}`
 }));
 const documents=new Map(flows.map(flow=>[flow.id,metadata('Account',1)]));
 let runCount=0;
 const client={
  query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
   if(sql.includes('FROM md_flow_definitions'))return {rows:flows};
   if(sql.includes('FROM md_flow_editor_values'))return {rows:documents.get(String(params[1]))??[]};
   if(sql.includes('INSERT INTO md_flow_runs')){runCount++;return {rows:[{id:'run-id'}]};}
   return {rows:[]};
  }
 } as unknown as PoolClient;
 const runtime=new FlowRecordTriggers({require:async()=>{}} as unknown as RbacEngine,{
  advanceInterview:async()=>({status:'completed'})
 } as never);
 await assert.rejects(()=>runtime.execute(client,tenant,user,'Account','created',{Id:recordId},null),
  /execution limit exceeded/);
 assert.equal(runCount,0);
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

test('Flow validation accepts bounded record mutation sources supported by runtime',async()=>{
 const runtime=new FlowRuntime({} as SqlPersistence,{require:async()=>{}} as unknown as RbacEngine);
 const createDraft=(type:string,config:Record<string,unknown>)=>({
  apiName:'MutationFlow',flowType:'Autolaunched Flow',
  elements:[
   {id:1,type:'Start',label:'Start',config:{}},
   {id:2,type,label:type,config},
   {id:3,type:'End',label:'End',config:{}}
  ],
  connectors:[{from:1,to:2,label:'Default',kind:'normal'},
   {from:2,to:3,label:'Default',kind:'normal'}],resources:[]
 });
 const updateBase={object:'Account',fieldValues:[{field:'Name',value:'Updated'}]};
 for(const source of [
  {recordId:'{!accountId}'},
  {recordSource:'record',recordVariable:'account'},
  {recordSource:'collection',collection:'accounts'},
  {recordSource:'filter',conditions:[{field:'Name',operator:'Equals',value:'Acme'}]}
 ]){
  const result=await runtime.validateDraft(tenant,user,'MutationFlow',
   createDraft('Update Records',{...updateBase,...source}));
  assert.equal(result.valid,true,result.errors.join('; '));
 }
 const deleteByCollection=await runtime.validateDraft(tenant,user,'MutationFlow',
  createDraft('Delete Records',{object:'Account',recordSource:'collection',collection:'accounts'}));
 assert.equal(deleteByCollection.valid,true,deleteByCollection.errors.join('; '));
 const createCollection=await runtime.validateDraft(tenant,user,'MutationFlow',
  createDraft('Create Records',{object:'Account',recordSource:'collection',
   collection:'pendingAccounts',resultVariable:'createdAccounts'}));
 assert.equal(createCollection.valid,true,createCollection.errors.join('; '));
 const unsafeBulk=await runtime.validateDraft(tenant,user,'MutationFlow',
  createDraft('Delete Records',{object:'Account',recordSource:'filter',conditions:[]}));
 assert.equal(unsafeBulk.valid,false);
 const supportedElements=[
  ['Get Records',{object:'Account',recordLimit:'all',fields:['Name'],
   outputVariable:'accounts',conditions:[{field:'Status',operator:'Equals',value:'Active'}]}],
  ['Loop',{collection:'accounts',loopVariable:'currentAccount'}],
  ['Collection Filter',{collection:'accounts',outputCollection:'activeAccounts',
   conditions:[{field:'Status',operator:'Equals',value:'Active'}]}],
  ['Collection Sort',{collection:'accounts',outputCollection:'sortedAccounts',sortField:'Name'}],
  ['Transform',{collection:'accounts',outputCollection:'accountNames',
   mappings:[{sourceField:'Name',targetField:'AccountName'}]}],
  ['Roll Back Records',{}]
 ] as const;
 for(const [type,config] of supportedElements){
  const result=await runtime.validateDraft(tenant,user,'MutationFlow',
   createDraft(type,config as Record<string,unknown>));
  assert.equal(result.valid,true,result.errors.join('; '));
 }
 const emptyCollectionFilter=await runtime.validateDraft(tenant,user,'MutationFlow',
  createDraft('Collection Filter',{collection:'accounts',outputCollection:'filtered',conditions:[]}));
 assert.equal(emptyCollectionFilter.valid,false);
});

test('Flow validation accepts durable Wait elements and rejects unsafe configurations',async()=>{
 const runtime=new FlowRuntime({} as SqlPersistence,{require:async()=>{}} as unknown as RbacEngine);
 const draft=(config:Record<string,unknown>)=>({
  apiName:'WaitFlow',flowType:'Autolaunched Flow',
  elements:[
   {id:1,type:'Start',label:'Start',config:{}},
   {id:2,type:'Wait',label:'Wait',config},
   {id:3,type:'End',label:'End',config:{}}
  ],
  connectors:[{from:1,to:2,label:'Default',kind:'normal'},
   {from:2,to:3,label:'Default',kind:'normal'}],resources:[]
 });
 const valid=await runtime.validateDraft(tenant,user,'WaitFlow',draft({amount:2,unit:'Hours'}));
 assert.equal(valid.valid,true,valid.errors.join('; '));
 const invalid=await runtime.validateDraft(tenant,user,'WaitFlow',draft({amount:0,unit:'Hours'}));
 assert.equal(invalid.valid,false);
 const recordFlow={...draft({amount:2,unit:'Hours'}),flowType:'Record-Triggered Flow',
  elements:draft({amount:2,unit:'Hours'}).elements.map(element=>element.type==='Start'
   ?{...element,config:{object:'Account',trigger:'created',runWhen:'after-save'}}:element)};
 const recordWait=await runtime.validateDraft(tenant,user,'WaitFlow',recordFlow);
 assert.equal(recordWait.valid,true,recordWait.errors.join('; '));
 const beforeSaveWait=await runtime.validateDraft(tenant,user,'WaitFlow',{
  ...recordFlow,elements:recordFlow.elements.map(element=>element.type==='Start'
   ?{...element,config:{object:'Account',trigger:'created',runWhen:'before-save'}}:element)
 });
 assert.equal(beforeSaveWait.valid,false);
 assert.ok(beforeSaveWait.errors.some(error=>error.includes('before-save Record-Triggered Flows')));
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

test('record-triggered Decision resolves current and prior record change references',async()=>{
 const graph={flowType:'Record-Triggered Flow',elements:[
  {id:1,type:'Start',label:'Start',config:{object:'Account',runWhen:'after-save'}},
  {id:2,type:'Decision',label:'Changed?',config:{outcomes:[
   {name:'Changed',label:'Changed',conditions:[
    {field:'{!$Record.Name}',operator:'Is Changed'}
   ]},
   {name:'Default',label:'Default',conditions:[]}
  ]}},
  {id:3,type:'Assignment',label:'Mark changed',config:{variable:'route',value:'changed'}},
  {id:4,type:'End',label:'Changed end',config:{}},
  {id:5,type:'End',label:'Unchanged end',config:{}}
 ],connectors:[
  {from:1,to:2,label:'Default',kind:'normal'},
  {from:2,to:3,label:'Changed',kind:'normal'},
  {from:2,to:5,label:'Default',kind:'normal'},
  {from:3,to:4,label:'Default',kind:'normal'}
 ],resources:[{name:'route',type:'Variable',dataType:'Text',availableForOutput:true}]};
 const rows:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(graph,'/builder',rows);
 const editorRows=rows.map(row=>({
  property_path:row.path,value_kind:row.kind,value_text:row.text
 }));
 const client={
  query:async(sql:string):Promise<{rows:Array<Record<string,unknown>>}>=>{
   if(sql.includes('SELECT r.flow_id,f.api_name'))return {rows:[{
    flow_id:flowRows[0].id,api_name:'ChangeFlow',flow_type:'Record-Triggered Flow',
    started_by:user,status:'pending'
   }]};
   if(sql.includes('FROM md_flow_editor_values'))return {rows:editorRows};
   if(sql.includes('FROM md_flow_interview_state'))return {rows:[{
    current_element:1,history_elements:[],step_count:0
   }]};
   if(sql.includes('FROM md_flow_interview_records'))return {rows:[
    {api_name:'$Record',object_api:'Account',record_id:recordId,is_collection:false,sort_order:0},
    {api_name:'$Record__Prior',object_api:'Account',record_id:recordId,is_collection:false,sort_order:0}
   ]};
   if(sql.includes('FROM md_flow_interview_record_fields'))return {rows:[
    {api_name:'$Record',sort_order:0,field_api:'Name',value_text:'New Name',data_type:'string'},
    {api_name:'$Record__Prior',sort_order:0,field_api:'Name',value_text:'Old Name',data_type:'string'}
   ]};
   if(sql.includes('FROM md_flow_interview_loop_state')
    ||sql.includes('FROM md_flow_run_inputs')
    ||sql.includes('FROM md_flow_interview_values'))return {rows:[]};
   if(sql.includes("UPDATE md_flow_runs SET status='completed'"))return {rows:[]};
   return {rows:[]};
  }
 } as unknown as PoolClient;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const runtime=new FlowRuntime({} as SqlPersistence,rbac,{} as never);
 const result=await runtime.advanceInterview(tenant,user,'00000000-0000-4000-8000-000000000014',{},client);
 assert.equal(result.status,'completed');
 if(result.status==='completed')assert.deepEqual(result.outputs,{route:'changed'});
});
