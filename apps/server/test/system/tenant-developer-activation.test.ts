import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {AuthenticationService} from '../../src/system-files/authentication.js';
import type {MfaService} from '../../src/system-support/mfa-service.js';
import {TenantDeveloperService} from '../../src/system-support/tenant-developer-service.js';

test('tenant developer activation rejects permission denial before MFA and SQL',async()=>{
 let protectedOps=0;
 const service=new TenantDeveloperService({
  transaction:async()=>{protectedOps++;throw Error('Should not reach SQL');}
 } as unknown as SqlPersistence,{
  require:async()=>{throw Error('Permission denied');}
 } as unknown as RbacEngine,{
  hashPassword:async()=>{protectedOps++;throw Error('Should not hash');}
 } as unknown as AuthenticationService,{
  verifyFresh:async()=>{protectedOps++;throw Error('Should not verify');}
 } as unknown as MfaService);
 await assert.rejects(()=>service.activate('tenant','actor',{
  password:'SomeVeryLongNewPassword!',mfaCode:'123456'}),/Permission denied/);
 assert.equal(protectedOps,0);
});
test('developer activation demands a fresh verified TOTP before changing user state',async()=>{
 let sqlTouched=false;
 const service=new TenantDeveloperService({
  transaction:async()=>{sqlTouched=true;}
 } as unknown as SqlPersistence,{
  require:async()=>{}
 } as unknown as RbacEngine,{
  hashPassword:async()=>{sqlTouched=true;return 'encoded';}
 } as unknown as AuthenticationService,{
  verifyFresh:async()=>{throw Error('Invalid or previously used authenticator code');}
 } as unknown as MfaService);
 await assert.rejects(()=>service.activate('tenant','actor',{
  password:'SomeVeryLongNewPassword!',mfaCode:'123456'}),/previously used/);
 assert.equal(sqlTouched,false);
});
test('fresh provisioning seeds a distinct disabled developer identity',()=>{
 const code=readFileSync(new URL('../../src/system-files/tenant-provisioning.ts',import.meta.url),'utf8');
 for(const fragment of ["developerIdentityEmail='developer@'+domain",
  "randomBytes(48).toString('base64url')","'Tenant Developer',false",
  "INSERT INTO md_tenant_developer_accounts"])
  assert.ok(code.includes(fragment),fragment);
});
