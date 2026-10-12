import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAndNotifyRecovery } from '../src/tenant-recovery-verification.mjs';
const caseRow={tenant_id:'tenant-a',claimant_user_id:'user-a',requested_by:'intake',
  status:'pending',disputed:false,identity_proof_status:'pending'};
function pool() {
  const calls=[];
  const client={async query(sql) {
    calls.push(sql);
    if(sql.startsWith('SELECT * FROM tenant_recovery_cases'))
      return {rowCount:1,rows:[caseRow]};
    return {rowCount:1,rows:[{id:'x'}]};
  },release(){calls.push('RELEASE')}};
  return {calls,async connect(){return client}};
}
const evidence={independentlyAuthenticated:true,organizationVerified:true,evidenceDigest:'a'.repeat(64)};
const verifier={id:'verifier',role:'recovery_verifier',trustedMfa:true,active:true};
test('only independently verified evidence and delivered contact notices enable case',async()=>{
  const db=pool();
  const result=await verifyAndNotifyRecovery(db,{caseId:'case-id',verifier,
    independentEvidence:evidence,notifyEnrolledContacts:async()=>({
      allPreEnrolledContactsNotified:true,notifiedCount:2
    })});
  assert.equal(result.verified,true);
  assert.equal(result.contactsNotified,2);
  assert.ok(db.calls.includes('COMMIT'));
});
test('failed contact delivery cannot falsely mark identity verified',async()=>{
  const db=pool();
  await assert.rejects(verifyAndNotifyRecovery(db,{caseId:'case-id',verifier,
    independentEvidence:evidence,notifyEnrolledContacts:async()=>({
      allPreEnrolledContactsNotified:false,notifiedCount:0
    })}));
  assert.ok(db.calls.includes('ROLLBACK'));
  assert.ok(!db.calls.some(x=>x.startsWith('UPDATE tenant_recovery_cases')));
});
test('requester cannot independently verify own case',async()=>{
  const db=pool();
  await assert.rejects(verifyAndNotifyRecovery(db,{caseId:'case-id',
    verifier:{...verifier,id:'intake'},independentEvidence:evidence,
    notifyEnrolledContacts:async()=>({allPreEnrolledContactsNotified:true,notifiedCount:1})}));
  assert.ok(db.calls.includes('ROLLBACK'));
});
test('no verified evidence cannot initiate transaction',async()=>{
  const db=pool();
  await assert.rejects(verifyAndNotifyRecovery(db,{caseId:'case-id',verifier,
    independentEvidence:{...evidence,organizationVerified:false},
    notifyEnrolledContacts:async()=>({allPreEnrolledContactsNotified:true,notifiedCount:1})}));
  assert.equal(db.calls.length,0);
});
