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

 const recordId=await records.create(tenantId,userId,'AuditItem__c',{Name:'First',RecordTypeId:'master'});
 const initial=await records.get(tenantId,userId,'AuditItem__c',recordId);
 assert.equal(initial.Name,'First');
 assert.equal(initial.RecordTypeId,'master');
 await records.update(tenantId,userId,'AuditItem__c',recordId,{Name:'Edited'},
  new Date(initial.LastModifiedDate).toISOString());
 const changedRecord=await records.get(tenantId,userId,'AuditItem__c',recordId);
 assert.equal(changedRecord.Name,'Edited');
 console.info('SQL system migrations, RBAC and metadata revision smoke: passed');
}finally{await db.close();}
