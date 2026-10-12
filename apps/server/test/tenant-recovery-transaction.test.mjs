import test from 'node:test';
import assert from 'node:assert/strict';
import { approveRecoveryCase, redeemRecoveryInvitation } from '../src/tenant-recovery-transaction.mjs';

// Fake connection verifies rollback / release when the independent-approval
// gate fails, and that untrusted operators can never start a transaction.
function fakePool(caseRow, approvals = []) {
  const calls = [];
  const client = { async query(sql) {
    calls.push(sql);
    if (sql.startsWith('SELECT * FROM tenant_recovery_cases')) return { rowCount: 1, rows: [caseRow] };
    if (sql.startsWith('SELECT * FROM tenant_recovery_approvals')) return { rowCount: approvals.length, rows: approvals };
    return { rowCount: 1, rows: [{ id: 'x' }] };
  }, release() { calls.push('RELEASE'); } };
  return { calls, async connect() { return client; } };
}
const c = { id: '00000000-0000-0000-0000-000000000001', tenant_id: 'tenant-a',
  claimant_user_id: 'user-a', requested_by: 'requester', status: 'pending',
  created_at: '2026-10-10T00:00:00Z', identity_proof_status: 'verified',
  out_of_band_verified: true, contacts_notified: true, disputed: false };
test('rejects untrusted operator before opening transaction', async () => {
  const db = fakePool(c);
  await assert.rejects(approveRecoveryCase(db, { caseId: c.id,
    operator: { id: 'admin', role: 'recovery_operator', active: true } }));
  assert.deepEqual(db.calls, []);
});
test('approval rejects requester and rolls back with release', async () => {
  const db = fakePool(c);
  await assert.rejects(approveRecoveryCase(db, { caseId: c.id,
    operator: { id: 'requester', role: 'recovery_operator', active: true, trustedMfa: true },
    now: new Date('2026-10-12T00:00:00Z') }));
  assert.ok(db.calls.includes('ROLLBACK'));
  assert.ok(db.calls.includes('RELEASE'));
  assert.ok(!db.calls.includes('COMMIT'));
});
test('redemption rejects wrong tenant before consuming token', async () => {
  const db = fakePool(c);
  await assert.rejects(redeemRecoveryInvitation(db, {
    caseId: c.id, tenantId: 'tenant-b', claimant: { id: 'user-a', active: true, trustedMfa: true },
    token: 'a'.repeat(64), now: new Date('2026-10-12T00:00:00Z')
  }));
  assert.ok(db.calls.includes('ROLLBACK'));
  assert.ok(!db.calls.some(s => s.startsWith('UPDATE tenant_recovery_invitations')));
});
