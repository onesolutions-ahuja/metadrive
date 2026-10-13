import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RECOVERY_POLICY, normalizeRecoveryPolicy, renderRecoveryTemplate, deliverWithFallback } from '../src/recovery-policy.ts';
test('recovery defaults to tenant-safe email OTP', () => {
 const policy = normalizeRecoveryPolicy(null);
 assert.equal(policy.method, 'OTP');
 assert.equal(policy.defaultChannel, 'email');
 assert.deepEqual(policy.allowedChannels, ['email']);
 assert.equal(policy.fallback, 'TENANT_PLATFORM_HTTP');
});
test('template allows tenant fields but not arbitrary secrets', () => {
 assert.equal(renderRecoveryTemplate('{!Tenant.Id} {!Tenant.Name}: {!Verification.Value}', {
   'Tenant.Id':'t1','Tenant.Name':'UNE','Verification.Value':'123456'
 }), 't1 UNE: 123456');
 assert.throws(()=>renderRecoveryTemplate('{!Provider.Secret}', {'Provider.Secret':'no'}));
});
test('provider fallback keeps same channel and stops on success', async () => {
 const attempted: string[] = [], failed: string[] = [];
 const provider=await deliverWithFallback([
   { provider:'tenant', send:async()=>{attempted.push('tenant');throw Error('fail')} },
   { provider:'platform', send:async()=>{attempted.push('platform')} },
   { provider:'http', send:async()=>{attempted.push('http')} }
 ], (id)=>failed.push(id));
 assert.equal(provider,'platform');assert.deepEqual(attempted,['tenant','platform']);assert.deepEqual(failed,['tenant']);
});
