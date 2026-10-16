import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { mappedTenantOrigin, tenantForRequest } from '../../tenant-host-routing.js';
import type { TenantData, SecurityAuditEvent, TenantRegistryEntry } from '../../core/state/types.js';

// Tenant identity comes from verified host routing, not request parameters.
export function createTenantRequestGuard(config: ReturnType<typeof import('../../tenant-host-routing.js').tenantHostConfig>) {
  return {
    requestTenantMatches(req: Request, tenantId: string): boolean {
      const route = tenantForRequest(config, req.header('host'), req.header('origin'));
      return route.allowed && (route.tenantId === null || route.tenantId === tenantId);
    },
    mappedTenantOriginAllowed(origin: string): boolean {
      return mappedTenantOrigin(config, origin);
    }
  };
}

export function tenantInfoForRecovery(registry: Record<string, TenantRegistryEntry>, tenantId: string): string {
  return registry[tenantId]?.name ?? tenantId;
}

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

