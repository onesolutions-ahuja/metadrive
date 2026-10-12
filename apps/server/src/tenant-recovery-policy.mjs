// Recovery policy for platform-controlled cases. Never grants a tenant session.
// Database transactions and identity-proofing happen in a separate trusted service.
import { createHash, timingSafeEqual } from 'node:crypto';

export const RECOVERY_WAIT_MS = 24 * 60 * 60 * 1000;
export const INVITATION_TTL_MS = 15 * 60 * 1000;
export const RECOVERY_GRANT = 'tenant_admin_repair_only';

export function digestRecoveryToken(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 512)
    throw new Error('Invalid recovery token');
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
export function matchesRecoveryToken(token, digest) {
  if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) return false;
  try {
    const a = Buffer.from(digestRecoveryToken(token), 'hex');
    const b = Buffer.from(digest, 'hex');
    return timingSafeEqual(a, b);
  } catch { return false; }
}
function validDate(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : NaN;
}
function validActor(actor) {
  return actor && typeof actor.id === 'string' && actor.id.length > 0
    && actor.platformRole === 'recovery_operator' && actor.mfaVerified === true
    && actor.active === true;
}
export function assertRecoveryEligible(caseFile, now = Date.now()) {
  if (!caseFile || caseFile.status !== 'pending'
    || typeof caseFile.tenantId !== 'string' || !caseFile.tenantId
    || typeof caseFile.claimantUserId !== 'string' || !caseFile.claimantUserId)
    throw new Error('Invalid pending recovery case');
  if (!Number.isFinite(now) || validDate(caseFile.createdAt) > now
    || now - validDate(caseFile.createdAt) < RECOVERY_WAIT_MS)
    throw new Error('Recovery cooling-off period not complete');
  if (caseFile.identityProofStatus !== 'verified'
    || caseFile.outOfBandVerification !== true
    || caseFile.recoveryContactNotified !== true
    || caseFile.disputed === true)
    throw new Error('Independent identity proof and notification required');
  if (caseFile.claimantIsPlatformOperator === true)
    throw new Error('Platform operator cannot be recovery claimant');
  const approvers = caseFile.approvals;
  if (!Array.isArray(approvers) || approvers.length < 2)
    throw new Error('Two independent approvals required');
  const ids = new Set();
  for (const a of approvers) {
    if (!validActor(a) || a.id === caseFile.claimantUserId
      || a.id === caseFile.requestedBy || ids.has(a.id)
      || validDate(a.approvedAt) < validDate(caseFile.createdAt)
      || validDate(a.approvedAt) > now)
      throw new Error('Approvals must be independent verified platform operators');
    ids.add(a.id);
  }
  return { tenantId: caseFile.tenantId, userId: caseFile.claimantUserId,
    scope: RECOVERY_GRANT };
}
export function assertRecoveryRedemption(caseFile, invitation, {
  tenantId, userId, token, mfaVerified, now = Date.now()
}) {
  const grant = assertRecoveryEligible(caseFile, now);
  if (tenantId !== grant.tenantId || userId !== grant.userId
    || mfaVerified !== true || invitation?.usedAt != null
    || invitation?.caseId !== caseFile.id || invitation?.tenantId !== tenantId
    || invitation?.userId !== userId
    || invitation?.scope !== RECOVERY_GRANT
    || validDate(invitation?.createdAt) > now
    || now - validDate(invitation?.createdAt) > INVITATION_TTL_MS
    || validDate(invitation?.expiresAt) <= now
    || validDate(invitation?.expiresAt) - validDate(invitation?.createdAt) > INVITATION_TTL_MS
    || !matchesRecoveryToken(token, invitation?.tokenDigest))
    throw new Error('Invalid or expired recovery invitation');
  return grant;
}
