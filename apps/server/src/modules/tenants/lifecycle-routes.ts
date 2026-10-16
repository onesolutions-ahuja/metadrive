import type { Request, Response } from "express";
import type { TenantLifecycleRoutesDependencies, TenantRegistryEntry, TenantManagementAuditEvent } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerTenantLifecycleRoutes(deps: TenantLifecycleRoutesDependencies): void {
  deps.app.post('/api/platform/tenants/:tenantId/:operation', deps.accessAuthentication, deps.requirePlatformTenantAdmin, (req: Request, res: Response) => {
    const tenantId = deps.routeParam(req, 'tenantId');
    const operation = deps.routeParam(req, 'operation');
    if (!['suspend', 'reactivate', 'archive', 'restore'].includes(operation))
      return res.status(404).json({ error: 'Unknown tenant operation' });
    if (!Object.hasOwn(deps.state.tenants, tenantId)) return res.status(404).json({ error: 'Tenant not found' });
    if (deps.provisioningPendingTenants.has(tenantId)) return res.status(409).json({ error: 'Tenant provisioning is not yet ready' });
    const previous = deps.tenantRegistryEntry(tenantId);
    const desired = operation === 'archive' ? 'ARCHIVED' : operation === 'restore' ? 'SUSPENDED'
      : operation === 'suspend' ? 'SUSPENDED' : 'ACTIVE';
    if (operation === 'archive' && previous.status !== 'SUSPENDED')
      return res.status(409).json({ error: 'Suspend the tenant before archiving' });
    if (operation === 'restore' && previous.status !== 'ARCHIVED')
      return res.status(409).json({ error: 'Only archived tenants can be restored' });
    if (operation === 'reactivate' && previous.status === 'ARCHIVED')
      return res.status(409).json({ error: 'Restore the archived tenant before reactivation' });
    if (previous.status === desired) return res.status(409).json({ error: 'Tenant is already ' + desired.toLowerCase() });
    if (desired === 'SUSPENDED' && operation === 'suspend') {
      const remaining = deps.state.users.filter((user) => !user.disabled && user.tenantId !== tenantId
        && deps.tenantIsActive(user.tenantId) && (deps.state.platformPolicies[user.id] ?? []).some(policy => policy === 'platform:tenants:manage' || policy === 'platform:superadmin'));
      if (remaining.length === 0) return res.status(409).json({
        error: 'Cannot suspend the tenant hosting the last active platform administrator.'
      });
    }
    const next: TenantRegistryEntry = { ...previous, status: desired,
      ...(operation === 'archive' ? { archivedAt: new Date().toISOString() } : {}),
      ...(operation === 'restore' ? { archivedAt: undefined } : {}),
      updatedAt: new Date().toISOString() };
    const action: TenantManagementAuditEvent['action'] = operation === 'archive' ? 'ARCHIVED'
      : operation === 'restore' ? 'RESTORED' : operation === 'suspend' ? 'SUSPENDED' : 'REACTIVATED';
    deps.commitTenantChange(deps.getPrincipal(res).userId, tenantId, action, next, previous);
    return res.json({ tenant: deps.tenantSummary(tenantId) });
  });
}
