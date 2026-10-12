import { randomUUID } from 'node:crypto';

// This service only records security cases in the isolated platform-control
// database. It never authenticates tenant users or grants permissions.
async function atomic(pool, fn) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await fn(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
}
function trusted(actor, role) {
  if (!actor || actor.trustedMfa !== true || actor.active !== true ||
      actor.role !== role || typeof actor.id !== 'string' || !actor.id)
    throw new Error('Trusted recovery authority required');
}
function identifier(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}
async function event(db, id, actor, name, digest = null) {
  await db.query('INSERT INTO tenant_recovery_events(case_id,actor_id,event_type,evidence_digest) VALUES($1,$2,$3,$4)',
    [id, actor, name, digest]);
}
// Accept only an authenticated, pre-enrolled tenant recovery requester.
// Raw identity papers, email addresses and account secrets are not recorded.
export async function openRecoveryCase(pool, { tenantId, claimantUserId, requester, now = new Date() }) {
  trusted(requester, 'recovery_intake');
  if (!identifier(tenantId) || !identifier(claimantUserId) ||
      requester.id === claimantUserId || !Number.isFinite(new Date(now).getTime()))
    throw new Error('Invalid recovery case request');
  const id = randomUUID();
  return atomic(pool, async db => {
    const existing = await db.query(
      "SELECT id FROM tenant_recovery_cases WHERE tenant_id=$1 AND claimant_user_id=$2 AND status IN ('pending','approved') FOR UPDATE",
      [tenantId, claimantUserId]);
    if (existing.rowCount) throw new Error('An active recovery case already exists');
    await db.query(
      "INSERT INTO tenant_recovery_cases(id,tenant_id,claimant_user_id,requested_by,status,created_at,updated_at) VALUES($1,$2,$3,$4,'pending',$5,$5)",
      [id, tenantId, claimantUserId, requester.id, now]);
    await event(db, id, requester.id, 'case_opened');
    return { caseId: id, status: 'pending' };
  });
}
// Any independently authenticated enrolled contact can dispute. A dispute
// permanently invalidates pending invitations, including already delivered
// messages; no automatic re-opening is permitted.
export async function disputeRecoveryCase(pool, { caseId, contact, now = new Date() }) {
  trusted(contact, 'recovery_contact');
  if (!identifier(caseId) && !/^[a-f0-9-]{36}$/i.test(caseId))
    throw new Error('Invalid case identifier');
  return atomic(pool, async db => {
    const r = await db.query('SELECT * FROM tenant_recovery_cases WHERE id=$1 FOR UPDATE', [caseId]);
    if (r.rowCount !== 1) throw new Error('Recovery case unavailable');
    const c = r.rows[0];
    if (c.status !== 'pending' && c.status !== 'approved') throw new Error('Recovery case closed');
    if (contact.tenantId !== c.tenant_id || contact.preEnrolled !== true)
      throw new Error('Recovery contact is not independently enrolled');
    await db.query(
      "UPDATE tenant_recovery_cases SET status='disputed',disputed=true,updated_at=$2 WHERE id=$1",
      [caseId, now]);
    await db.query(
      'UPDATE tenant_recovery_invitations SET used_at=$2 WHERE case_id=$1 AND used_at IS NULL',
      [caseId, now]);
    await event(db, caseId, contact.id, 'case_disputed');
    return { caseId, status: 'disputed' };
  });
}
