import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PlatformTenantService} from '../../src/system-files/platform-tenant-service.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

test('tenant list binds every SQL argument including pagination and default search',async()=>{
 const queries:Array<{sql:string;args:unknown[]}>=[],db={
  query:async(sql:string,args:unknown[])=>{queries.push({sql,args});return {rows:sql.includes('AS authorised')?[{authorised:false}]:sql.includes('AS total')?[{total:'1'}]:[{id:'t',slug:'tenant',name:'Tenant',description:'',status:'ACTIVE',created_at:new Date('2026-10-18T00:00:00Z'),updated_at:new Date('2026-10-18T00:00:00Z'),archived_at:null,retention_until:null,legal_hold:false,users:'1',active_users:'1'}]};}
 } as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const result=await new PlatformTenantService(db,rbac).list('00000000-0000-4000-8000-000000000001','u',{status:'ALL',page:1,pageSize:25});
 assert.equal(result.total,1);
 assert.match(queries[1].sql,/LIMIT \$4 OFFSET \$5/);
 assert.deepEqual(queries[1].args,['00000000-0000-4000-8000-000000000001',null,'ALL',25,0]);
 assert.deepEqual(queries[2].args,['00000000-0000-4000-8000-000000000001',null,'ALL']);
});

test('tenant suspension uses an audited SQL transaction and revokes both token families',async()=>{
 const operations:Array<{sql:string;args:unknown[]}>= [];
 const db={
  query:async(sql:string,args:unknown[])=>{
   if(sql.includes('AS authorised'))return {rows:[{authorised:true}]};
   return {rows:[]};
  },
  transaction:async(run:(client:{query:(sql:string,args?:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>
   run({query:async(sql:string,args:unknown[]=[])=>{
    operations.push({sql,args});
    if(sql.includes('SELECT id,status FROM md_tenants'))return {rows:[{id:'target-tenant',status:'ACTIVE'}]};
    return {rows:[],rowCount:1};
   }})
 } as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const service=new PlatformTenantService(db,rbac);
 await assert.rejects(()=>service.transition('actor-tenant','actor-user','target','suspend'),/Tenant not found/);
 assert.equal(operations.filter(x=>x.sql.includes('UPDATE md_sessions')).length,1);
 assert.equal(operations.filter(x=>x.sql.includes('UPDATE md_refresh_sessions')).length,1);
 const audit=operations.find(x=>x.sql.includes('INSERT INTO md_tenant_lifecycle_audit'));
 assert.deepEqual(audit?.args,['actor-tenant','actor-user','target-tenant','suspend','ACTIVE','SUSPENDED']);
});
test('tenant developer cannot transition other tenants without OneEngine assignment',async()=>{
 const db={query:async(sql:string)=>{
  if(sql.includes('AS authorised'))return {rows:[{authorised:false}]};
  throw Error('Unexpected query');
 }} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 await assert.rejects(()=>new PlatformTenantService(db,rbac).transition('tenant','user','other','suspend'),/Permission denied/);
});

test('platform tenant provisioning rejects domains outside the configured platform-owned base',async()=>{
 const saved=process.env.METADRIVE_TENANT_BASE_DOMAIN;
 process.env.METADRIVE_TENANT_BASE_DOMAIN='example.org';
 try{
  const db={query:async(sql:string)=>{
   if(sql.includes('AS authorised'))return {rows:[{authorised:true}]};
   throw new Error('Unexpected SQL');
  }} as unknown as SqlPersistence;
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  const service=new PlatformTenantService(db,rbac);
  await assert.rejects(()=>service.create('tenant','user',{
   tenantId:'customer',tenantName:'Customer',adminName:'Admin',
   email:'dev@example.org',password:'VeryStrongPassword123!',
   developerDomain:'another-company.example.net'
  },'123e4567-e89b-42d3-a456-426614174000'),/Invalid tenant domain/);
 }finally{
  if(saved===undefined)delete process.env.METADRIVE_TENANT_BASE_DOMAIN;
  else process.env.METADRIVE_TENANT_BASE_DOMAIN=saved;
 }
});
test('tenant request retries reuse the same SQL tenant and reject changes to request identity',async()=>{
 const {TenantProvisioning}=await import('../../src/system-files/tenant-provisioning.js');
 const {createHash}=await import('node:crypto');
 const request={slug:'customer',name:'Customer',domain:'customer.example.org',
   developerEmail:'admin@customer.example.org',developerPassword:'StrongPassword123!',developerName:'Tenant Developer'};
 const digest=createHash('sha256').update(JSON.stringify([
  request.slug,request.name,request.domain,request.developerEmail,request.developerPassword,request.developerName
 ])).digest('hex');
 const statements:string[]=[];
 let created=false;
 const db={transaction:async(run:(client:{query:(sql:string,args?:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>
  run({query:async(sql:string,args:unknown[]=[])=>{
   statements.push(sql);
   if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
   if(sql.includes('SELECT p.request_digest'))return {rows:created?[{request_digest:digest,slug:request.slug,domain:request.domain}]:[]};
   if(sql.includes('SELECT id FROM md_tenants WHERE slug'))return {rows:[],rowCount:0};
   if(sql.includes('INSERT INTO md_tenants'))return {rows:[{id:'new-tenant'}],rowCount:1};
   if(sql.includes('INSERT INTO md_users'))return {rows:[{id:'new-user'}],rowCount:1};
   if(sql.includes('INSERT INTO md_profiles'))return {rows:[{id:'new-profile'}],rowCount:1};
   if(sql.includes('INSERT INTO md_roles'))return {rows:[{id:'new-role'}],rowCount:1};
   if(sql.includes('INSERT INTO md_permission_sets'))return {rows:[{id:'new-set'}],rowCount:1};
   if(sql.includes('INSERT INTO md_tenant_provisioning_requests'))created=true;
   return {rows:[],rowCount:1};
  }})
 } as unknown as SqlPersistence;
 const provisioning=new TenantProvisioning(db);
 const authority={actorTenantId:'actor-tenant',actorUserId:'actor-user',idempotencyKey:'123e4567-e89b-42d3-a456-426614174000'};
 assert.equal((await provisioning.provision(request,authority)).replayed,false);
 assert.equal((await provisioning.provision(request,authority)).replayed,true);
 assert.equal(statements.filter(q=>q.includes('INSERT INTO md_tenants')).length,1);
 assert.equal(statements.filter(q=>q.includes('INSERT INTO md_tenant_lifecycle_audit')).length,1);
 await assert.rejects(()=>provisioning.provision({...request,name:'Different'},authority),/Idempotency key conflict/);
});


test('platform authority checks OneEngine membership rather than deprecated PlatformDeveloper',async()=>{
 let query='';
 const db={query:async(sql:string)=>{query=sql;return {rows:[{authorised:true}]};}} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 await new PlatformTenantService(db,rbac).requirePlatform('tenant','user');
 assert.ok(query.includes("p.api_name='OneEngine'"));
 assert.doesNotMatch(query,/PlatformDeveloper/);
});
