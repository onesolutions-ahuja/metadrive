import { randomBytes, randomUUID } from 'node:crypto';
import { assertRecoveryEligible, assertRecoveryRedemption, digestRecoveryToken, INVITATION_TTL_MS, RECOVERY_GRANT } from './tenant-recovery-policy.mjs';

// The pool must connect only to the isolated platform-control database. Callers must
// verify identity, current operator membership and MFA through trusted server code.
async function transaction(pool, task) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await task(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
}
function requirePrincipal(actor, role) {
  if (!actor || actor.trustedMfa !== true || actor.active !== true ||
      typeof actor.id !== 'string' || !actor.id || (role && actor.role !== role))
    throw new Error('Trusted active MFA principal required');
}
async function loadCase(db, caseId) {
  const c = await db.query('SELECT * FROM tenant_recovery_cases WHERE id=$1 FOR UPDATE', [caseId]);
  if (c.rowCount !== 1) throw new Error('Recovery case unavailable');
  const a = await db.query('SELECT * FROM tenant_recovery_approvals WHERE case_id=$1', [caseId]);
  const r = c.rows[0];
  return { id: r.id, tenantId: r.tenant_id, claimantUserId: r.claimant_user_id,
    requestedBy: r.requested_by, status: r.status, createdAt: r.created_at,
    identityProofStatus: r.identity_proof_status, outOfBandVerification: r.out_of_band_verified,
    recoveryContactNotified: r.contacts_notified, disputed: r.disputed,
    approvals: a.rows.map(x => ({ id: x.operator_id, platformRole: x.operator_role,
      mfaVerified: x.mfa_verified, active: x.operator_active, approvedAt: x.approved_at })) };
}
async function audit(db, caseId, actor, type) {
  await db.query('INSERT INTO tenant_recovery_events(case_id,actor_id,event_type) VALUES($1,$2,$3)',
    [caseId, actor, type]);
}
export async function approveRecoveryCase(pool, { caseId, operator, now = new Date() }) {
  requirePrincipal(operator, 'recovery_operator');
  return transaction(pool, async db => {
    const c = await loadCase(db, caseId);
    const elapsed = new Date(now).getTime() - new Date(c.createdAt).getTime();
    if (c.status !== 'pending' || c.disputed || c.identityProofStatus !== 'verified' ||
        !c.outOfBandVerification || !c.recoveryContactNotified ||
        !Number.isFinite(elapsed) || elapsed < 86400000 ||
        operator.id === c.claimantUserId || operator.id === c.requestedBy ||
        c.approvals.some(a => a.id === operator.id))
      throw new Error('Independent recovery approval denied');
    await db.query('INSERT INTO tenant_recovery_approvals(case_id,operator_id,operator_role,operator_active,mfa_verified,approved_at) VALUES($1,$2,$3,true,true,$4)',
      [caseId, operator.id, 'recovery_operator', now]);
    await audit(db, caseId, operator.id, 'approved');
    return { caseId };
  });
}
export async function issueRecoveryInvitation(pool, { caseId, operator, now = new Date() }) {
  requirePrincipal(operator, 'recovery_operator');
  return transaction(pool, async db => {
    const c = await loadCase(db, caseId);
    assertRecoveryEligible(c, new Date(now).getTime());
    const token = randomBytes(32).toString('base64url');
    const expiry = new Date(new Date(now).getTime() + INVITATION_TTL_MS);
    await db.query('INSERT INTO tenant_recovery_invitations(id,case_id,tenant_id,claimant_user_id,token_sha256,scope,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [randomUUID(), caseId, c.tenantId, c.claimantUserId, digestRecoveryToken(token), RECOVERY_GRANT, now, expiry]);
    await audit(db, caseId, operator.id, 'invitation_issued');
    // Deliver only to an independently verified contact; never to a platform operator.
    return { token, expiresAt: expiry.toISOString(), tenantId: c.tenantId, userId: c.claimantUserId };
  });
}
export async function redeemRecoveryInvitation(pool, { caseId, tenantId, claimant, token, now = new Date() }) {
  requirePrincipal(claimant);
  return transaction(pool, async db => {
    const c = await loadCase(db, caseId);
    const row = await db.query('SELECT * FROM tenant_recovery_invitations WHERE case_id=$1 FOR UPDATE', [caseId]);
    if (row.rowCount !== 1) throw new Error('Recovery invitation unavailable');
    const i = row.rows[0];
    const grant = assertRecoveryRedemption(c, {
      caseId: i.case_id, tenantId: i.tenant_id, userId: i.claimant_user_id,
      scope: i.scope, createdAt: i.issued_at, expiresAt: i.expires_at,
      usedAt: i.used_at, tokenDigest: i.token_sha256
    }, { tenantId, userId: claimant.id, token, mfaVerified: true, now: new Date(now).getTime() });
    const updated = await db.query('UPDATE tenant_recovery_invitations SET used_at=$2 WHERE id=$1 AND used_at IS NULL RETURNING id', [i.id, now]);
    if (updated.rowCount !== 1) throw new Error('Recovery invitation already used');
    const closed = await db.query("UPDATE tenant_recovery_cases SET status='redeemed',updated_at=$2 WHERE id=$1 AND status='pending' RETURNING id", [caseId, now]);
    if (closed.rowCount !== 1) throw new Error('Recovery case no longer pending');
    await audit(db, caseId, claimant.id, 'invitation_redeemed');
    // This is an instruction, NOT a tenant session or applied privilege.
    return { ...grant, caseId, requiresRestrictedTenantRepair: true };
  });
}
