import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {MfaService} from '../../src/system-support/mfa-service.js';
import type {PlatformTenantService} from '../../src/system-files/platform-tenant-service.js';
import type {NamedCredentialService} from '../../src/system-support/named-credential-service.js';
import {TenantRecoveryContacts,newRecoveryToken,tokenDigest} from '../../src/system-support/tenant-recovery-contacts.js';
import {TenantRecoveryCases} from '../../src/system-support/tenant-recovery-cases.js';

test('recovery contact enrollment is denied without tenant security permissions',async()=>{
 let sql=0,mfa=0,email=0;
 const contacts=new TenantRecoveryContacts({
  query:async()=>{sql++;throw Error('No SQL access expected');}
 } as unknown as SqlPersistence,{
  require:async()=>{throw Error('Permission denied');}
 } as unknown as RbacEngine,{
  verifyFresh:async()=>{mfa++;}
 } as unknown as MfaService,{
  sendTenantEmail:async()=>{email++;}
 } as unknown as NamedCredentialService);
 await assert.rejects(()=>contacts.enroll('tenant','actor',{
  email:'recovery@example.net',mfaCode:'123456'}),/Permission denied/);
 assert.deepEqual({sql,mfa,email},{sql:0,mfa:0,email:0});
});
test('platform recovery cannot open cases without independent platform authority',async()=>{
 let sql=0,mfa=0,email=0;
 const cases=new TenantRecoveryCases({
  query:async()=>{sql++;throw Error('Unexpected SQL');}
 } as unknown as SqlPersistence,{} as RbacEngine,{
  requirePlatform:async()=>{throw Error('Permission denied');}
 } as unknown as PlatformTenantService,{
  verifyFresh:async()=>{mfa++;}
 } as unknown as MfaService,{} as TenantRecoveryContacts,{
  sendTenantEmail:async()=>{email++;}
 } as unknown as NamedCredentialService);
 await assert.rejects(()=>cases.open({tenant_id:'platform',user_id:'operator'},{
  tenantId:'123e4567-e89b-42d3-a456-426614174000',
  claimantUserId:'123e4567-e89b-42d3-a456-426614174001',mfaCode:'123456'
 }),/Permission denied/);
 assert.deepEqual({sql,mfa,email},{sql:0,mfa:0,email:0});
});
test('recovery contact and case proof tokens are not stored in plaintext',()=>{
 const token=newRecoveryToken();
 assert.match(token,/^[A-Za-z0-9_-]{43}$/);
 assert.notEqual(tokenDigest(token),token);
 assert.match(tokenDigest(token),/^[a-f0-9]{64}$/);
});
