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
 console.info('SQL system migrations, RBAC and metadata revision smoke: passed');
}finally{await db.close();}
