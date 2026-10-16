import type { Request, Response } from "express";
import type { TenantRetentionRoutesDependencies, TenantRegistryEntry } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerTenantRetentionRoutes(deps: TenantRetentionRoutesDependencies): void {
  deps.app.patch('/api/platform/tenants/:tenantId/retention', deps.accessAuthentication, deps.requirePlatformTenantAdmin,
    (req: Request, res: Response) => {
      const tenantId = deps.routeParam(req, 'tenantId');
      if (!Object.hasOwn(deps.state.tenants, tenantId)) return res.status(404).json({ error: 'Tenant not found' });
      if (deps.provisioningPendingTenants.has(tenantId))
        return res.status(409).json({ error: 'Tenant provisioning is not yet ready' });
      const parsed = deps.tenantRetentionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid retention policy' });
      if (parsed.data.retentionUntil && Date.parse(parsed.data.retentionUntil) <= Date.now())
        return res.status(400).json({ error: 'Retention deadline must be in the future' });
      const previous = deps.tenantRegistryEntry(tenantId);
      const next: TenantRegistryEntry = { ...previous,
        ...(parsed.data.retentionUntil === null ? { retentionUntil: undefined } : { retentionUntil: parsed.data.retentionUntil }),
        legalHold: parsed.data.legalHold, updatedAt: new Date().toISOString() };
      deps.commitTenantChange(deps.getPrincipal(res).userId, tenantId, 'RETENTION_UPDATED', next, previous);
      return res.json({ tenant: deps.tenantSummary(tenantId) });
    });
  // No destructive endpoint: absence is intentional until an independently verified
  // erasure ceremony and physical backup retention policy exist.
  deps.app.get('/api/platform/tenants/:tenantId/lifecycle-audit', deps.accessAuthentication, deps.requirePlatformTenantAdmin,
    (req: Request, res: Response) => {
      const tenantId = deps.routeParam(req, 'tenantId');
      if (!Object.hasOwn(deps.state.tenants, tenantId)) return res.status(404).json({ error: 'Tenant not found' });
      // Do not expose historical registry snapshots: they can contain domain ownership challenges.
      const events = deps.state.tenantManagementAudit.filter((event) => event.tenantId === tenantId)
        .slice(-100).reverse().map(({ actorId, action, at }) => ({ actorId, action, at }));
      return res.json({ tenantId, events });
    });
}
