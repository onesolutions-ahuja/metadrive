import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {AuthenticationService} from '../../src/system-files/authentication.js';
import type {NamedCredentialService} from '../../src/system-support/named-credential-service.js';
import {SessionPolicyService,enforceLoginBoundary,browserSecurityHeaders,normalizedLoginIp} from '../../src/system-support/session-policy-service.js';
import express from 'express';
import {configureTrustedProxy} from '../../src/system-support/security-web-host.js';
import {FederationService} from '../../src/system-support/federation-service.js';
import {WebAuthnService} from '../../src/system-support/webauthn-service.js';
import {consumeBackupCode} from '../../src/system-support/mfa-backup-service.js';
import {MfaBackupService} from '../../src/system-support/mfa-backup-service.js';
import type {MfaService} from '../../src/system-support/mfa-service.js';
test('session and identity configuration require central Security permissions before SQL',async()=>{
 const db={query:async()=>{throw Error('SQL must not run');},transaction:async()=>{throw Error('SQL must not run');}} as unknown as SqlPersistence;
 const denied={require:async()=>{throw Error('Permission denied');}} as unknown as RbacEngine;
 const sessions=new SessionPolicyService(db,denied),federation=new FederationService(db,denied,{} as NamedCredentialService);
 for(const action of [()=>sessions.read('t','u'),()=>sessions.save('t','u',{}),()=>federation.list('t','u'),()=>federation.save('t','u',{}),()=>federation.link('t','u',{})])
  await assert.rejects(action,/Permission denied/);
});
test('session policy rejects invalid CIDR, hours, timezone and SQL-shaped profile identifiers',async()=>{
 const db={} as SqlPersistence,rbac={require:async()=>{}} as unknown as RbacEngine;
 const service=new SessionPolicyService(db,rbac);
 for(const input of [
  {policy:{idle_minutes:0},ranges:[],hours:[]},
  {policy:{},ranges:[{profile_id:null,kind:'login',network:'0.0.0.0/0); DROP TABLE md_users'}],hours:[]},
  {policy:{},ranges:[{profile_id:'another-tenant',kind:'login',network:'0.0.0.0/0'}],hours:[]},
  {policy:{},ranges:[],hours:[{profile_id:null,weekday:1,start_minute:100,end_minute:50,timezone:'UTC'}]},
  {policy:{},ranges:[],hours:[{profile_id:null,weekday:1,start_minute:0,end_minute:1440,timezone:'Invalid/Timezone'}]}
 ])await assert.rejects(()=>service.save('t','u',input),/Invalid session or login policy/);
});
test('login restrictions fail closed and do not treat a trusted range as a login grant',async()=>{
 const db={query:async(sql:string,args:unknown[])=>{
  assert.match(sql,/md_login_boundary_allowed/);assert.deepEqual(args,['tenant','user',null]);
  return {rows:[{allowed:false,trusted:true}]};
 }} as unknown as SqlPersistence;
 await assert.rejects(()=>enforceLoginBoundary(db,'tenant','user',{ip:'not-an-ip'}),/login restrictions/);
 await assert.rejects(()=>enforceLoginBoundary({query:async()=>({rows:[]})} as unknown as SqlPersistence,'t','u'),/login restrictions/);
});
test('malformed backup codes never reach SQL; successful consumption uses one conditional update',async()=>{
 let calls=0;
 const db={query:async(sql:string,args:unknown[])=>{
  calls++;assert.match(sql,/used_at IS NULL RETURNING/);assert.equal(args[0],'tenant');assert.equal(args[1],'user');
  assert.match(String(args[2]),/^[a-f0-9]{64}$/);return {rows:calls===1?[{}]:[]};
 }} as unknown as SqlPersistence;
 assert.equal(await consumeBackupCode(db,'tenant','user','123456'),false);assert.equal(calls,0);
 assert.equal(await consumeBackupCode(db,'tenant','user','abcde-12345-abcde-12345'),true);
 assert.equal(await consumeBackupCode(db,'tenant','user','abcde-12345-abcde-12345'),false);
});
test('invalid federation state and browser binding fail before remote token verification',async()=>{
 let http=false;
 const vault={identityProviderJson:async()=>{http=true;return {};}} as unknown as NamedCredentialService;
 const service=new FederationService({query:async()=>({rows:[]})} as unknown as SqlPersistence,{} as RbacEngine,vault);
 await assert.rejects(()=>service.callback('bad','browser','code',null),/Invalid federation state/);
 await assert.rejects(()=>service.callback('A'.repeat(43),'wrong-browser','code',null),/Invalid federation state/);
 assert.equal(http,false);
});
test('passkey registration requires a verified registered tenant HTTPS origin',async()=>{
 const service=new WebAuthnService({query:async()=>({rows:[]})} as unknown as SqlPersistence,
  {verifyCurrentPassword:async()=>{}} as unknown as AuthenticationService);
 for(const origin of ['http://example.test','https://example.test/path','https://other-tenant.test'])
  await assert.rejects(()=>service.registrationOptions('tenant','user',origin,'password'),/Invalid WebAuthn origin/);
});
test('browser protection headers enforce frame ancestry and block plugins and inline scripts',()=>{
 const denied=browserSecurityHeaders({frame_policy:'DENY',csp_enabled:true});
 assert.match(denied['Content-Security-Policy']!,/frame-ancestors 'none'/);
 assert.match(denied['Content-Security-Policy']!,/object-src 'none'/);
 assert.ok(!denied['Content-Security-Policy']!.includes("script-src 'self' 'unsafe-inline'"));
 assert.equal(browserSecurityHeaders({frame_policy:'SAMEORIGIN',csp_enabled:false})['X-Frame-Options'],'SAMEORIGIN');
});
test('proxy trust requires explicit networks and mapped IPv4 sockets retain IPv4 policy semantics',()=>{
 for(const raw of ['true','1','*','10.0.0.0/999','127.0.0.1,'])assert.throws(()=>configureTrustedProxy(express(),raw),/Invalid trusted proxy/);
 const app=express();configureTrustedProxy(app,'127.0.0.1,10.0.0.0/8');assert.deepEqual(app.get('trust proxy'),['127.0.0.1','10.0.0.0/8']);
 assert.equal(normalizedLoginIp('::ffff:203.0.113.5'),'203.0.113.5');assert.equal(normalizedLoginIp('invalid'),null);
});
test('administrator MFA reset fails central RBAC before identity checks or SQL',async()=>{
 const recovery=new MfaBackupService({} as SqlPersistence,{} as AuthenticationService,{} as MfaService,
  {require:async()=>{throw Error('Permission denied');}} as unknown as RbacEngine);
 await assert.rejects(()=>recovery.reset('tenant','actor','foreign-user','password','123456'),/Permission denied/);
});
