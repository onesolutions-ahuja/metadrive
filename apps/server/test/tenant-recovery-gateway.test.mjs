import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecoveryGateway } from '../src/tenant-recovery-gateway.mjs';

function harness(verifyAttestation = async()=>{ throw Error('untrusted'); }) {
  const queries = [];
  const pool = {async query(sql) {
    queries.push(sql);
    return {rowCount:1,rows:[{tenant_id:'tenant-a',claimant_user_id:'user-a',status:'pending'}]};
  },async connect(){ throw Error('must not start transaction'); }};
  return {queries,gateway:createRecoveryGateway({
    pool,verifyAttestation,
    notifyEnrolledContacts:async()=>{throw Error('not configured');},
    deliverToVerifiedContact:async()=>{throw Error('not configured');}
  })};
}
test('gateway refuses missing trusted service dependencies',()=>{
  assert.throws(()=>createRecoveryGateway({}));
});
test('forged operator role and MFA cannot authorize approval',async()=>{
  const h=harness(async()=>({id:'op',role:'recovery_operator',active:true,trustedMfa:false,
    tenantId:'tenant-a',caseId:'00000000-0000-0000-0000-000000000001'}));
  await assert.rejects(h.gateway.approve({
    caseId:'00000000-0000-0000-0000-000000000001',operatorAttestation:'forged'
  }));
  assert.equal(h.queries.length,1);
});
test('wrong tenant and claimant attestations cannot redeem',async()=>{
  const h=harness(async()=>({id:'user-b',role:'recovery_claimant',active:true,trustedMfa:true,
    tenantId:'tenant-a',claimantUserId:'user-a',
    caseId:'00000000-0000-0000-0000-000000000001'}));
  await assert.rejects(h.gateway.redeem({
    caseId:'00000000-0000-0000-0000-000000000001',tenantId:'tenant-a',
    claimantAttestation:'signed',token:'secret'
  }));
});
test('intake is bound to exact tenant and claimant and cannot self-authorize',async()=>{
  const h=harness(async()=>({id:'user-a',role:'recovery_intake',active:true,trustedMfa:true,
    tenantId:'tenant-a',claimantUserId:'user-a'}));
  await assert.rejects(h.gateway.openCase({
    tenantId:'tenant-a',claimantUserId:'user-a',intakeAttestation:'signed'
  }));
  assert.equal(h.queries.length,0);
});
