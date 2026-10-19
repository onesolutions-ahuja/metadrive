import assert from 'node:assert/strict';
import {once} from 'node:events';
const base=new URL('../dist-system/system-files/',import.meta.url);
const support=new URL('../dist-system/system-support/',import.meta.url);
const [{SqlPersistence},{AuthenticationService},{RbacEngine},{RecordEngine},{SystemDefinitionService},{createSystemServer}]=await Promise.all([
 import(new URL('sql-persistence.js',base).href),
 import(new URL('authentication.js',base).href),
 import(new URL('rbac-engine.js',base).href),
 import(new URL('record-engine.js',base).href),
 import(new URL('system-definition-service.js',base).href),
 import(new URL('server.js',support).href)
]);
const sql=process.env.METADRIVE_SQL_TEST_DATABASE_URL;
if(!sql)throw Error('METADRIVE_SQL_TEST_DATABASE_URL required');
const db=new SqlPersistence(sql);
let server;
try{
 const {rows:tenants}=await db.query("SELECT id FROM md_tenants WHERE slug='ci-isolated-tenant'");
 const tenantId=tenants[0]?.id;
 if(!tenantId)throw Error('Run sql-smoke.mjs first');
 const {rows:users}=await db.query("SELECT id FROM md_users WHERE tenant_id=$1 AND email='ci-user@example.invalid'",[tenantId]);
 const userId=users[0]?.id;
 if(!userId)throw Error('HTTP test identity not found');
 const auth=new AuthenticationService(db),password='ci-dynamic-smoke-password-123';
 const hash=await auth.hashPassword(password);
 await db.query("UPDATE md_users SET password_hash=$3 WHERE tenant_id=$1 AND id=$2",[tenantId,userId,hash]);
 const {rows:sets}=await db.query("SELECT id FROM md_permission_sets WHERE tenant_id=$1 AND api_name='CI'",[tenantId]);
 await db.query(`INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
  VALUES($1,$2,'*','*','allow') ON CONFLICT(tenant_id,permission_set_id,resource,action)
  DO UPDATE SET effect='allow'`,[tenantId,sets[0].id]);
 server=createSystemServer(db).listen(0,'127.0.0.1');
 await once(server,'listening');
 const addr=server.address();
 if(!addr||typeof addr==='string')throw Error('HTTP test server address unavailable');
 const baseUrl='http://127.0.0.1:'+addr.port+'/api';
 const http=async(route,{method='GET',body,token}={})=>{
  const response=await fetch(baseUrl+route,{
   method,headers:{...(token?{authorization:'Bearer '+token}:{}),
    ...(body===undefined?{}:{'content-type':'application/json'})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  const payload=response.status===204?null:await response.json().catch(()=>null);
  return {status:response.status,body:payload};
 };
 const login=await http('/auth/login',{method:'POST',
  body:{tenantSlug:'ci-isolated-tenant',email:'ci-user@example.invalid',password}});
 assert.equal(login.status,200,JSON.stringify(login));
 const token=login.body?.access_token;
 assert.equal(typeof token,'string');

 // Durable job administration must honor HTTP authentication, central RBAC and tenant scoping.
 assert.equal((await http('/system/jobs')).status,401);
 const operatorList=await http('/system/jobs',{token});
 assert.equal(operatorList.status,200,JSON.stringify(operatorList));
 assert.ok(Array.isArray(operatorList.body?.jobs));
 const {rows:jobRows}=await db.query(
  "SELECT id FROM md_durable_jobs WHERE tenant_id=$1 AND job_type='ci.concurrent' LIMIT 1",[tenantId]);
 const ciJobId=jobRows[0]?.id;
 assert.ok(ciJobId,'PostgreSQL durable-job fixture is missing');
 const operatorDetail=await http('/system/jobs/'+ciJobId,{token});
 assert.equal(operatorDetail.status,200,JSON.stringify(operatorDetail));
 assert.ok(operatorDetail.body.executions?.some(x=>x.event_type==='claimed'));
 assert.equal((await http('/system/jobs/'+ciJobId+'/decision',{
  method:'POST',token,body:{decision:'retry'}})).status,404,'A completed job must not be requeued');
 assert.equal((await http('/system/jobs/'+ciJobId+'/decision',{
  method:'POST',token,body:{decision:'unsafe'}})).status,400);

 const {rows:restrictedRows}=await db.query(
  "INSERT INTO md_users(tenant_id,email,password_hash) VALUES($1,$2,$3) RETURNING id",
  [tenantId,'ci-restricted@example.invalid',await auth.hashPassword('ci-restricted-password-123')]);
 const restrictedSession=await auth.issuePasswordSession(tenantId,restrictedRows[0].id);
 const restrictedToken=restrictedSession.accessToken;
 assert.equal((await http('/system/jobs',{token:restrictedToken})).status,403);
 assert.equal((await http('/system/jobs/'+ciJobId,{token:restrictedToken})).status,403);
 assert.equal((await http('/system/jobs/'+ciJobId+'/decision',{
  method:'POST',token:restrictedToken,body:{decision:'retry'}})).status,403);

 const {rows:foreignRows}=await db.query("SELECT id FROM md_tenants WHERE slug='ci-durable-tenant-b'");
 const foreignTenant=foreignRows[0]?.id;
 assert.ok(foreignTenant);
 const {rows:foreignUsers}=await db.query(
  "INSERT INTO md_users(tenant_id,email,password_hash) VALUES($1,$2,$3) RETURNING id",
  [foreignTenant,'ci-operator-b@example.invalid',await auth.hashPassword('ci-operator-b-password-123')]);
 const foreignId=foreignUsers[0].id;
 const {rows:foreignSets}=await db.query(
  "INSERT INTO md_permission_sets(tenant_id,api_name) VALUES($1,'CI_JOB_ADMIN') RETURNING id",
  [foreignTenant]);
 await db.query(
  'INSERT INTO md_permission_assignments(tenant_id,user_id,permission_set_id) VALUES($1,$2,$3)',
  [foreignTenant,foreignId,foreignSets[0].id]);
 await db.query(
  "INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect) VALUES($1,$2,'Security','manage','allow')",
  [foreignTenant,foreignSets[0].id]);
 const foreignSession=await auth.issuePasswordSession(foreignTenant,foreignId);
 const foreignToken=foreignSession.accessToken;
 assert.equal((await http('/system/jobs/'+ciJobId,{token:foreignToken})).status,404);
 const foreignList=await http('/system/jobs',{token:foreignToken});
 assert.equal(foreignList.status,200);
 assert.equal(foreignList.body.jobs.length,0,'Tenant B must not see Tenant A executions');

 const {rows:providerJobs}=await db.query(
  "SELECT id FROM md_durable_jobs WHERE tenant_id=$1 AND job_type='ci.provider' AND status='failed' LIMIT 1",
  [tenantId]);
 const providerJobId=providerJobs[0]?.id;
 assert.ok(providerJobId,'Provider reconciliation job fixture missing');
 const {rows:credentialFixture}=await db.query(
  "SELECT id FROM md_named_credentials WHERE tenant_id=$1 AND name='CI_RECONCILE'",
  [tenantId]);
 const {rows:httpReceipts}=await db.query(`
  INSERT INTO md_outbound_execution_receipts
   (tenant_id,execution_key,credential_id,request_method,job_id,state)
  VALUES($1,'ci-http-receipt-2',$2,'POST',$3,'uncertain') RETURNING id`,
  [tenantId,credentialFixture[0].id,providerJobId]);
 const httpReceiptId=httpReceipts[0].id;
 assert.equal((await http('/system/receipts/'+httpReceiptId+'/decision',{
  method:'POST',body:{decision:'confirmed_not_sent',evidenceReference:'provider-verified-1234'}})).status,401);
 assert.equal((await http('/system/receipts/'+httpReceiptId+'/decision',{
  method:'POST',token:restrictedToken,
  body:{decision:'confirmed_not_sent',evidenceReference:'provider-verified-1234'}})).status,403);
 assert.equal((await http('/system/receipts/'+httpReceiptId+'/decision',{
  method:'POST',token:foreignToken,
  body:{decision:'confirmed_not_sent',evidenceReference:'provider-verified-1234'}})).status,404);
 assert.equal((await http('/system/receipts/'+httpReceiptId+'/decision',{
  method:'POST',token,body:{decision:'confirmed_not_sent'}})).status,400);
 assert.equal((await http('/system/receipts/'+httpReceiptId+'/decision',{
  method:'POST',token,
  body:{decision:'confirmed_not_sent',evidenceReference:'provider-verified-1234'}})).status,204);
 assert.equal((await http('/system/receipts/'+httpReceiptId+'/decision',{
  method:'POST',token,
  body:{decision:'confirmed_not_sent',evidenceReference:'provider-verified-1234'}})).status,404);
 const providerDetail=await http('/system/jobs/'+providerJobId,{token});
 assert.equal(providerDetail.status,200);
 assert.ok(providerDetail.body.receipts.some(r=>r.id===httpReceiptId&&r.state==='cleared'));
 assert.ok(providerDetail.body.providerDecisions.some(r=>r.receipt_id===httpReceiptId&&
  r.decision==='confirmed_not_sent'));


 const noAuth=await http('/metadata/dashboards/LiveAudit/data/AuditItem__c');
 assert.equal(noAuth.status,401,'Authenticated-only dynamic API returned unexpected status');

 const svc=new SystemDefinitionService(db,new RbacEngine(db));
 await svc.save(tenantId,userId,'dashboards',{apiName:'LiveAudit',label:'Live Audit',
  status:'Deployed',components:[{id:'audit',objectApiName:'AuditItem__c',type:'Table'}]});
 const list=await http('/records/AuditItem__c',{token});
 assert.equal(list.status,200,JSON.stringify(list));
 assert.ok(Array.isArray(list.body?.records));
 const recordId=list.body?.records[0]?.Id;
 assert.ok(recordId,'SQL fixture record missing');
 const dashboard=await http('/metadata/dashboards/LiveAudit/data/AuditItem__c',{token});
 assert.equal(dashboard.status,200,JSON.stringify(dashboard));
 assert.ok(dashboard.body.records.some(r=>r.Id===recordId),'Dashboard omitted live SQL record');
 const foreignSource=await http('/metadata/dashboards/LiveAudit/data/User',{token});
 assert.notEqual(foreignSource.status,200,'Dashboard leaked unrelated Object data');
 const undeployed=await svc.save(tenantId,userId,'dashboards',{apiName:'DraftAudit',label:'Draft Audit',
  status:'Draft',components:[{id:'audit',objectApiName:'AuditItem__c',type:'Table'}]});
 assert.ok(undeployed);
 const draft=await http('/metadata/dashboards/DraftAudit/data/AuditItem__c',{token});
 assert.notEqual(draft.status,200,'Unpublished dashboard exposed data');
 const record=await http('/records/AuditItem__c/'+encodeURIComponent(recordId),{token});
 assert.equal(record.status,200,JSON.stringify(record));
 const update=await http('/records/AuditItem__c/'+encodeURIComponent(recordId),{
  method:'PUT',token,body:{Name:'HTTP Dynamic'}});
 assert.equal(update.status,200,JSON.stringify(update));
 const verified=await http('/records/AuditItem__c/'+encodeURIComponent(recordId),{token});
 assert.equal(verified.body?.record?.Name,'HTTP Dynamic','Record PUT failed to persist SQL data');

 const {rows:flows}=await db.query(`
  INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
  VALUES($1,'DynamicDebug','Debug Check','Autolaunched Flow',1,true) RETURNING id`,[tenantId]);
 const flowId=flows[0].id;
 await db.query(`INSERT INTO md_flow_nodes(tenant_id,flow_id,api_name,node_type,sort_order)
  VALUES($1,$2,'Start','Start',1),($1,$2,'Finish','End',2)`,[tenantId,flowId]);
 await db.query(`INSERT INTO md_flow_edges(tenant_id,flow_id,source_api,target_api,outcome)
  VALUES($1,$2,'Start','Finish','default')`,[tenantId,flowId]);
 const before=await db.query("SELECT count(*)::integer AS n FROM md_flow_runs WHERE tenant_id=$1",[tenantId]);
 const trace=await http('/flows/DynamicDebug/debug',{method:'POST',token,body:{inputs:{}}});
 assert.equal(trace.status,200,JSON.stringify(trace));
 assert.equal(trace.body?.dryRun,true);
 assert.equal(trace.body?.debugTrace?.length,2);
 const after=await db.query("SELECT count(*)::integer AS n FROM md_flow_runs WHERE tenant_id=$1",[tenantId]);
 assert.equal(after.rows[0].n,before.rows[0].n,'Dry-run debug wrote a Flow run');
 const recordDebug=await http('/flows/DynamicDebug/debug-record',{method:'POST',token,body:{record:{Id:recordId}}});
 assert.notEqual(recordDebug.status,200,'Unsupported triggered Flow debug claimed success');

 const pageBefore=await http('/metadata/pages/AuditItem_Record_Page',{token});
 assert.equal(pageBefore.status,200,JSON.stringify(pageBefore));
 const disabled=await http('/metadata/pages/AuditItem_Record_Page',{method:'DELETE',token});
 assert.equal(disabled.status,204,JSON.stringify(disabled));
 const {rows:pageRows}=await db.query(
  "SELECT enabled FROM md_page_definitions WHERE tenant_id=$1 AND api_name='AuditItem_Record_Page'",[tenantId]);
 assert.equal(pageRows[0]?.enabled,false);
 const stillSaved=await db.query(
  "SELECT count(*)::integer AS n FROM md_lightning_page_details d JOIN md_page_definitions p ON p.tenant_id=d.tenant_id AND p.id=d.page_id WHERE p.tenant_id=$1 AND p.api_name='AuditItem_Record_Page'",[tenantId]);
 assert.equal(stillSaved.rows[0]?.n,1,'Page soft-deletion removed customer metadata');

 // Tenant self-service live usage contains only SQL counts, not business or credential secrets.
 const usage=await http('/tenant/usage',{token});
 assert.equal(usage.status,200,JSON.stringify(usage));
 assert.equal(usage.body?.usage?.counts?.records>=1,true);
 assert.equal(usage.body?.usage?.enforcement,'advisory_only');
 assert.equal(usage.body?.usage?.storageBytes,null);
 const emptyDomains=await http('/tenant/domains',{token});
 assert.equal(emptyDomains.status,200,JSON.stringify(emptyDomains));
 const domain='dynamic-http-fixture.example.org';
 const newClaim=await http('/tenant/domains',{method:'POST',token,body:{hostname:domain}});
 assert.equal(newClaim.status,201,JSON.stringify(newClaim));
 assert.equal(newClaim.body?.status,'PENDING');
 const {rows:unverified}=await db.query('SELECT domain FROM md_tenant_domains WHERE tenant_id=$1 AND domain=$2',[tenantId,domain]);
 assert.equal(unverified.length,0,'Unverified domain became an authenticated origin');
 const domainList=await http('/tenant/domains',{token});
 assert.equal(domainList.status,200,JSON.stringify(domainList));
 assert.equal(domainList.body?.domains?.find(d=>d.hostname===domain)?.status,'PENDING');
 const deletedClaim=await http('/tenant/domains/'+domain,{method:'DELETE',token});
 assert.equal(deletedClaim.status,204,JSON.stringify(deletedClaim));
 const deniedPlatform=await http('/platform/tenants/ci-isolated-tenant/usage',{token});
 assert.notEqual(deniedPlatform.status,200,'Tenant Developer was granted Platform Developer authority');
 const {rows:platformSets}=await db.query(`INSERT INTO md_permission_sets(tenant_id,api_name)
  VALUES($1,'PlatformDeveloper') ON CONFLICT(tenant_id,api_name)
  DO UPDATE SET api_name=EXCLUDED.api_name RETURNING id`,[tenantId]);
 await db.query(`INSERT INTO md_permission_assignments(tenant_id,user_id,permission_set_id)
  VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[tenantId,userId,platformSets[0].id]);
 const changedTargets=await http('/platform/tenants/ci-isolated-tenant/usage-targets',{
  method:'PATCH',token,body:{users:1,records:1,objects:1,flows:1}});
 assert.equal(changedTargets.status,200,JSON.stringify(changedTargets));
 assert.equal(changedTargets.body?.usage?.targets?.records,1);
 assert.ok(changedTargets.body?.usage?.warnings?.includes('records'));
 const platformDomains=await http('/platform/tenants/ci-isolated-tenant/domains',{token});
 assert.equal(platformDomains.status,200,JSON.stringify(platformDomains));

 // Exercise concrete path substitutions from dynamic frontend calls against the live HTTP runtime.
 // A domain 400/403/404 is allowed for deliberately absent fixtures, never the generic SQL 404.
 const checks=[
  ['GET','/apps/MissingApp/home-page'],
  ['POST','/reports/NoReport/run',{}],
  ['GET','/metadata/dashboards/LiveAudit/data/AuditItem__c'],
  ['POST','/flows/DynamicDebug/execute',{inputs:{}}],
  ['PUT','/metadata/route-aliases/MissingApp/missing',{appId:'MissingApp',slug:'missing'}],
  ['DELETE','/metadata/route-aliases/MissingApp/missing',{expectedVersion:1}],
  ['GET','/platform/tenants'],['GET','/platform/tenants/no-such-tenant'],
  ['PATCH','/platform/tenants/no-such-tenant',{name:'Changed'}],
  ['POST','/platform/tenants/no-such-tenant/suspend',{}],
  ['PATCH','/platform/tenants/no-such-tenant/retention',{retentionDays:30}],
  ['GET','/records/AuditItem__c'],['GET','/records/AuditItem__c/'+recordId],
  ['POST','/auth/users/00000000-0000-4000-8000-000000000000/lock',{}],
  ['GET','/routes/resolve/MissingApp/missing'],
  ['PUT','/metadata/pages/UnknownPage',{}],
  ['GET','/metadata/flows/DynamicDebug'],
  ['POST','/flows/DynamicDebug/debug',{inputs:{}}],
  ['POST','/flows/DynamicDebug/debug-record',{record:{Id:recordId}}],
  ['GET','/records/AuditItem__c/'+recordId+'/history'],
  ['GET','/records/AuditItem__c/'+recordId+'/activities'],
  ['GET','/records/AuditItem__c/'+recordId+'/chatter'],
  ['GET','/metadata/pages'],['GET','/metadata/objects'],
  ['GET','/auth/me'],['GET','/notifications'],['GET','/approvals/inbox'],
  ['GET','/metadata/dashboards'],['GET','/metadata/reports'],
  ['POST','/metadata/email-alerts',{apiName:'DynamicMail',label:'Dynamic Mail'}],
  ['GET','/named-credentials'],['GET','/metadata/flow-interviews'],
  ['GET','/metadata/route-aliases'],['GET','/metadata/apps'],
  ['GET','/records/User'],['GET','/metadata/currencies'],
  ['GET','/tenant/company-profile'],['GET','/metadata/permissions'],
  ['GET','/connector-apps/catalog']
 ];
 assert.equal(checks.length,39,'Dynamic API HTTP matrix must preserve 39 calls');
 let completed=0;
 for(const [method,path,body] of checks){
  const reply=await http(path,{method,token,body});
  assert.notEqual(reply.body?.error,'API endpoint not implemented in SQL runtime',
   'Missing SQL route for '+method+' '+path);
  assert.notEqual(reply.status,401,'Unexpected authentication failure for '+method+' '+path);
  completed++;
 }
 console.info('Functional PostgreSQL HTTP contracts: dashboard, records, Flow debug, Page lifecycle, RBAC and '+completed+' dynamic calls passed');
}finally{
 if(server)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
 await db.close();
}
