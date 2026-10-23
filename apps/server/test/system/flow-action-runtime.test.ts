import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PoolClient} from 'pg';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {executeFlowAction,loadFlowUserResource} from '../../src/system-files/flow-action-runtime.js';
import {validateFlowDraft} from '../../src/system-files/flow-validation.js';

const recipient='00000000-0000-4000-8000-000000000001';
const config:Record<string,unknown>={actionType:'Custom Notification',recipientIds:'{!$User.Id}; {!$User.Id}',
 title:'Hello {!$User.Name}',messageBody:'A Flow notification'};
const context=(query: (sql:string,values?:unknown[])=>Promise<{rowCount?:number|null}>,require=async()=>undefined,
 connectors:Array<{to:number;kind?:string}>=[],requireRecord=async()=>undefined)=>({
 client:{query},rbac:{require,requireRecord} as unknown as RbacEngine,tenantId:'tenant-id',userId:recipient,
 flowApi:'NotificationFlow',runId:'run-id',config,resolve:(value:unknown)=>value==='{!$User.Id}'?recipient
  :value==='{!$User.Name}'?'Flow user':value,variables:{},connectors,elementId:2
});

test('Generate 4-Digit Random OTP returns four numeric text digits',async()=>{
 const actionContext=context(async()=>({rowCount:1}));
 actionContext.config={actionType:'Generate 4-Digit Random OTP',outputVariable:'otp'};
 const result=await executeFlowAction(actionContext);
 assert.equal(result,undefined);
 assert.match(String((actionContext.variables as Record<string,unknown>).otp),/^[0-9]{4}$/);
});

test('Generate 6-Digit Random OTP returns six numeric text digits',async()=>{
 const actionContext=context(async()=>({rowCount:1}));
 actionContext.config={actionType:'Generate 6-Digit Random OTP',outputVariable:'verificationCode'};
 const result=await executeFlowAction(actionContext);
 assert.equal(result,undefined);
 assert.match(String((actionContext.variables as Record<string,unknown>).verificationCode),/^[0-9]{6}$/);
});

test('Generate Random OTP rejects an invalid output variable',async()=>{
 const actionContext=context(async()=>({rowCount:1}));
 actionContext.config={actionType:'Generate 4-Digit Random OTP',outputVariable:'not a variable'};
 await assert.rejects(()=>executeFlowAction(actionContext),/valid output variable name/);
});

test('Flow formula context uses the execution user time zone and tenant currency rates',async()=>{
  const vars:Record<string,unknown>={};
  const context=await loadFlowUserResource({query:async(sql:string)=>{
   assert.match(sql,/time_zone/);
   return {rows:[
    {id:recipient,email:'flow@example.invalid',display_name:'Flow User',time_zone:'Europe/London',
     has_currency_settings:true,currency_iso_code:'GBP',conversion_rate:'1'},
    {id:recipient,email:'flow@example.invalid',display_name:'Flow User',time_zone:'Europe/London',
     has_currency_settings:true,currency_iso_code:'USD',conversion_rate:'1.27'}
   ]};
  }} as unknown as PoolClient,'tenant-id',recipient,'TODAY() + TZOFFSET(NOW()) + CURRENCYRATE("USD")',vars);
  assert.equal(context.timeZone,'Europe/London');
  assert.deepEqual(context.currencyRates,{GBP:1,USD:1.27});
  assert.deepEqual(vars.$User,{Id:recipient,Name:'Flow User',Email:'flow@example.invalid',
   TimeZone:'Europe/London'});
});

test('Flow formula context does not issue a user query when no user or contextual formula is used',async()=>{
  let queried=false;
  const result=await loadFlowUserResource({query:async()=>{
   queried=true;
   return {rows:[]};
  }} as unknown as PoolClient,'tenant-id',recipient,'1 + 2',{});
  assert.deepEqual(result,{});
  assert.equal(queried,false);
});

test('Custom Notification action validates, authorizes, deduplicates and persists in the Flow transaction',async()=>{
 const queries:Array<{sql:string;values?:unknown[]}>=[],permissions:string[]=[];
 const result=await executeFlowAction(context(async(sql,values)=>{
  queries.push({sql,values});
  return {rowCount:1};
 },async(...args:unknown[])=>{permissions.push(args.join(':'));}));
 assert.equal(result,undefined);
 assert.deepEqual(permissions,['tenant-id:'+recipient+':Notification:send']);
 assert.equal(queries.filter(item=>item.sql.includes('INSERT INTO md_notifications')).length,1);
 const insert=queries.find(item=>item.sql.includes('INSERT INTO md_notifications'))!;
 assert.deepEqual(insert.values,['tenant-id',[recipient],'Hello Flow user','A Flow notification','NotificationFlow',recipient]);
 assert.deepEqual(queries.map(item=>item.sql.trim().split(' ')[0]+' '+item.sql.trim().split(' ')[1]),
  ['SAVEPOINT flow_action_2','INSERT INTO','RELEASE SAVEPOINT']);
});

