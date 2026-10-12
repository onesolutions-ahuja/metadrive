import { createRemoteJWKSet, jwtVerify } from 'jose';

// Only a separately administered identity provider may attest recovery facts.
// Never trust booleans provided by HTTP clients or support agents.
const PURPOSES = Object.freeze({
  identity: 'recovery_identity',
  operator: 'recovery_operator',
  contact: 'recovery_contact',
  claimant: 'recovery_claimant'
});
const DEFAULT_MAX_AGE_SECONDS = 300;

export function createRecoveryAttestationVerifier({
  jwksUri, issuer, audience = 'metadrive-recovery', isActorActive,
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS
}) {
  if (!jwksUri || new URL(jwksUri).protocol !== 'https:' ||
      !issuer || typeof isActorActive !== 'function' ||
      !Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 30 || maxAgeSeconds > 300)
    throw new Error('Trusted recovery issuer, HTTPS JWKS, and live actor status required');
  const jwks = createRemoteJWKSet(new URL(jwksUri));
  return async function verify(attestation, {
    purpose, tenantId, claimantUserId, caseId, actorId
  }) {
    if (!Object.values(PURPOSES).includes(purpose) ||
        !tenantId || !claimantUserId || !caseId ||
        typeof attestation !== 'string' || attestation.length > 16384)
      throw new Error('Invalid recovery attestation request');
    const { payload, protectedHeader } = await jwtVerify(attestation, jwks, {
      issuer, audience, algorithms: ['RS256', 'ES256'],
      maxTokenAge: maxAgeSeconds + 's', clockTolerance: 5
    });
    if (protectedHeader.typ !== 'JWT' ||
        payload.purpose !== purpose || payload.tenant_id !== tenantId ||
        payload.claimant_user_id !== claimantUserId || payload.case_id !== caseId ||
        typeof payload.sub !== 'string' || !payload.sub ||
        (actorId && payload.sub !== actorId) ||
        !Array.isArray(payload.amr) || !payload.amr.includes('mfa') ||
        !payload.iat || !payload.exp || payload.exp - payload.iat > maxAgeSeconds ||
        typeof payload.jti !== 'string' || payload.jti.length < 16)
      throw new Error('Recovery attestation scope, freshness or MFA invalid');
    const active = await isActorActive({
      actorId: payload.sub, purpose, tenantId, caseId,
      claimantUserId, jti: payload.jti
    });
    if (active !== true) throw new Error('Recovery actor not authorized');
    return Object.freeze({
      id: payload.sub, role: purpose.replace(/^recovery_/, 'recovery_'),
      tenantId, claimantUserId, caseId, active: true,
      trustedMfa: true, attestationId: payload.jti
    });
  };
}
export { PURPOSES };
