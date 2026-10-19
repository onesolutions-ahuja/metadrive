import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const built=new URL('../dist-system/system-files/',import.meta.url);
const support=new URL('../dist-system/system-support/',import.meta.url);
const [{SqlPersistence},{applySystemMigrations},{RbacEngine},{SystemDefinitionService}]=await Promise.all([
 'sql-persistence.js','system-migrations.js','rbac-engine.js','system-definition-service.js'
].map(file=>import(new URL(file,file==='system-migrations.js'?support:built).href)));

const url=process.env.METADRIVE_SQL_TEST_DATABASE_URL;
if(!url)throw new Error('METADRIVE_SQL_TEST_DATABASE_URL is required');
const db=new SqlPersistence(url);
try{
 const core=readFileSync(fileURLToPath(new URL('../src/system-files/schema.sql',import.meta.url)),'utf8');
 await db.query(core);
 await applySystemMigrations(db);
 await applySystemMigrations(db);
 await db.verifySchema();
 const tenant=await db.query('INSERT INTO md_tenants(slug,name) VALUES ($1,$2) RETURNING id',['ci-isolated-tenant','CI tenant']);
 const tenantId=tenant.rows[0].id;
 const user=await db.query('INSERT INTO md_users(tenant_id,email,password_hash) VALUES($1,$2,$3) RETURNING id',
  [tenantId,'ci-user@example.invalid','ci-placeholder-hash']);
 const userId=user.rows[0].id;
 const set=await db.query('INSERT INTO md_permission_sets(tenant_id,api_name) VALUES($1,$2) RETURNING id',[tenantId,'CI']);
 await db.query('INSERT INTO md_permission_assignments(tenant_id,user_id,permission_set_id) VALUES($1,$2,$3)',
  [tenantId,userId,set.rows[0].id]);
 await db.query('INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect) VALUES($1,$2,$3,$4,$5)',
  [tenantId,set.rows[0].id,'SystemDefinition:reports','manage','allow']);
 const svc=new SystemDefinitionService(db,new RbacEngine(db));
 const saved=await svc.save(tenantId,userId,'reports',{apiName:'DailySales',label:'Daily Sales'});
 assert.equal(saved.revision,1);
 const updated=await svc.save(tenantId,userId,'reports',{apiName:'DailySales',label:'Daily Sales Updated',revision:1});
 assert.equal(updated.revision,2);
 await assert.rejects(()=>svc.save(tenantId,userId,'reports',{apiName:'DailySales',label:'Stale Update',revision:1}),/revision conflict/);
 await assert.rejects(()=>svc.list(tenantId,userId,'reports'),/Permission denied/);
 await db.query('INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect) VALUES($1,$2,$3,$4,$5)',
  [tenantId,set.rows[0].id,'SystemDefinition:reports','read','allow']);
 assert.equal((await svc.list(tenantId,userId,'reports')).length,1);

 const [{ObjectDefinitionService},{PageRuntime}]=await Promise.all([
   import(new URL('object-definition.js',built).href),
   import(new URL('page-runtime.js',built).href)
 ]);
 const objects=new ObjectDefinitionService(db);
 const object=await objects.create(tenantId,'AuditItem__c','Audit Item',[
   {apiName:'Name',label:'Name',dataType:'Text(80)',required:true}
 ]);
 assert.equal(object.pageLayouts.length,1);
 const layout=await objects.replaceLayouts(tenantId,'AuditItem__c',
   {...object,pageLayouts:[{...object.pageLayouts[0],label:'Custom Layout'}]},object.revision);
 assert.equal(layout.pageLayouts[0].label,'Custom Layout');
 await assert.rejects(()=>objects.replaceLayouts(tenantId,'AuditItem__c',object,object.revision),
   /revision conflict/);

 const pageService=new PageRuntime(db);
 const savedPage=await pageService.save(tenantId,'AuditItem_Record_Page',{
   apiName:'AuditItem_Record_Page',label:'Audit Item Record Page',
   targetObject:'AuditItem__c',pageType:'Record Page',layoutMode:'template',
   canvasWidth:1200,canvasHeight:800,template:'main-sidebar',status:'Active',devices:['Desktop'],
   components:[{id:'details',type:'Field Section',label:'Details',region:'main',visible:true,
     properties:{fieldApiNames:['Name'],style:{width:'100%'}}}],
   activationAssignments:[{id:'default',scope:'Org Default',appId:null,
     profileId:null,recordTypeId:null,formFactors:['Desktop']}]
 });
 assert.equal(savedPage.status,'Active');
 assert.deepEqual(savedPage.components[0].properties.style,{width:'100%'});
 assert.equal((await pageService.resolveRecordPage(tenantId,'AuditItem__c','Records','','master','Desktop')).apiName,
   savedPage.apiName);

 await db.query('INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect) VALUES($1,$2,$3,$4,$5)',
  [tenantId,set.rows[0].id,'*','*','allow']);
 // Exercise the actual Builder SQL contracts, not only route existence.
 const [{AppRuntime},{FlowRuntime}]=await Promise.all([
  import(new URL('app-runtime.js',built).href),
  import(new URL('flow-runtime.js',built).href)
 ]);
 const apps=new AppRuntime(db);
 const appDefinition={
  apiName:'AuditApp',label:'Audit App',description:'SQL builder smoke',brandColor:'#1d4ed8',
  navigationItems:['AuditItem__c'],navigationPageApiNames:[],
  navigationOrder:[{type:'Object',apiName:'AuditItem__c'}],utilityItems:[]
 };
 const createdApp=await apps.saveMetadata(tenantId,'AuditApp',appDefinition,false);
 assert.equal(createdApp.apiName,'AuditApp');
 assert.deepEqual(createdApp.navigationItems,['AuditItem__c']);
 await assert.rejects(()=>apps.saveMetadata(tenantId,'AuditApp',appDefinition,false),/App already exists/);
 const updatedApp=await apps.saveMetadata(tenantId,'AuditApp',
  {...appDefinition,label:'Audit App Updated',revision:createdApp.revision},true);
 assert.equal(updatedApp.revision,createdApp.revision+1);
 assert.equal((await apps.listInstalled(tenantId)).find(item=>item.apiName==='AuditApp')?.label,'Audit App Updated');

 const home=await pageService.save(tenantId,'Audit_App_Home',{
  apiName:'Audit_App_Home',label:'Audit App Home',targetObject:'',pageType:'Home Page',
  layoutMode:'free-canvas',canvasWidth:1200,canvasHeight:800,status:'Active',devices:['Desktop'],
  components:[],activationAssignments:[{id:'appDefault',scope:'App Default',appId:'AuditApp',
   profileId:null,recordTypeId:null,formFactors:['Desktop']}]
 });
 assert.equal((await apps.homePage(tenantId,'AuditApp','desktop'))?.apiName,home.apiName);
 const appPage=await pageService.save(tenantId,'Audit_App_Till',{
  apiName:'Audit_App_Till',label:'Audit Till',targetObject:'AuditItem__c',pageType:'App Page',
  layoutMode:'free-canvas',canvasWidth:1200,canvasHeight:800,status:'Active',devices:['Desktop'],
  components:[],activationAssignments:[{id:'appPage',scope:'App Default',appId:'AuditApp',
   profileId:null,recordTypeId:null,formFactors:['Desktop']}]
 });
 assert.equal((await pageService.resolveAppPage(tenantId,'AuditApp',appPage.apiName,'Desktop'))?.apiName,appPage.apiName);

 const {RecordEngine}=await import(new URL('record-engine.js',built).href);
 const records=new RecordEngine(db,new RbacEngine(db));
 const flows=new FlowRuntime(db,new RbacEngine(db),records);
 const draft={apiName:'AuditCheckout',label:'Audit Checkout',flowType:'Screen Flow',
  status:'Draft',versionNumber:1,activeVersion:null,
  elements:[{id:1,type:'Start',label:'Start',config:{}},
    {id:2,type:'Screen',label:'Payment',config:{fields:[{name:'Amount',required:true,defaultValue:0}]}}],
  connectors:[{id:'1',from:1,to:2,kind:'normal',label:'default'}],
  resources:[],startConfig:{},tests:[],versions:[]};
 const persisted=await flows.saveEditor(tenantId,userId,'AuditCheckout',draft);
 assert.deepEqual(persisted.elements[1].config,draft.elements[1].config);
 assert.equal((await flows.listPage(tenantId,1,'AuditCheckout')).total,1);
 assert.equal((await flows.loadEditor(tenantId,'AuditCheckout')).status,'Draft');
 await assert.rejects(()=>flows.saveEditor(tenantId,userId,'AuditCheckout',
  {...draft,status:'Active'}),/Flow cannot activate/);
 await flows.deleteEditor(tenantId,userId,'AuditCheckout');
 assert.ok(!(await flows.list(tenantId)).some(item=>item.apiName==='AuditCheckout'));
 const simple={apiName:'SimpleAuditFlow',label:'Simple Audit Flow',
  flowType:'Autolaunched Flow',status:'Active',
  elements:[{id:1,type:'Start',label:'Start',config:{}},
    {id:2,type:'End',label:'End',config:{}}],
  connectors:[{id:'1',from:1,to:2,kind:'normal',label:'default'}],
  resources:[],startConfig:{},tests:[],versions:[]};
 assert.equal((await flows.saveEditor(tenantId,userId,'SimpleAuditFlow',simple)).status,'Active');
 assert.equal((await flows.execute(tenantId,'SimpleAuditFlow',userId)).status,'completed');


 // Durable SQL Screen Flow with two screens, backwards navigation, a real shared
 // Create Records operation, and an injected HTTP transport (no network in CI).
 let calloutCount=0;
 const supportedFlows=new FlowRuntime(db,new RbacEngine(db),records,
  async (_tenant,_user,config,variables)=>{
   calloutCount++;
   assert.equal(config.namedCredentialId,'00000000-0000-4000-8000-000000000001');
   assert.equal(variables.Amount,15);
   return {status:200,body:'approved'};
  });
 const checkout={apiName:'AuditScreenCheckout',label:'Audit Screen Checkout',
  flowType:'Screen Flow',status:'Active',resources:[
   {name:'RecordId',availableForOutput:true},
   {name:'PaymentStatus',availableForOutput:true}
  ],startConfig:{},tests:[],versions:[],
  elements:[
   {id:1,type:'Start',label:'Start',config:{}},
   {id:2,type:'Screen',label:'Amount',config:{
    fields:[{apiName:'Amount',type:'Number',label:'Amount',required:true}]}},
   {id:3,type:'Screen',label:'Confirm',config:{
    fields:[{apiName:'Confirmed',type:'Checkbox',label:'Confirm',required:true}]}},
   {id:4,type:'HTTP Callout',label:'Collect payment',config:{
    namedCredentialId:'00000000-0000-4000-8000-000000000001',method:'POST',path:'pay',statusVariable:'PaymentStatus',
    onError:'FAULT_PATH'}},
   {id:5,type:'Create Records',label:'Create invoice',config:{
    object:'AuditItem__c',fieldValues:[{field:'Name',value:'Screen Sale'}],
    resultVariable:'RecordId'}},
   {id:6,type:'End',label:'End',config:{}},
   {id:7,type:'End',label:'Payment failure',config:{}}
  ],connectors:[
   {id:'1',from:1,to:2,kind:'normal',label:'default'},
   {id:'2',from:2,to:3,kind:'normal',label:'Next'},
   {id:'3',from:3,to:4,kind:'normal',label:'Next'},
   {id:'4',from:4,to:5,kind:'normal',label:'default'},
   {id:'5',from:4,to:7,kind:'fault',label:'Fault'},
   {id:'6',from:5,to:6,kind:'normal',label:'default'}
  ]};
 assert.equal((await supportedFlows.saveEditor(tenantId,userId,checkout.apiName,checkout)).status,'Active');
 const first=await supportedFlows.execute(tenantId,checkout.apiName,userId);
 assert.equal(first.screen.id,2);
 await assert.rejects(
  ()=>supportedFlows.advanceInterview(tenantId,userId,first.interviewId,{values:{Amount:null}}),
  /Required Screen field/);
 const second=await supportedFlows.advanceInterview(tenantId,userId,first.interviewId,{values:{Amount:15}});
 assert.equal(second.screen.id,3);
 assert.equal(second.canGoBack,true);
 const back=await supportedFlows.advanceInterview(tenantId,userId,first.interviewId,{action:'back'});
 assert.equal(back.screen.id,2);
 const confirmation=await supportedFlows.advanceInterview(tenantId,userId,first.interviewId,{values:{Amount:15}});
 assert.equal(confirmation.screen.id,3);
 const complete=await supportedFlows.advanceInterview(tenantId,userId,first.interviewId,{values:{Confirmed:true}});
 assert.equal(complete.completed,true);
 assert.equal(complete.outputs.PaymentStatus,200);
 assert.equal(calloutCount,1);
 assert.equal((await records.get(tenantId,userId,'AuditItem__c',complete.outputs.RecordId)).Name,'Screen Sale');
 await assert.rejects(()=>supportedFlows.advanceInterview(tenantId,userId,first.interviewId,{}),/not found/);
 // A rejected callout follows its metadata fault edge and must not create a sale.
 const rejectedFlows=new FlowRuntime(db,new RbacEngine(db),records,
  async()=>{throw new Error('Payment declined');});
 const originalRecords=await db.query(
  "SELECT count(*)::integer AS total FROM md_records WHERE tenant_id=$1 AND object_api='AuditItem__c'",[tenantId]);
 const declined=await rejectedFlows.execute(tenantId,checkout.apiName,userId);
 const secondDeclined=await rejectedFlows.advanceInterview(tenantId,userId,declined.interviewId,
  {values:{Amount:15}});
 assert.equal(secondDeclined.screen.id,3);
 const declinedEnd=await rejectedFlows.advanceInterview(tenantId,userId,declined.interviewId,
  {values:{Confirmed:true}});
 assert.equal(declinedEnd.completed,true);
 assert.equal(declinedEnd.outputs.RecordId,undefined);
 const afterDecline=await db.query(
  "SELECT count(*)::integer AS total FROM md_records WHERE tenant_id=$1 AND object_api='AuditItem__c'",[tenantId]);
 assert.equal(afterDecline.rows[0].total,originalRecords.rows[0].total,
  'A declined card callout must not persist a record');
 const debug=await supportedFlows.debugGraph(tenantId,userId,checkout.apiName,{});
 assert.equal(debug.status,'waiting');
 assert.equal(calloutCount,1);

 const recordId=await records.create(tenantId,userId,'AuditItem__c',{Name:'First',RecordTypeId:'master'});
 const initial=await records.get(tenantId,userId,'AuditItem__c',recordId);
 assert.equal(initial.Name,'First');
 assert.equal(initial.RecordTypeId,'master');
 await records.update(tenantId,userId,'AuditItem__c',recordId,{Name:'Edited'},
  new Date(initial.LastModifiedDate).toISOString());
 const changedRecord=await records.get(tenantId,userId,'AuditItem__c',recordId);
 assert.equal(changedRecord.Name,'Edited');
 // Real PostgreSQL recovery and tenant isolation tests for the shared job substrate.
 const {DurableJobService}=await import(new URL('durable-job-service.js',support).href);
 const durable=new DurableJobService(db);
 const concurrencyId=await durable.enqueue(tenantId,'ci.concurrent',{actorUserId:userId,idempotencyKey:'ci-once'});
 assert.equal(await durable.enqueue(tenantId,'ci.concurrent',{actorUserId:userId,idempotencyKey:'ci-once'}),concurrencyId);
 const [workerA,workerB]=await Promise.all([durable.claim('ci-worker-a',1),durable.claim('ci-worker-b',1)]);
 assert.equal(workerA.length+workerB.length,1,'two workers must not claim the same job');
 const winner=workerA.length?workerA[0]&&'ci-worker-a':'ci-worker-b';
 await durable.renewLease(tenantId,concurrencyId,winner);
 await assert.rejects(
  ()=>durable.renewLease(tenantId,concurrencyId,'ci-other-worker'),
  /Job lease missing or expired/);
 await durable.complete(tenantId,concurrencyId,winner);
 await assert.rejects(
  ()=>durable.renewLease(tenantId,concurrencyId,winner),
  /Job lease missing or expired/);
 assert.equal((await durable.inspect(tenantId,concurrencyId)).status,'completed');
 const {rows:completeHistory}=await db.query(
  'SELECT event_type FROM md_durable_job_history WHERE tenant_id=$1 AND job_id=$2 ORDER BY created_at,id',
  [tenantId,concurrencyId]);
 assert.ok(completeHistory.some(x=>x.event_type==='claimed'));
 assert.ok(completeHistory.some(x=>x.event_type==='completed'));

 const crashedId=await durable.enqueue(tenantId,'ci.external',{actorUserId:userId,idempotencyKey:'ci-crashed'});
 const crashed=await durable.claim('ci-crashed-worker',1);
 assert.equal(crashed[0].id,crashedId);
 await db.query("UPDATE md_durable_jobs SET lease_until=now()-interval '1 second' WHERE tenant_id=$1 AND id=$2",
  [tenantId,crashedId]);
 await durable.claim('ci-recovery-worker',1);
 const afterCrash=await durable.inspect(tenantId,crashedId);
 assert.equal(afterCrash.status,'failed','unknown provider outcome must be quarantined');
 assert.equal(afterCrash.error_code,'FLOW_RECONCILIATION_REQUIRED');
 assert.equal((await durable.claim('ci-other-worker',1)).length,0,'quarantined execution must not replay');
 await assert.rejects(()=>durable.operatorDecision(tenantId,crashedId,userId,'unsafe'),/Invalid job decision/);
 const unrelatedTenant=await db.query('INSERT INTO md_tenants(slug,name) VALUES($1,$2) RETURNING id',
  ['ci-durable-tenant-b','CI isolated tenant B']);
 const tenantB=unrelatedTenant.rows[0].id;
 await assert.rejects(()=>durable.operatorDecision(tenantB,crashedId,userId,'retry'),/Failed job not found/);
 await durable.operatorDecision(tenantId,crashedId,userId,'acknowledge');
 assert.equal((await durable.inspect(tenantId,crashedId)).status,'cancelled');
 const {rows:audits}=await db.query(
  'SELECT decision,actor_id FROM md_durable_job_audit WHERE tenant_id=$1 AND job_id=$2',
  [tenantId,crashedId]);
 assert.deepEqual(audits.map(x=>x.decision),['acknowledge']);
 assert.equal(audits[0].actor_id,userId);
 assert.equal((await durable.claim('ci-recovery-worker',1)).length,0);

 // Explicit retry must keep the same provider idempotency scope.
 const retryId=await durable.enqueue(tenantId,'ci.retry',{actorUserId:userId,idempotencyKey:'ci-retry'});
 const retryFirst=(await durable.claim('ci-retry-worker',1))[0];
 assert.equal(retryFirst.id,retryId);
 const initialScope=retryFirst.execution_scope;
 assert.ok(initialScope);
 await durable.fail(tenantId,retryId,'ci-retry-worker','JOB_EXECUTION_FAILED');
 await durable.operatorDecision(tenantId,retryId,userId,'retry');
 const retrySecond=(await durable.claim('ci-retry-worker-2',1))[0];
 assert.equal(retrySecond.id,retryId);
 assert.equal(retrySecond.execution_scope,initialScope,'manual retry must reuse idempotency scope');
 await durable.complete(tenantId,retryId,'ci-retry-worker-2');
 const recurringId=await durable.enqueue(tenantId,'ci.recurring',{
  actorUserId:userId,idempotencyKey:'ci-recurring',recurrenceSeconds:60
 });
 const occurrence=(await durable.claim('ci-recurring-worker',1))[0];
 assert.equal(occurrence.id,recurringId);
 await durable.complete(tenantId,recurringId,'ci-recurring-worker');
 const {rows:nextOccurrence}=await db.query(
  'SELECT status,execution_scope FROM md_durable_jobs WHERE tenant_id=$1 AND id=$2',
  [tenantId,recurringId]);
 assert.equal(nextOccurrence[0].status,'queued');
 assert.notEqual(nextOccurrence[0].execution_scope,occurrence.execution_scope,
  'completed recurring occurrence must rotate its idempotency scope');

 // Provider unknown outcomes need a persisted reservation and evidence-backed operator release.
 const {rows:credentialRows}=await db.query(`
  INSERT INTO md_named_credentials(tenant_id,name,label,protocol,base_url,auth_type)
  VALUES($1,'CI_RECONCILE','CI reconcile','HTTPS','https://example.com','None') RETURNING id`,[tenantId]);
 const credentialId=credentialRows[0].id;
 const providerJobId=await durable.enqueue(tenantId,'ci.provider',{
  actorUserId:userId,idempotencyKey:'ci-provider'});
 const providerClaim=(await durable.claim('ci-provider-worker',1))[0];
 assert.equal(providerClaim.id,providerJobId);
 await durable.fail(tenantId,providerJobId,'ci-provider-worker','JOB_EXECUTION_FAILED');
 const providerKey=providerClaim.execution_scope+'-9';
 const {rows:providerReceipts}=await db.query(`
  INSERT INTO md_outbound_execution_receipts
   (tenant_id,execution_key,credential_id,request_method,job_id,attempt_number,flow_node_id)
  VALUES($1,$2,$3,'POST',$4,1,'9') RETURNING id`,
  [tenantId,providerKey,credentialId,providerJobId]);
 const receiptId=providerReceipts[0].id;
 const {rows:duplicateReceipts}=await db.query(`
  INSERT INTO md_outbound_execution_receipts
   (tenant_id,execution_key,credential_id,request_method,job_id)
  VALUES($1,$2,$3,'POST',$4)
  ON CONFLICT(tenant_id,execution_key) DO NOTHING RETURNING id`,
  [tenantId,providerKey,credentialId,providerJobId]);
 assert.equal(duplicateReceipts.length,0,'uncertain provider operation must not automatically replay');
 await assert.rejects(
  ()=>durable.providerDecision(tenantB,receiptId,userId,'confirmed_not_sent','evidence-1234'),
  /Reconciliation receipt not found/);
 await assert.rejects(
  ()=>durable.providerDecision(tenantId,receiptId,userId,'confirmed_not_sent',''),
  /evidence required/);
 await durable.providerDecision(tenantId,receiptId,userId,'confirmed_not_sent','provider-ticket-1234');
 const {rows:clearance}=await db.query(
  'SELECT state FROM md_outbound_execution_receipts WHERE tenant_id=$1 AND id=$2',
  [tenantId,receiptId]);
 assert.equal(clearance[0].state,'cleared');
 const {rows:providerAudits}=await db.query(
  'SELECT decision,evidence_reference FROM md_outbound_receipt_audit WHERE tenant_id=$1 AND receipt_id=$2',
  [tenantId,receiptId]);
 assert.deepEqual(providerAudits.map(x=>x.decision),['confirmed_not_sent']);
 assert.equal(providerAudits[0].evidence_reference,'provider-ticket-1234');
 await assert.rejects(
  ()=>durable.providerDecision(tenantId,receiptId,userId,'confirmed_not_sent','provider-ticket-1234'),
  /Reconciliation receipt not found/);

 console.info('SQL system migrations, RBAC and metadata revision smoke: passed');
}finally{await db.close();}