test('Publish Platform Event writes typed event data inside the Flow action savepoint',async()=>{
 const statements:string[]=[],permissions:string[]=[];
 const actionContext=context(async(sql,values)=>{
  statements.push(sql.trim());
  if(sql.includes('FROM md_system_definitions'))return {rows:[{api_name:'Order_Updated__e'}]};
  if(sql.includes('FROM md_platform_event_fields'))return {rows:[
   {field_api:'Order__c',data_type:'Text(255)',required:true,picklist_restricted:false},
   {field_api:'Total__c',data_type:'Currency',required:false,picklist_restricted:false}
  ]};
  if(sql.includes('FROM md_platform_event_picklist_values'))return {rows:[]};
  if(sql.includes('INSERT INTO md_platform_event_messages'))return {rows:[{id:'event-id'}]};
  if(sql.includes('INSERT INTO md_platform_event_values')&&values?.[2]==='Order__c')
   assert.deepEqual(values,['tenant-id','event-id','Order__c','string','Order '+recipient]);
  return {rows:[],rowCount:1};
 },async(...args:unknown[])=>{permissions.push(args.join(':'));});
 actionContext.config={actionType:'Publish Platform Event',eventApiName:'Order_Updated__e',
  fieldValues:[{field:'Order__c',value:'Order {!$Record.Id}'},{field:'Total__c',value:'10.5'}]};
 actionContext.resolve=(value:unknown)=>value==='{!$Record.Id}'?recipient:value;
 const result=await executeFlowAction(actionContext);
 assert.equal(result,undefined);
 assert.deepEqual(permissions,['tenant-id:'+recipient+':PlatformEvent:Order_Updated__e:publish']);
 assert.equal(statements[0],'SAVEPOINT flow_action_2');
 assert.equal(statements.at(-1),'RELEASE SAVEPOINT flow_action_2');
 assert(statements.some(sql=>sql.includes('INSERT INTO md_platform_event_messages')));
});

test('SMTP-based Send Email fails before SQL or queue activity',async()=>{
 const statements:string[]=[];
 const actionContext=context(async(sql)=>{
  statements.push(sql.trim());return {rows:[],rowCount:1};
 });
 actionContext.config={actionType:'Send Email',namedCredentialId:recipient,
  fromEmail:'sales@example.com',recipients:'{!$Record.Email}; second@example.com',
  subject:'Order {!$Record.Id}',body:'Hello {!$Record.Name}'};
 await assert.rejects(()=>executeFlowAction(actionContext),/SMTP-based Flow email actions are disabled/);
 assert.deepEqual(statements,['SAVEPOINT flow_action_2','ROLLBACK TO SAVEPOINT flow_action_2',
  'RELEASE SAVEPOINT flow_action_2']);
});

test('Email Alert fails before querying stored SMTP settings',async()=>{
 const statements:string[]=[];
 const actionContext=context(async(sql)=>{
  statements.push(sql);
  return {rows:[],rowCount:1};
 });
 actionContext.config={actionType:'Email Alert',emailAlertId:'Account_Changed'};
 await assert.rejects(()=>executeFlowAction(actionContext),/SMTP-based Flow email actions are disabled/);
 assert.deepEqual(statements,['SAVEPOINT flow_action_2','ROLLBACK TO SAVEPOINT flow_action_2',
  'RELEASE SAVEPOINT flow_action_2']);
});

test('Custom Notification action routes recipient failures through a savepoint fault connector',async()=>{
 const statements:string[]=[];
 const variables:Record<string,unknown>={};
 const result=await executeFlowAction({...context(async sql=>{
  statements.push(sql.trim());
  return {rowCount:0};
 },async()=>undefined,[{to:9,kind:'fault'}]),variables});
 assert.equal(result,9);
 assert.equal(typeof variables['$Flow.FaultMessage'],'string');
 assert.deepEqual(statements.map(sql=>sql.split(' ').slice(0,2).join(' ')),
  ['SAVEPOINT flow_action_2','INSERT INTO','ROLLBACK TO','RELEASE SAVEPOINT']);
});

