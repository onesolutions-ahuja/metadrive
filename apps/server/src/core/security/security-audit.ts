import { randomUUID } from 'node:crypto';

/** Immutable tenant-scoped audited security event append; never accepts credentials. */
export function withSecurityEvent(
  tenant: TenantData,
  actorUserId: string,
  action: string,
  details?: Record<string, string>,
  targetUserId?: string
): TenantData {
  const event: SecurityAuditEvent = {
    id: randomUUID(), at: new Date().toISOString(), actorUserId, action,
    ...(targetUserId ? { targetUserId } : {}),
    ...(details ? { details } : {})
  };
  // No passwords, bearer tokens, MFA secrets, raw request bodies, or network identifiers.
  return { ...tenant, securityAudit: [...tenant.securityAudit, event].slice(-5000) };
}

