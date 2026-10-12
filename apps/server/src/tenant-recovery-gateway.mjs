import { approveRecoveryCase, issueRecoveryInvitation, redeemRecoveryInvitation } from './tenant-recovery-transaction.mjs';
import { openRecoveryCase, disputeRecoveryCase } from './tenant-recovery-cases.mjs';
import { verifyAndNotifyRecovery } from './tenant-recovery-verification.mjs';
import { PURPOSES } from './tenant-recovery-attestation.mjs';

// Internal trusted gateway. HTTP controllers may submit only signed attestations
// and identifiers; trustedMfa, roles, proof booleans and delivery endpoints are
// never accepted from request bodies. Caller dependencies are server-only.
export function createRecoveryGateway({
  pool, verifyAttestation, notifyEnrolledContacts, deliverToVerifiedContact
}) {
  if (!pool || typeof verifyAttestation !== 'function' ||
      typeof notifyEnrolledContacts !== 'function' ||
      typeof deliverToVerifiedContact !== 'function')
    throw new Error('Trusted verification, persistence and delivery required');

  async function caseIdentity(caseId) {
    if (typeof caseId !== 'string' || !/^[0-9a-f-]{36}$/i.test(caseId))
      throw new Error('Invalid recovery case');
    const r = await pool.query(
      'SELECT tenant_id,claimant_user_id,status FROM tenant_recovery_cases WHERE id=$1',
      [caseId]);
    if (r.rowCount !== 1 || !['pending','approved'].includes(r.rows[0].status))
      throw new Error('Recovery case not pending');
    return { tenantId: r.rows[0].tenant_id,
      claimantUserId: r.rows[0].claimant_user_id, caseId };
  }
  async function principal(caseId, signed, purpose) {
    const binding = await caseIdentity(caseId);
    const actor = await verifyAttestation(signed, {...binding,purpose});
    if (actor?.trustedMfa !== true || actor.active !== true ||
        actor.tenantId !== binding.tenantId || actor.caseId !== caseId ||
        !actor.id)
      throw new Error('Recovery identity not independently authenticated');
    return { ...actor, role: purpose };
  }
  return Object.freeze({
    async openCase({tenantId,claimantUserId,intakeAttestation}) {
      const requester = await verifyAttestation(intakeAttestation,{
        tenantId,claimantUserId,caseId:'new',purpose:PURPOSES.intake
      });
      if (requester?.trustedMfa !== true || requester.active !== true ||
          requester.role !== PURPOSES.intake || requester.tenantId !== tenantId ||
          requester.claimantUserId !== claimantUserId || requester.id === claimantUserId)
        throw new Error('Independent recovery intake authorization required');
      return openRecoveryCase(pool,{tenantId,claimantUserId,requester});
    },
    async approve({caseId,operatorAttestation}) {
      const operator = await principal(caseId,operatorAttestation,PURPOSES.operator);
      return approveRecoveryCase(pool,{caseId,operator});
    },
    async issueInvitation({caseId,operatorAttestation}) {
      const operator = await principal(caseId,operatorAttestation,PURPOSES.operator);
      return issueRecoveryInvitation(pool,{
        caseId,operator,deliverToVerifiedContact
      });
    },
    async redeem({caseId,tenantId,claimantAttestation,token}) {
      const claimant = await principal(caseId,claimantAttestation,PURPOSES.claimant);
      if (tenantId !== claimant.tenantId || claimant.id !== claimant.claimantUserId)
        throw new Error('Recovery invitation claimant or tenant mismatch');
      return redeemRecoveryInvitation(pool,{caseId,tenantId,claimant,token});
    },
    async dispute({caseId,contactAttestation}) {
      const contact = await principal(caseId,contactAttestation,PURPOSES.contact);
      // Enrollment must be verified live by the trusted attestation issuer.
      if (contact.preEnrolled !== true)
        throw new Error('Recovery contact is not pre-enrolled');
      return disputeRecoveryCase(pool,{caseId,contact});
    },
    async verifyIdentity({caseId,verifierAttestation,identityAttestation}) {
      const verifier = await principal(caseId,verifierAttestation,PURPOSES.verifier);
      const evidence = await principal(caseId,identityAttestation,PURPOSES.identity);
      if (evidence.id !== evidence.claimantUserId ||
          evidence.organizationVerified !== true ||
          !/^[a-f0-9]{64}$/.test(evidence.evidenceDigest ?? ''))
        throw new Error('Independent organization verification required');
      return verifyAndNotifyRecovery(pool,{
        caseId,verifier,
        independentEvidence:{
          independentlyAuthenticated:true,organizationVerified:true,
          evidenceDigest:evidence.evidenceDigest
        },
        notifyEnrolledContacts
      });
    }
  });
}