test('Create Task requires record edit rights and inserts through the Flow transaction',async()=>{
 const calls:string[]=[];
 const taskContext=context(async(sql,values)=>{
  if(sql.includes('INSERT INTO md_record_activities')){
   assert.deepEqual(values,['tenant-id','Account',recipient,recipient,'Follow up','Call customer','2026-05-01T09:00:00.000Z']);
  }
  return {rowCount:1};
 },async(...args:unknown[])=>{calls.push('object:'+args.join(':'));},[],async(tenantId,userId,objectApi,recordId,action)=>{
  calls.push('record:'+tenantId+':'+userId+':'+objectApi+':'+recordId+':'+action);
 });
 taskContext.config={actionType:'Create Task',objectApiName:'Account',recordId:recipient,
  subject:'Follow up',description:'Call customer',dueAt:'2026-05-01T09:00:00Z'};
 const result=await executeFlowAction(taskContext);
 assert.equal(result,undefined);
 assert.deepEqual(calls,[
  'object:tenant-id:'+recipient+':Account:edit',
  'record:tenant-id:'+recipient+':Account:'+recipient+':edit'
 ]);
});

test('Create Task fails closed when target record edit permission is denied',async()=>{
 let inserts=0;
 const taskContext=context(async sql=>{
  if(sql.includes('INSERT INTO md_record_activities'))inserts++;
  return {rowCount:1};
 },async()=>undefined,[{to:9,kind:'fault'}],async()=>{throw new Error('Record edit denied');});
 taskContext.config={actionType:'Create Task',objectApiName:'Account',recordId:recipient,subject:'Follow up'};
 const result=await executeFlowAction(taskContext);
 assert.equal(result,9);
 assert.equal(inserts,0);
});

test('Post to Chatter requires record edit rights and writes transactionally',async()=>{
 let inserted:unknown[]|undefined;
 const postContext=context(async(sql,values)=>{
  if(sql.includes('INSERT INTO md_record_chatter_posts'))inserted=values;
  return {rowCount:1};
 },async()=>undefined,[],async()=>undefined);
 postContext.config={actionType:'Post to Chatter',objectApiName:'Account',recordId:recipient,
  message:'Hello {!$User.Name}'};
 postContext.resolve=(value:unknown)=>value==='{!$User.Name}'?'Flow user':value;
 const result=await executeFlowAction(postContext);
 assert.equal(result,undefined);
 assert.deepEqual(inserted,['tenant-id','Account',recipient,recipient,'Hello Flow user']);
});

test('Submit for Approval validates active process, tenant approvers and rights before grouped insert',async()=>{
 const approver='00000000-0000-4000-8000-000000000002';
 const groupId='00000000-0000-4000-8000-000000000003';
 const checks:string[]=[],queries:Array<{sql:string;values?:unknown[]}>=[],recordReads:string[]=[];
 const approvalContext=context(async(sql,values)=>{
  queries.push({sql,values});
  if(sql.startsWith('SAVEPOINT ')||sql.startsWith('RELEASE SAVEPOINT '))return {rowCount:0,rows:[]};
  if(sql.includes('FROM md_system_definitions'))return {
   rowCount:1,rows:[{properties:{active:true,objectApiName:'Account',approverUserIds:[approver]}}]
  };
  if(sql.includes('FROM md_records'))return {rowCount:1,rows:[{id:recipient}]};
  if(sql.includes('FROM md_object_definitions'))return {rowCount:1,rows:[{label:'Account'}]};
  if(sql.includes('FROM md_users'))return {rowCount:1,rows:[{id:approver}]};
  if(sql.includes('FROM md_approval_requests'))return {rowCount:0,rows:[]};
  if(sql.includes('gen_random_uuid'))return {rowCount:1,rows:[{id:groupId}]};
  if(sql.includes('INSERT INTO md_approval_requests'))return {rowCount:1,rows:[]};
  throw new Error('Unexpected approval query: '+sql);
 },async(tenantId,userId,resource,action)=>{
  checks.push([tenantId,userId,resource,action].join(':'));
 },[],async(tenantId,userId,objectApi,recordId,action)=>{
  recordReads.push([tenantId,userId,objectApi,recordId,action].join(':'));
 });
 approvalContext.config={actionType:'Submit for Approval',approvalProcessApiName:'Account_Review',
  objectApiName:'Account',recordId:recipient,comments:'Please review'};
 approvalContext.records={get:async()=>({Name:'Account One'})} as never;
 assert.equal(await executeFlowAction(approvalContext),undefined);
 assert.deepEqual(checks,[
  'tenant-id:'+recipient+':ApprovalRequest:manage',
  'tenant-id:'+recipient+':Account:edit',
  'tenant-id:'+approver+':ApprovalRequest:approve'
 ]);
 assert.deepEqual(recordReads,[
  'tenant-id:'+recipient+':Account:'+recipient+':edit',
  'tenant-id:'+approver+':Account:'+recipient+':read'
 ]);
 const insert=queries.find(query=>query.sql.includes('INSERT INTO md_approval_requests'))!;
 assert.deepEqual(insert.values,['tenant-id',groupId,'Account','Account',recipient,'Account One',
  'NotificationFlow',recipient,'Please review',[approver]]);
});

