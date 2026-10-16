import test from 'node:test';
import assert from 'node:assert/strict';
import { openRecoveryCase, disputeRecoveryCase } from '../src/tenant-recovery-cases.mjs';
function pool(caseRow) {
  const calls = [];
  const db = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes('FROM tenant_recovery_cases') && sql.includes('SELECT id')) return { rowCount: 0, rows: [] };
      if (sql.includes('FROM tenant_recovery_cases') && sql.includes('SELECT *')) return { rowCount: 1, rows: [caseRow] };
      return { rowCount: 1, rows: [{ id: 'ok' }] };
    },
    release() { calls.push('RELEASE'); }
  };
  return { calls, async connect() { return db; } };
}
test('untrusted recovery requester cannot create case', async () => {
  const db = pool();
  await assert.rejects(openRecoveryCase(db,{ tenantId:'tenant-a', claimantUserId:'user-a',
    requester: { id:'support', role:'recovery_intake', active:true }}));
  assert.equal(db.calls.length, 0);
});
test('recovery intake creates pending case with audit atomically', async () => {
  const db = pool();
  const res = await openRecoveryCase(db,{ tenantId:'tenant-a', claimantUserId:'user-a',
    requester: { id:'support', role:'recovery_intake', active:true, trustedMfa:true }});
  assert.equal(res.status, 'pending');
  assert.ok(db.calls.includes('COMMIT'));
  assert.ok(db.calls.some(s => s.includes('tenant_recovery_events')));
});
test('a trusted pre-enrolled tenant contact can permanently dispute a case', async () => {
  const db = pool({ tenant_id:'tenant-a', status:'pending' });
  const res = await disputeRecoveryCase(db,{ caseId:'00000000-0000-0000-0000-000000000001',
    contact: { id:'contact', role:'recovery_contact', tenantId:'tenant-a',
      preEnrolled:true, active:true, trustedMfa:true }});
  assert.equal(res.status, 'disputed');
  assert.ok(db.calls.some(s => s.includes('UPDATE tenant_recovery_invitations')));
  assert.ok(db.calls.includes('COMMIT'));
});
test('cross-tenant dispute is rejected and rolled back', async () => {
  const db = pool({ tenant_id:'tenant-a', status:'pending' });
  await assert.rejects(disputeRecoveryCase(db,{ caseId:'00000000-0000-0000-0000-000000000001',
    contact: { id:'attacker', role:'recovery_contact', tenantId:'tenant-b',
      preEnrolled:true, active:true, trustedMfa:true }}));
  assert.ok(db.calls.includes('ROLLBACK'));
  assert.ok(!db.calls.some(s => s.includes('UPDATE tenant_recovery_cases')));
});
