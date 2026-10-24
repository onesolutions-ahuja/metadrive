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
 assert.equal((await pageService.resolveAppPage(tenantId,'AuditApp',appPage.apiName,'Desktop'))?.page.apiName,appPage.apiName);

 const {RecordEngine}=await import(new URL('record-engine.js',built).href);
 const records=new RecordEngine(db,new RbacEngine(db));

 // Validate the real SQL outbox → RecordEngine → Communication persistence.
 const [{seedCommunicationObjects},{createIntegrationCommunicationWriter,
  IntegrationCommunicationOutbox}]=await Promise.all([
   import(new URL('core-communication-objects.js',
    new URL('../dist-system/app-seeders/',import.meta.url)).href),
   import(new URL('integration-api-log.js',support).href)
 ]);
 await db.transaction(client=>seedCommunicationObjects(client,tenantId));
 const {rows:[loggerAccount]}=await db.query(
  'SELECT md_ensure_communication_logger($1::uuid) AS id',[tenantId]);
 assert.ok(loggerAccount.id);
 const loggerUser=await db.query(
  'SELECT enabled,password_hash FROM md_users WHERE tenant_id=$1 AND id=$2',
  [tenantId,loggerAccount.id]);
 assert.equal(loggerUser.rows[0].enabled,true);
 assert.equal(loggerUser.rows[0].password_hash,'!no-interactive-login!');
 const communicationWriter=createIntegrationCommunicationWriter(db,
  new RecordEngine(db,new RbacEngine(db)));
 const communicationOutbox=new IntegrationCommunicationOutbox(db,communicationWriter);
 await communicationOutbox.write({
  tenantId,direction:'Outbound',transport:'HTTP',provider:'onesys_sms_gate',
  actorUserId:userId,endpoint:'https://api.example.invalid/send',
  method:'POST',statusCode:200,outcome:'success',
  communication:{channel:'SMS',recipient:'447700900000',
   body:'SQL real outbox delivery test',externalMessageId:'sql-sms-'+tenantId}
 });
 const delivery=await db.query(
  "SELECT r.id FROM md_records r JOIN md_record_values v ON v.tenant_id=r.tenant_id "+
  "AND v.record_id=r.id AND v.field_api='ExternalMessageId' WHERE r.tenant_id=$1 "+
  "AND r.object_api='Communication' AND r.is_deleted=false AND v.value_text=$2",
  [tenantId,'sql-sms-'+tenantId]);
 assert.equal(delivery.rows.length,1,'Communication must materialize in md_records');
 const sms=await records.get(tenantId,userId,'Communication',delivery.rows[0].id);
 assert.equal(sms.Channel,'SMS');
 assert.equal(sms.Direction,'Outbound');
 assert.equal(sms.Body,'SQL real outbox delivery test');
 const pending=await db.query(
  'SELECT count(*)::int AS n FROM md_communication_delivery_outbox WHERE tenant_id=$1',[tenantId]);
 assert.equal(pending.rows[0].n,0,'Materialized Communication leaves no outbox backlog');
 console.info('Real PostgreSQL Communication outbox delivery and record read: passed');

 // Phase 1 actual PostgreSQL lifecycle/relationship contracts.
 // No mocked query engine: exercise SQL constraints, record permissions and restoration.
 const {RecordRetentionService}=await import(new URL('record-retention-service.js',support).href);
 const retention=new RecordRetentionService(db,new RbacEngine(db));
 const lifecycleAccount=await objects.create(tenantId,'LifecycleAccount__c','Lifecycle Account',[
   {apiName:'Name',label:'Name',dataType:'Text(80)',required:true,unique:true}
 ]);
 const lifecycleDetail=await objects.create(tenantId,'LifecycleDetail__c','Lifecycle Detail',[
   {apiName:'Name',label:'Name',dataType:'Text(80)',required:true},
   {apiName:'AccountId',label:'Account',dataType:'Master-Detail(LifecycleAccount__c)',required:true,
     relationship:{type:'Master-Detail',targetObject:'LifecycleAccount__c',
      relationshipName:'Account',childRelationshipName:'Details'}}
 ]);
 assert.ok(lifecycleAccount&&lifecycleDetail);
 const parent=await records.create(tenantId,userId,'LifecycleAccount__c',{Name:'Reusable unique'});
 const otherParent=await records.create(tenantId,userId,'LifecycleAccount__c',{Name:'Other parent'});
 const dependent=await records.create(tenantId,userId,'LifecycleDetail__c',
   {Name:'Cascaded detail',AccountId:parent});
 await records.create(tenantId,userId,'LifecycleDetail__c',{Name:'Other detail',AccountId:otherParent});
 const lookupObject=await objects.create(tenantId,'LifecycleLookup__c','Lifecycle Lookup',[
   {apiName:'Name',label:'Name',dataType:'Text(80)',required:true},
   {apiName:'AccountId',label:'Account',dataType:'Lookup(LifecycleAccount__c)',
    relationship:{type:'Lookup',targetObject:'LifecycleAccount__c',
      relationshipName:'Account',childRelationshipName:'Lookups',deleteBehavior:'Clear'}}
 ]);
 assert.ok(lookupObject);
 const lookup=await records.create(tenantId,userId,'LifecycleLookup__c',
   {Name:'Restorable lookup',AccountId:parent});
 const linked=await records.list(tenantId,userId,'LifecycleDetail__c',50,0,
   {relatedField:'AccountId',relatedId:parent});
 assert.equal(linked.total,1,'related list must not include children of another parent');
 assert.equal(linked.records[0].Id,dependent);

 await db.query(`INSERT INTO md_record_activities(tenant_id,object_api,record_id,created_by,kind,subject)
   VALUES($1,$2,$3,$4,'Task','Retained during recycle')`,
   [tenantId,'LifecycleAccount__c',parent,userId]);
 await records.remove(tenantId,userId,'LifecycleAccount__c',parent);
 assert.equal((await records.get(tenantId,userId,'LifecycleLookup__c',lookup)).AccountId,null,
   'deleted lookup target must be cleared on an active source');
 assert.equal((await records.list(tenantId,userId,'LifecycleDetail__c')).total,1,
   'Master-Detail children must be hidden while recycled');
 assert.equal((await records.recycleBin(tenantId,userId,'LifecycleAccount__c')).total,1);
 await assert.rejects(()=>records.get(tenantId,userId,'LifecycleAccount__c',parent),
   /Record not found/);
 const replacement=await records.create(tenantId,userId,'LifecycleAccount__c',{Name:'Reusable unique'});
 await assert.rejects(()=>records.restore(tenantId,userId,'LifecycleAccount__c',parent),
   /duplicate key|unique/i,'restore must reject collisions with replacement records');
 assert.equal((await records.recycleBin(tenantId,userId,'LifecycleAccount__c')).total,1,
   'failed restore must roll back the full deletion group');
 await records.update(tenantId,userId,'LifecycleAccount__c',replacement,{Name:'New unique name'});
 const recovered=await records.restore(tenantId,userId,'LifecycleAccount__c',parent);
 assert.equal(recovered.restored,2,'restore must include dependent Master-Detail records');
 assert.equal((await records.get(tenantId,userId,'LifecycleLookup__c',lookup)).AccountId,parent,
   'restore must recover the original lookup without changing the source record');

 assert.equal((await records.list(tenantId,userId,'LifecycleDetail__c',50,0,
   {relatedField:'AccountId',relatedId:parent})).total,1);
 const retainedActivity=await db.query(
  'SELECT 1 FROM md_record_activities WHERE tenant_id=$1 AND record_id=$2',
  [tenantId,parent]);
 assert.equal(retainedActivity.rowCount,1,'normal delete and restore must retain activities');
 assert.deepEqual(await retention.get(tenantId,userId),
   {retentionDays:15,automaticPurgeEnabled:false});
 await retention.set(tenantId,userId,1,false);
 await records.remove(tenantId,userId,'LifecycleAccount__c',replacement);
 await db.query(`UPDATE md_records SET deleted_at=now()-interval '2 days'
   WHERE tenant_id=$1 AND deletion_root_id=$2`,[tenantId,replacement]);
 assert.deepEqual(await retention.purge(tenantId,userId,'LifecycleAccount__c',replacement),
   {purged:1});
 assert.equal((await db.query('SELECT 1 FROM md_records WHERE tenant_id=$1 AND id=$2',
   [tenantId,replacement])).rowCount,0);
 assert.equal((await retention.purgeExpired()).purged,0,
   'opt-in retention scan must not delete without automatic-purge enablement');

 const flows=new FlowRuntime(db,new RbacEngine(db),records);
 // Phase 2: real SQL Action registry, permission evaluation, CRUD and activity integration.
 const {ObjectQuickActionRuntime}=await import(new URL('object-quick-action-runtime.js',support).href);
 const {RecordCollaborationService}=await import(new URL('record-collaboration-service.js',support).href);
 const quickActions=new ObjectQuickActionRuntime(db,new RbacEngine(db),records,
   new RecordCollaborationService(db,new RbacEngine(db)),flows);
 const actionConfig=[
   ['CallAccount','Call Customer','Log Call',null,'Customer follow-up',null,null,null],
   ['NewDetail','New Detail','Create Related',null,null,'LifecycleDetail__c','AccountId',null]
 ];
 for(const [id,label,behavior,field,value,target,relationship,flow] of actionConfig)
   await db.query(`INSERT INTO md_object_actions
     (tenant_id,object_api,action_id,label,action_type,enabled,behavior,field_api,
      value_text,target_object_api,relationship_field_api,flow_api_name)
     VALUES($1,'LifecycleAccount__c',$2,$3,'Custom',true,$4,$5,$6,$7,$8,$9)`,
     [tenantId,id,label,behavior,field,value,target,relationship,flow]);
 const allowed=await quickActions.available({tenant_id:tenantId,user_id:userId},'LifecycleAccount__c',parent);
 assert.ok(allowed.actionIds.includes('CallAccount')&&allowed.actionIds.includes('NewDetail'));
 const quickRelated=await quickActions.execute(
  {tenant_id:tenantId,user_id:userId},'LifecycleAccount__c',parent,'NewDetail',{Name:'Quick child'});
 assert.equal(quickRelated.objectApiName,'LifecycleDetail__c');
 assert.equal((await records.get(tenantId,userId,'LifecycleDetail__c',quickRelated.recordId)).AccountId,parent);
 const call=await quickActions.execute(
  {tenant_id:tenantId,user_id:userId},'LifecycleAccount__c',parent,'CallAccount',{description:'Spoke to client'});
 assert.equal(call.status,'completed');
 assert.equal((await db.query(`SELECT kind FROM md_record_activities
    WHERE tenant_id=$1 AND object_api='LifecycleAccount__c' AND record_id=$2 AND subject='Customer follow-up'`,
    [tenantId,parent])).rows[0]?.kind,'Call');
 // Tenant-global action settings and execution share the same runtime.
 const {GlobalQuickActionMetadataService}=await import(
  new URL('global-quick-action-metadata.js',support).href);
 const globalSettings=new GlobalQuickActionMetadataService(db,new RbacEngine(db));
 await globalSettings.save(tenantId,userId,[{id:'CreateGlobalAccount',label:'Create Global Account',
   behavior:'Create Record',enabled:true,targetObjectApi:'LifecycleAccount__c'}]);
 const globalOptions=await quickActions.globalAvailable({tenant_id:tenantId,user_id:userId});
 assert.ok(globalOptions.actions.some(x=>x.id==='CreateGlobalAccount'),
  'global action must be visible to authorized tenant developer');
 const globalResult=await quickActions.executeGlobal(
   {tenant_id:tenantId,user_id:userId},'CreateGlobalAccount',{Name:'Global action created'});
 assert.equal(globalResult.objectApiName,'LifecycleAccount__c');
 assert.equal((await records.get(tenantId,userId,'LifecycleAccount__c',globalResult.recordId)).Name,
   'Global action created');


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
 // End-to-end SQL Screen Flow: Get Records -> Data Table -> Selected Rows -> Loop -> Create Records.
 const mealFirst=await records.create(tenantId,userId,'AuditItem__c',{Name:'Meal Source Chicken'});
 const mealSecond=await records.create(tenantId,userId,'AuditItem__c',{Name:'Meal Source Sides'});
 const mealSelectionFlow={apiName:'AuditMealRecordSelection',label:'Meal record selections',
  flowType:'Screen Flow',status:'Active',startConfig:{},tests:[],versions:[],
  resources:[
   {name:'MealOptions',label:'Meal options',type:'Record Collection',
    dataType:'AuditItem__c',isCollection:true,availableForInput:false,availableForOutput:false},
   {name:'SelectedMeals',label:'Selected meals',type:'Record Collection',
    dataType:'AuditItem__c',isCollection:true,availableForInput:false,availableForOutput:false}
  ],
  elements:[
   {id:1,type:'Start',label:'Start',config:{}},
   {id:2,type:'Get Records',label:'Options',config:{object:'AuditItem__c',
     recordLimit:'all',outputVariable:'MealOptions',conditions:[
       {field:'Name',operator:'Starts With',value:'Meal Source '}] }},
   {id:3,type:'Screen',label:'Choose meal',config:{fields:[
     {apiName:'Chosen',label:'Choose',type:'Data Table',collection:'MealOptions',
      columns:['Name'],multiselect:true,selectedRowsResource:'SelectedMeals',
      minimumSelections:1,maximumSelections:2,required:true}]}},
   {id:4,type:'Loop',label:'Selected products',config:{collection:'SelectedMeals',
     loopVariable:'CurrentMeal',direction:'First to last'}},
   {id:5,type:'Create Records',label:'Copy selection',config:{object:'AuditItem__c',
     fieldValues:[{field:'Name',value:'{!CurrentMeal.Name}'}]}},
   {id:6,type:'End',label:'Complete',config:{}}
  ],
  connectors:[
   {id:'1',from:1,to:2,kind:'normal',label:'default'},
   {id:'2',from:2,to:3,kind:'normal',label:'default'},
   {id:'3',from:3,to:4,kind:'normal',label:'Next'},
   {id:'4',from:4,to:5,kind:'normal',label:'For Each'},
   {id:'5',from:5,to:4,kind:'normal',label:'default'},
   {id:'6',from:4,to:6,kind:'normal',label:'After Last'}
  ]};
 assert.equal((await supportedFlows.saveEditor(tenantId,userId,mealSelectionFlow.apiName,
   mealSelectionFlow)).status,'Active');
 const selectionStart=await supportedFlows.execute(tenantId,mealSelectionFlow.apiName,userId);
 assert.equal(selectionStart.screen.id,3);
 assert.deepEqual(selectionStart.screenResources.MealOptions.map(row=>row.Id).sort(),
   [mealFirst,mealSecond].sort());
 const selectionRun=selectionStart.interviewId;
 await assert.rejects(()=>supportedFlows.advanceInterview(tenantId,userId,selectionRun,{
   values:{Chosen:['00000000-0000-4000-8000-000000000099']}}),
   /not in the permitted record collection/);
 await assert.rejects(()=>supportedFlows.advanceInterview(tenantId,userId,selectionRun,{
   values:{Chosen:[]}}),/selection count/);
 const beforeSelected=(await db.query("SELECT count(*)::int AS total FROM md_records WHERE tenant_id=$1 AND object_api='AuditItem__c'",
   [tenantId])).rows[0].total;
 const selectedComplete=await supportedFlows.advanceInterview(tenantId,userId,selectionRun,
   {values:{Chosen:[mealSecond,mealFirst]}});
 assert.equal(selectedComplete.completed,true);
 const afterSelected=(await db.query("SELECT count(*)::int AS total FROM md_records WHERE tenant_id=$1 AND object_api='AuditItem__c'",
   [tenantId])).rows[0].total;
 assert.equal(afterSelected,beforeSelected+2,'Selected Rows Loop must create exactly two records');
 console.info('Screen Data Table typed selections -> Loop -> Create Records SQL smoke passed');

 const recordId=await records.create(tenantId,userId,'AuditItem__c',{Name:'First',RecordTypeId:'master'});
 const initial=await records.get(tenantId,userId,'AuditItem__c',recordId);
 assert.equal(initial.Name,'First');
 assert.equal(initial.RecordTypeId,'master');
 await records.update(tenantId,userId,'AuditItem__c',recordId,{Name:'Edited'},
  new Date(initial.LastModifiedDate).toISOString());
 const changedRecord=await records.get(tenantId,userId,'AuditItem__c',recordId);
 assert.equal(changedRecord.Name,'Edited');
 // Live PostgreSQL acceptance: declarative rule evaluation shares the existing record transaction.
 await objects.addField(tenantId,'AuditItem__c','Code__c','Text(80)',undefined,'Code');
 await db.query(`INSERT INTO md_field_default_formulas
   (tenant_id,object_api,field_api,expression) VALUES($1,$2,$3,$4)`,
   [tenantId,'AuditItem__c','Code__c','LOWER($Record.Name)']);
 await db.query(`INSERT INTO md_validation_rules
   (tenant_id,object_api,api_name,label,expression,error_message,error_field_api,active)
   VALUES($1,$2,$3,$4,$5,$6,$7,true)`,
   [tenantId,'AuditItem__c','NoBadName','Block bad names','BEGINS($Record.Name, "Bad")',
     'Name cannot start with Bad','Name']);
 const beforeInvalid=await db.query(`SELECT count(*)::integer AS total
   FROM md_records WHERE tenant_id=$1 AND object_api=$2`,[tenantId,'AuditItem__c']);
 await assert.rejects(()=>records.create(tenantId,userId,'AuditItem__c',{Name:'Bad record'}),
   /Name cannot start with Bad/);
 const afterInvalid=await db.query(`SELECT count(*)::integer AS total
   FROM md_records WHERE tenant_id=$1 AND object_api=$2`,[tenantId,'AuditItem__c']);
 assert.equal(afterInvalid.rows[0].total,beforeInvalid.rows[0].total,
   'A failed validation rule must roll back the record save');
 const calculatedId=await records.create(tenantId,userId,'AuditItem__c',{Name:'Validated'});
 assert.equal((await records.get(tenantId,userId,'AuditItem__c',calculatedId)).Code__c,'validated');
 await assert.rejects(()=>records.update(tenantId,userId,'AuditItem__c',calculatedId,{Name:'Bad update'}),
   /Name cannot start with Bad/);
 assert.equal((await records.get(tenantId,userId,'AuditItem__c',calculatedId)).Name,'Validated');
 // Order-of-execution contract: before-save changes are validated before insert/after-save.
 const failedPhases=[];
 records.setRecordTriggerHandler(async(_tx,_tenant,_actor,_object,_operation,record,_prior,phase)=>{
   failedPhases.push(phase);
   if(phase==='before-save')return {...record,Name:'Bad from before-save'};
   return record;
 });
 await assert.rejects(()=>records.create(tenantId,userId,'AuditItem__c',{Name:'Originally valid'}),
   /Name cannot start with Bad/);
 assert.deepEqual(failedPhases,['before-save'],
   'A failed validation rule must prevent after-save Flow execution');
 const successPhases=[];
 records.setRecordTriggerHandler(async(_tx,_tenant,_actor,_object,_operation,record,_prior,phase)=>{
   successPhases.push(phase);return record;
 });
 await records.create(tenantId,userId,'AuditItem__c',{Name:'Flow order good'});
 assert.deepEqual(successPhases,['before-save','after-save']);
 console.info('SQL system migrations, RBAC and declarative rule acceptance: passed');
}finally{await db.close();}