test('Quick Actions invoke the enabled tenant object action through RecordEngine',async()=>{
 const updates:Array<unknown[]>=[];
 const actionLookups:unknown[][]=[];
 const transaction={query:async(sql:string,values:unknown[]=[])=>{
  if(sql.includes('FROM md_object_actions')){
   actionLookups.push(values);
   return {rows:[{field_api:'Status',value_text:'Reviewed'}],rowCount:1};
  }
  return {rows:[],rowCount:1};
 }} as never;
 const permissions:string[]=[];
 const quickActionContext=context(transaction.query,async(...args:unknown[])=>{
  permissions.push(args.join(':'));
 });
 quickActionContext.records={update:async(...args:unknown[])=>{updates.push(args);}} as never;
 quickActionContext.config={actionType:'Quick Actions',objectApiName:'Account',
  quickActionId:'MarkReviewed',recordId:'{!$Record.Id}'};
 quickActionContext.resolve=value=>value==='{!$Record.Id}'?recipient:value;
 assert.equal(await executeFlowAction(quickActionContext),undefined);
 assert.deepEqual(permissions,['tenant-id:'+recipient+':ObjectDefinition:read']);
 assert.deepEqual(actionLookups,[['tenant-id','Account','MarkReviewed']]);
 assert.equal(updates.length,1);
 assert.equal(updates[0][0],'tenant-id');
 assert.equal(updates[0][1],recipient);
 assert.equal(updates[0][2],'Account');
 assert.equal(updates[0][3],recipient);
 assert.deepEqual(updates[0][4],{Status:'Reviewed'});
 assert.equal((updates[0][6] as {query:unknown}).query,transaction.query);
});

test('Flow activation validates the supported SQL-backed Actions',async()=>{
 const rbac={require:async()=>undefined} as unknown as RbacEngine;
 const graph={
  apiName:'NotificationFlow',flowType:'Autolaunched Flow',resources:[],
  elements:[
   {id:1,type:'Start',label:'Start',config:{}},
   {id:2,type:'Action',label:'Notify',config},
   {id:3,type:'End',label:'End',config:{}}
  ],
  connectors:[
   {id:'start-action',from:1,to:2,label:'',kind:'normal'},
   {id:'action-end',from:2,to:3,label:'',kind:'normal'}
  ]
 };
 const valid=await validateFlowDraft(rbac,'tenant-id',recipient,'NotificationFlow',graph);
 assert.equal(valid.valid,true,valid.errors.join('; '));
 const invalid=await validateFlowDraft(rbac,'tenant-id',recipient,'NotificationFlow',{
  ...graph,elements:graph.elements.map(node=>node.id===2
   ?{...node,config:{...config,actionType:'Quick Action'}}:node)
 });
 assert.equal(invalid.valid,false);
 assert.ok(invalid.errors.some(error=>error.includes('Unsupported Flow action')));
 const task=await validateFlowDraft(rbac,'tenant-id',recipient,'NotificationFlow',{
  ...graph,elements:graph.elements.map(node=>node.id===2
   ?{...node,config:{actionType:'Create Task',objectApiName:'Account',recordId:'{!$Record.Id}',
    subject:'Follow up'}}:node)
 });
 assert.equal(task.valid,true,task.errors.join('; '));
 const chatter=await validateFlowDraft(rbac,'tenant-id',recipient,'NotificationFlow',{
  ...graph,elements:graph.elements.map(node=>node.id===2
   ?{...node,config:{actionType:'Post to Chatter',objectApiName:'Account',
    recordId:'{!$Record.Id}',message:'Hello {!$User.Name}'}}:node)
 });
 assert.equal(chatter.valid,true,chatter.errors.join('; '));
 const approval=await validateFlowDraft(rbac,'tenant-id',recipient,'NotificationFlow',{
  ...graph,elements:graph.elements.map(node=>node.id===2
   ?{...node,config:{actionType:'Submit for Approval',approvalProcessApiName:'Account_Review',
    objectApiName:'Account',recordId:'{!$Record.Id}',comments:'Please review'}}:node)
 });
 assert.equal(approval.valid,true,approval.errors.join('; '));
 const quickActionQueries:string[]=[];
 const quickActionDb={query:async(sql:string)=>{
  quickActionQueries.push(sql);return {rows:[{api_name:'MarkReviewed'}]};
 }} as unknown as SqlPersistence;
 const quickAction=await validateFlowDraft(rbac,'tenant-id',recipient,'NotificationFlow',{
  ...graph,elements:graph.elements.map(node=>node.id===2
   ?{...node,config:{actionType:'Quick Actions',objectApiName:'Account',
    quickActionId:'MarkReviewed',recordId:'{!$Record.Id}'}}:node)
 },quickActionDb);
 assert.equal(quickAction.valid,true,quickAction.errors.join('; '));
 assert.deepEqual(quickActionQueries.map(sql=>sql.includes('FROM md_object_actions')), [true]);
});

