// No HTTP route exposes this helper. The caller must be a privileged trusted
// recovery-verification service, not a request-body supplied "verified" flag.
const hexDigest = /^[0-9a-f]{64}$/;
function trustedVerifier(verifier, claimant, requestedBy) {
  return verifier && verifier.active === true && verifier.trustedMfa === true &&
    verifier.role === 'recovery_verifier' && typeof verifier.id === 'string' &&
    verifier.id && verifier.id !== claimant && verifier.id !== requestedBy;
}
export async function verifyAndNotifyRecovery(pool, {
  caseId, verifier, independentEvidence, notifyEnrolledContacts, now = new Date()
}) {
  if (typeof notifyEnrolledContacts !== 'function' ||
      independentEvidence?.independentlyAuthenticated !== true ||
      independentEvidence?.organizationVerified !== true ||
      !hexDigest.test(independentEvidence?.evidenceDigest ?? ''))
    throw new Error('Independent evidence and contact notification required');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const found = await db.query('SELECT * FROM tenant_recovery_cases WHERE id=$1 FOR UPDATE', [caseId]);
    if (found.rowCount !== 1) throw new Error('Recovery case unavailable');
    const c = found.rows[0];
    if (c.status !== 'pending' || c.disputed || c.identity_proof_status !== 'pending' ||
        !trustedVerifier(verifier, c.claimant_user_id, c.requested_by))
      throw new Error('Independent verifier or pending case required');
    // Notification destinations must be read by the trusted adapter from
    // pre-enrolled contacts. No caller-supplied destination is accepted here.
    const delivered = await notifyEnrolledContacts(Object.freeze({
      tenantId: c.tenant_id, caseId, claimantUserId: c.claimant_user_id,
      event: 'tenant_recovery_requested'
    }));
    if (delivered?.allPreEnrolledContactsNotified !== true ||
        !Number.isSafeInteger(delivered.notifiedCount) || delivered.notifiedCount < 1)
      throw new Error('Recovery contact delivery not independently confirmed');
    await db.query(
      "UPDATE tenant_recovery_cases SET identity_proof_status='verified',out_of_band_verified=true,contacts_notified=true,updated_at=$2 WHERE id=$1 AND status='pending'",
      [caseId,now]);
    await db.query(
      'INSERT INTO tenant_recovery_events(case_id,actor_id,event_type,evidence_digest) VALUES($1,$2,$3,$4)',
      [caseId,verifier.id,'identity_evidence_verified',independentEvidence.evidenceDigest]);
    await db.query('COMMIT');
    return { caseId, verified: true, contactsNotified: delivered.notifiedCount };
  } catch(e) {
    await db.query('ROLLBACK');
    throw e;
  } finally {db.release();}
}
