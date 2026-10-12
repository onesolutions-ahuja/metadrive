import test from 'node:test';
import assert from 'node:assert/strict';
import { digestRecoveryToken, matchesRecoveryToken, assertRecoveryEligible,
  assertRecoveryRedemption, RECOVERY_GRANT } from '../src/tenant-recovery-policy.mjs';
const now = Date.parse('2026-10-15T12:00:00Z');
const good = () => ({
  id: 'case-1', tenantId: 'tenant-A', claimantUserId: 'tenant-admin',
  requestedBy: 'requester', status: 'pending',
  createdAt: '2026-10-13T09:00:00Z',
  identityProofStatus: 'verified', outOfBandVerification: true,
  recoveryContactNotified: true, disputed: false,
  approvals: [
    { id: 'operator-1', platformRole: 'recovery_operator', active: true, mfaVerified: true, approvedAt:'2026-10-14T10:00:00Z' },
    { id: 'operator-2', platformRole: 'recovery_operator', active: true, mfaVerified: true, approvedAt:'2026-10-14T11:00:00Z' }
  ]
});
test('requires two independent MFA operators and cooling period', () => {
  assert.equal(assertRecoveryEligible(good(),now).scope,RECOVERY_GRANT);
  for (const change of [
    c=>{c.approvals[1].id=c.approvals[0].id},
    c=>{c.approvals[0].mfaVerified=false},
    c=>{c.approvals.pop()},
    c=>{c.createdAt='2026-10-15T11:00:00Z'},
    c=>{c.disputed=true},
    c=>{c.outOfBandVerification=false},
    c=>{c.recoveryContactNotified=false},
    c=>{c.claimantIsPlatformOperator=true},
    c=>{c.approvals[0].id=c.requestedBy},
    c=>{c.id=''},
    c=>{c.approvals[0].approvedAt='2026-10-13T10:00:00Z'}
  ]) {const c=good();change(c);assert.throws(()=>assertRecoveryEligible(c,now));}
});
test('single-use short-lived tenant-bound redemption, with MFA', () => {
  const token='a'.repeat(64);
  const invitation={caseId:'case-1',tenantId:'tenant-A',userId:'tenant-admin',
    scope:RECOVERY_GRANT,createdAt:'2026-10-15T11:55:00Z',
    expiresAt:'2026-10-15T12:10:00Z',tokenDigest:digestRecoveryToken(token),usedAt:null};
  const options={tenantId:'tenant-A',userId:'tenant-admin',token,mfaVerified:true,now};
  assert.deepEqual(assertRecoveryRedemption(good(),invitation,options),
    {tenantId:'tenant-A',userId:'tenant-admin',scope:RECOVERY_GRANT});
  assert.equal(matchesRecoveryToken('wrong',invitation.tokenDigest),false);
  assert.throws(()=>assertRecoveryRedemption(good(),invitation,{...options,tenantId:'tenant-B'}));
  assert.throws(()=>assertRecoveryRedemption(good(),{...invitation,usedAt:new Date(now).toISOString()},options));
  assert.throws(()=>assertRecoveryRedemption(good(),invitation,{...options,mfaVerified:false}));
  assert.throws(()=>assertRecoveryRedemption(good(),invitation,{...options,now:now+11*60*1000}));
});