test('Record-Triggered Flow Custom Error supports page errors and fails closed for unvalidated fields',async()=>{
 const rbac={require:async()=>undefined} as unknown as RbacEngine;
 const graph={
  apiName:'AccountSaveGuard',flowType:'Record-Triggered Flow',resources:[],
  elements:[
   {id:1,type:'Start',config:{object:'Account',trigger:'updated',runWhen:'before-save'}},
   {id:2,type:'Custom Error',config:{errorMessage:'Account is invalid',errorLocation:'Page'}},
   {id:3,type:'End',config:{}}
  ],
  connectors:[{from:1,to:2,kind:'normal'},{from:2,to:3,kind:'normal'}]
 };
 const pageError=await validateFlowDraft(rbac,'tenant-id',recipient,'AccountSaveGuard',graph);
 assert.equal(pageError.valid,true,pageError.errors.join('; '));
 const fieldError=await validateFlowDraft(rbac,'tenant-id',recipient,'AccountSaveGuard',{
  ...graph,elements:graph.elements.map(node=>node.id===2
   ?{...node,config:{errorMessage:'Account is invalid',errorLocation:'Field',fieldName:'Status'}}:node)
 });
 assert.equal(fieldError.valid,false);
 assert.ok(fieldError.errors.some(error=>error.includes('requires metadata validation')));
 const metadataQueries:Array<{sql:string;values:unknown[]}>=[];
 const db={query:async(sql:string,values:unknown[]=[])=>{
  metadataQueries.push({sql,values});return {rows:[{api_name:'Status'}]};
 }} as unknown as SqlPersistence;
 const validatedFieldError=await validateFlowDraft(rbac,'tenant-id',recipient,
  'AccountSaveGuard',{...graph,elements:graph.elements.map(node=>node.id===2
   ?{...node,config:{errorMessage:'Account is invalid',errorLocation:'Field',fieldName:'Status'}}:node)
  },db);
 assert.equal(validatedFieldError.valid,true,validatedFieldError.errors.join('; '));
 assert.deepEqual(metadataQueries[0].values,['tenant-id','Account','Status']);
});

test('Platform Event trigger and publisher validate against tenant event metadata',async()=>{
 const rbac={require:async()=>undefined} as unknown as RbacEngine;
 const db={query:async()=>({rows:[{api_name:'Order_Updated__e',field_api:'Order__c'}]})} as never;
 const graph={
  apiName:'OrderEventFlow',flowType:'Platform Event-Triggered Flow',
  elements:[
   {id:1,type:'Start',config:{object:'Order_Updated__e',entryConditions:[
    {field:'Order__c',operator:'Equals',value:'A-17'}
   ]}},
   {id:2,type:'Publish Platform Event',config:{eventApiName:'Order_Updated__e',
    fieldValues:[{field:'Order__c',value:'{!$Record.Order__c}'}]}},
   {id:3,type:'End',config:{}}
  ],
  connectors:[{from:1,to:2,kind:'normal'},{from:2,to:3,kind:'normal'}],resources:[]
 };
 const validation=await validateFlowDraft(rbac,'tenant-id',recipient,'OrderEventFlow',graph,db);
 assert.equal(validation.valid,false);
 assert.ok(validation.errors.some(error=>error.includes('cannot recursively publish')));
 const withoutPublisher={...graph,flowType:'Autolaunched Flow',
  elements:graph.elements.filter(element=>element.type!=='Publish Platform Event'),
  connectors:[{from:1,to:3,kind:'normal'}]};
 const valid=await validateFlowDraft(rbac,'tenant-id',recipient,'OrderEventFlow',withoutPublisher,db);
 assert.equal(valid.valid,true,valid.errors.join('; '));
});
