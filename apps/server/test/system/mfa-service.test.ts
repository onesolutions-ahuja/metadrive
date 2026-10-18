import assert from 'node:assert/strict';
import {test} from 'node:test';
import {base32,totpAt,MfaService} from '../../src/system-support/mfa-service.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {AuthenticationService} from '../../src/system-files/authentication.js';
import type {NamedCredentialService} from '../../src/system-support/named-credential-service.js';

test('RFC 6238 six-digit SHA1 verification vector',()=>{
 const secret=base32(Buffer.from('12345678901234567890','ascii'));
 assert.equal(totpAt(secret,1),'287082');
 assert.match(totpAt(secret,2),/^[0-9]{6}$/);
});

test('tenant MFA policy rejects unauthorized updates before SQL operations',async()=>{
 let accessed=false;
 const db={query:async()=>{accessed=true;return {rows:[]};},transaction:async()=>{accessed=true;}} as unknown as SqlPersistence;
 const rbac={require:async()=>{throw Error('Permission denied');}} as unknown as RbacEngine;
 const service=new MfaService(db,rbac,{} as AuthenticationService,{} as NamedCredentialService);
 await assert.rejects(service.setPolicy('t','user','Required'),/Permission denied/);
 assert.equal(accessed,false);
});

test('login challenge verification never creates a session after invalid code',async()=>{
 let issued=false;
 const db={
  transaction:async<T>(callback:(client:{query:(sql:string,args?:unknown[])=>Promise<unknown>})=>Promise<T>)=>callback({
   query:async(sql:string)=>{
    if(sql.includes('FROM md_mfa_login_challenges'))return {rows:[{id:'challenge',tenant_id:'t',user_id:'u',enrollment_secret_ciphertext:Buffer.from('encrypted'),key_id:'legacy'}]};
    return {rows:[],rowCount:1};
   }
  })
 } as unknown as SqlPersistence;
 const auth={issueMfaSession:async()=>{issued=true;return {};}} as unknown as AuthenticationService;
 const vault={decryptOpaque:()=>base32(Buffer.from('12345678901234567890','ascii'))} as unknown as NamedCredentialService;
 const service=new MfaService(db,{} as RbacEngine,auth,vault);
 await assert.rejects(service.verifyChallenge('A'.repeat(43),'invalid'),/Invalid authenticator code/);
 assert.equal(issued,false);
});
