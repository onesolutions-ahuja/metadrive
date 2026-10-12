import test from 'node:test';
import assert from 'node:assert/strict';
import { issueRecoveryInvitation } from '../src/tenant-recovery-transaction.mjs';
const now = new Date('2026-10-15T12:00:00Z');
const caseRecord = { id:'00000000-0000-0000-0000-000000000001', tenant_id:'tenant-a',
  claimant_user_id:'user-a', requested_by:'support-intake', status:'pending',
  created_at:'2026-10-13T09:00:00Z', identity_proof_status:'verified',
  out_of_band_verified:true, contacts_notified:true, disputed:false };
const approvals = ['operator-1','operator-2'].map((id,i)=>({
  operator_id:id, operator_role:'recovery_operator', mfa_verified:true,
  operator_active:true, approved_at:'2026-10-14T1'+i+':00:00Z'
}));
function db() {
  const calls = [], bindings = [];
  const client = { async query(sql, args) {
    calls.push(sql);
    bindings.push(args);
    if(sql.startsWith('SELECT * FROM tenant_recovery_cases')) return {rowCount:1,rows:[caseRecord]};
    if(sql.startsWith('SELECT * FROM tenant_recovery_approvals')) return {rowCount:2,rows:approvals};
    return {rowCount:1,rows:[{id:'ok'}]};
  }, release() { calls.push('RELEASE'); } };
  return {calls,bindings,async connect(){ return client; }};
}
const operator = {id:'operator-3', role:'recovery_operator', trustedMfa:true, active:true};
test('no invitation is issued without private verified delivery', async ()=>{
  const pool = db();
  await assert.rejects(issueRecoveryInvitation(pool,{caseId:caseRecord.id,operator,now}));
  assert.deepEqual(pool.calls,[]);
});
test('operator receives receipt but never bearer token', async ()=>{
  const pool = db();
  let delivered;
  const result = await issueRecoveryInvitation(pool,{caseId:caseRecord.id,operator,now,
    deliverToVerifiedContact: async message => { delivered=message; }});
  assert.equal(result.delivered,true);
  assert.equal('token' in result,false);
  assert.equal(typeof delivered.token,'string');
  assert.ok(delivered.token.length >= 40);
  assert.ok(pool.calls.includes('COMMIT'));
  assert.ok(!JSON.stringify(pool.bindings).includes(delivered.token));
});
test('delivery failure rolls back and does not commit', async ()=>{
  const pool=db();
  await assert.rejects(issueRecoveryInvitation(pool,{caseId:caseRecord.id,operator,now,
    deliverToVerifiedContact:async()=>{throw new Error('delivery unavailable');}}));
  assert.ok(pool.calls.includes('ROLLBACK'));
  assert.ok(!pool.calls.includes('COMMIT'));
});
