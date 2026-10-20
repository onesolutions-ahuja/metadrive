import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {AuthenticationService} from '../../src/system-files/authentication.js';
import {auditContext,withAuditContext,setAuditActor,setSqlAuditContext} from '../../src/system-support/audit-context.js';
import {auditCsv,SetupAuditService} from '../../src/system-support/setup-audit-service.js';
import {LicenseService} from '../../src/system-support/license-service.js';
import {SecurityMonitorService,monitorPath} from '../../src/system-support/security-monitor-service.js';
import {ConnectedAppService} from '../../src/system-support/connected-app-service.js';
test('governance administration rejects missing permissions before SQL',async()=>{
 const db={query:async()=>{throw Error('SQL must not run');},transaction:async()=>{throw Error('SQL must not run');}} as unknown as SqlPersistence;
 const rbac={require:async()=>{throw Error('Permission denied');}} as unknown as RbacEngine;
 const audit=new SetupAuditService(db,rbac),license=new LicenseService(db,rbac),monitor=new SecurityMonitorService(db,rbac),connected=new ConnectedAppService(db,{} as AuthenticationService,rbac);
 for(const action of [()=>audit.list('t','u'),()=>audit.coverage('t','u'),()=>audit.catalogue('t','u'),()=>license.describe('t','u'),()=>license.assign('t','u',{}),()=>license.requirement('t','u',{}),()=>license.issue('t','u',{}),()=>monitor.describe('t','u'),()=>monitor.saveRule('t','u',{}),()=>monitor.configure('t','u',{}),()=>monitor.prune('t','u'),()=>connected.describe('t','u'),()=>connected.save('t','u',{})])await assert.rejects(action,/Permission denied/);
});
test('concurrent request audit actors and correlation IDs stay isolated',async()=>{
 await Promise.all(['tenant-a','tenant-b'].map(tenant=>withAuditContext({},async()=>{
  const correlation=auditContext()!.correlationId;setAuditActor(tenant,'user-'+tenant);
  await new Promise(r=>setImmediate(r));assert.equal(auditContext()!.actorTenant,tenant);assert.equal(auditContext()!.correlationId,correlation);
 })));
 assert.equal(auditContext(),undefined);
});
test('SQL audit context uses transaction-local settings and escapes literals',async()=>{
 const calls:string[]=[];await setSqlAuditContext({query:async sql=>{calls.push(sql);}},{correlationId:'id',actorTenant:"tenant'; SELECT secret; --",actorUser:'user'});
 assert.equal(calls.length,1);assert.match(calls[0],/SET LOCAL metadrive.actor_tenant = E'tenant''; SELECT secret; --'/);assert.doesNotMatch(calls[0],/SELECT set_config/);
});
test('audit CSV escapes spreadsheet formulas, quotes and array fields',()=>{
 const csv=auditCsv([{id:'1',row_identifier:'=HYPERLINK("secret")',changed_fields:['a','b']}]);assert.ok(csv.includes("'=HYPERLINK("));assert.ok(csv.includes('""secret""'));assert.ok(csv.includes('"a;b"'));
});
test('monitoring strips query parameters and opaque record segments',()=>{
 assert.equal(monitorPath('/api/records/Contact/493b384e-bbd9-4e05-8fe2-43d9965e6b1c?token=secret'),'/api/records/Contact/:id');
 assert.equal(monitorPath('/api/records/42/a%40b.test'),'/api/records/:number/:value');
});
test('invalid transaction rules and monitoring retention fail before SQL',async()=>{
 const monitor=new SecurityMonitorService({} as SqlPersistence,{require:async()=>{}} as unknown as RbacEngine);
 for(const input of [{enabled:true,retention_days:1},{enabled:true,retention_days:3651}])await assert.rejects(()=>monitor.configure('t','u',input),/Invalid monitoring/);
 await assert.rejects(()=>monitor.saveRule('t','u',{label:'bad',enabled:true,event_type:'api',method:'GET',path_prefix:'https://other.test',threshold:0,window_seconds:60,response:'Block'}),/Invalid transaction/);
 await assert.rejects(()=>monitor.describe('t','u','2026-01-01'),/Invalid monitoring cursor/);
});
test('connected apps reject insecure redirects and unsupported grants before SQL',async()=>{
 const connected=new ConnectedAppService({} as SqlPersistence,{} as AuthenticationService,{require:async()=>{}} as unknown as RbacEngine);
 await assert.rejects(()=>connected.save('t','u',{label:'bad',enabled:false,client_type:'public',require_mfa:true,redirects:['http://client.test/callback'],scopes:['records:read'],users:[]}),/Invalid connected app/);
 for(const grant_type of ['password','client_credentials','implicit'])await assert.rejects(()=>connected.exchange({grant_type}),/Invalid OAuth grant/);
 await assert.rejects(()=>connected.consent('t','u',{response_type:'token'}),/Invalid OAuth authorization/);
});
