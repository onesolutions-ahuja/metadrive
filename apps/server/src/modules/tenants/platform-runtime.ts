import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import type { Principal } from '../../auth.js';

import { tenantUsageSnapshot } from '../../tenant-usage.mjs';
export function createPlatformTenantRuntime(deps: {
 getState: () => PlatformState;
 setState: (state: PlatformState) => void;
 persistState: (state: PlatformState) => void;
 getPrincipal: (res: Response) => Principal;
 provisioningSchema: z.ZodObject<any>;
}) {
 const {getState, setState, persistState, getPrincipal, provisioningSchema} = deps;
const platformPolicySchema = z.object({
  policies: z.array(z.enum(['platform:tenants:manage', 'licence:manage'])).max(2)
}).strict();
function activePlatformSuperadmins(): string[] {
  return getState().users.filter((user) => !user.disabled
    && (getState().platformPolicies[user.id] ?? []).some(permission=>permission==='platform:tenants:manage'||permission==='platform:superadmin')).map((user) => user.id);
}
function savePlatformPolicies(actorId: string, userId: string, policies: Array<'platform:tenants:manage' | 'platform:superadmin' | 'licence:manage'>) {
  const previous = getState().platformPolicies[userId] ?? [];
  const next = [...new Set(policies)];
  const nextState: PlatformState = {
    ...getState(),
    platformPolicies: { ...getState().platformPolicies, [userId]: next },
    platformPolicyAudit: [...getState().platformPolicyAudit, {
      actorId, userId, previous, next, at: new Date().toISOString()
    }].slice(-2000)
  };
  persistState(nextState);
  setState(nextState);
}
// MD-03.1: platform-only tenant directory and lifecycle. Tenant-editable
// profiles/permission sets never confer this policy; no impersonation or secrets.
const tenantManagementCreateSchema = provisioningSchema.strict();
const tenantManagementUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional()
}).strict().refine((value) => Object.keys(value).length > 0);
function tenantRegistryEntry(tenantId: string): TenantRegistryEntry {
  const saved = getState().tenantRegistry[tenantId];
  if (saved) return saved;
  // Older tenants pre-date the registry: display them without changing their data.
  const earliest = getState().users.filter((user) => user.tenantId === tenantId)
    .map((user) => user.createdAt).sort()[0] ?? new Date(0).toISOString();
  return { name: tenantId, description: '', status: 'ACTIVE', createdAt: earliest, updatedAt: earliest };
}
function tenantSummary(tenantId: string) {
  const entry = tenantRegistryEntry(tenantId);
  const users = getState().users.filter((user) => user.tenantId === tenantId);
  return {
    tenantId, name: entry.name, description: entry.description, status: entry.status,
    archivedAt: entry.archivedAt ?? null, retentionUntil: entry.retentionUntil ?? null, legalHold: entry.legalHold ?? false,
    createdAt: entry.createdAt, updatedAt: entry.updatedAt,
    domains: (entry.domains ?? []).filter((domain) => domain.status !== 'REVOKED'),
    // Provisioning request fingerprints remain server-side, never exposed in API responses.
    provisioning: entry.provisioning ?? { status: 'READY' as const, version: 0, completedAt: entry.createdAt },
    developerAccount: entry.developerSeed ? {
      email: entry.developerSeed.email,
      activated: Boolean(entry.developerSeed.activatedAt)
    } : null,
    userCount: users.length,
    activeUserCount: users.filter((user) => !user.disabled).length
  };
}
function requirePlatformTenantAdmin(_req: Request, res: Response, next: NextFunction): void {
  if (!getPrincipal(res).permissions.includes('platform:tenants:manage')) {
    res.status(403).json({ error: 'Platform Developer policy required.' });
    return;
  }
  next();
}
function commitTenantChange(actorId: string, tenantId: string,
  action: TenantManagementAuditEvent['action'], next: TenantRegistryEntry,
  previous?: TenantRegistryEntry) {
  const nextState: PlatformState = {
    ...getState(),
    tenantRegistry: { ...getState().tenantRegistry, [tenantId]: next },
    tenantManagementAudit: [...getState().tenantManagementAudit,
      { actorId, tenantId, action, at: new Date().toISOString(), ...(previous ? { previous } : {}), next }
    ].slice(-5000),
    ...(['SUSPENDED', 'ARCHIVED'].includes(action) ? {
      // Access JWTs are stateless; advance every tenant user's revocation epoch
      // so pre-suspension bearer tokens cannot revive after reactivation.
      users: getState().users.map((user) => user.tenantId === tenantId
        ? { ...user, authRevokedBefore: Math.max(user.authRevokedBefore ?? 0, Math.floor(Date.now() / 1000)) }
        : user),
      refreshSessions: getState().refreshSessions.map((session) =>
        session.tenantId === tenantId ? { ...session, revokedAt: Date.now() / 1000 } : session)
    } : {})
  };
  persistState(nextState);
  setState(nextState);
}
// MD-03.8: on-demand usage only for the selected tenant. Counts are
// informational; targets cannot silently disable users or tenant workflows.
const tenantUsageTargetSchema = z.object({
  users: z.number().int().min(1).max(1000000000).nullable().optional(),
  records: z.number().int().min(1).max(1000000000).nullable().optional(),
  objects: z.number().int().min(1).max(1000000000).nullable().optional(),
  flows: z.number().int().min(1).max(1000000000).nullable().optional()
}).strict();
function tenantUsageFor(tenantId: string) {
  return tenantUsageSnapshot({
    tenantId, tenant: getState().tenants[tenantId],
    users: getState().users, registry: tenantRegistryEntry(tenantId)
  });
}

 return {platformPolicySchema, activePlatformSuperadmins, savePlatformPolicies, tenantManagementCreateSchema, tenantManagementUpdateSchema, tenantRegistryEntry, tenantSummary, requirePlatformTenantAdmin, commitTenantChange, tenantUsageTargetSchema, tenantUsageFor};
}
