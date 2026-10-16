import type { Request, Response } from "express";
import type { TenantRegistryRoutesDependencies, TenantRegistryEntry } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerTenantRegistryRoutes(deps: TenantRegistryRoutesDependencies): void {
  deps.app.get('/api/tenant/usage', deps.accessAuthentication, deps.requirePermission('security:read'),
    (_req: Request, res: Response) => {
      const tenantId = deps.getPrincipal(res).tenantId;
      if (!deps.tenantData(tenantId)) return res.status(404).json({ error: 'Tenant unavailable' });
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ usage: deps.tenantUsageFor(tenantId) });
    });
  deps.app.get('/api/platform/tenants/:tenantId/usage', deps.accessAuthentication, deps.requirePlatformTenantAdmin,
    (req: Request, res: Response) => {
      const tenantId = deps.routeParam(req, 'tenantId');
      if (!Object.hasOwn(deps.state.tenants, tenantId)) return res.status(404).json({ error: 'Tenant not found' });
      if (deps.provisioningPendingTenants.has(tenantId)) return res.status(409).json({ error: 'Tenant provisioning is not yet ready' });
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ usage: deps.tenantUsageFor(tenantId) });
    });
  deps.app.patch('/api/platform/tenants/:tenantId/usage-targets', deps.accessAuthentication, deps.requirePlatformTenantAdmin,
    (req: Request, res: Response) => {
      const tenantId = deps.routeParam(req, 'tenantId');
      if (!Object.hasOwn(deps.state.tenants, tenantId)) return res.status(404).json({ error: 'Tenant not found' });
      if (deps.provisioningPendingTenants.has(tenantId)) return res.status(409).json({ error: 'Tenant provisioning is not yet ready' });
      const parsed = deps.tenantUsageTargetSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid advisory target settings', details: parsed.error.flatten() });
      const previous = deps.tenantRegistryEntry(tenantId);
      const usageTargets = Object.fromEntries(
        Object.entries(parsed.data).filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      );
      const next: TenantRegistryEntry = { ...previous, usageTargets,
        updatedAt: new Date().toISOString() };
      deps.commitTenantChange(deps.getPrincipal(res).userId, tenantId, 'USAGE_TARGETS_UPDATED', next, previous);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ usage: deps.tenantUsageFor(tenantId) });
    });
  deps.app.get('/api/platform/tenants', deps.accessAuthentication, deps.requirePlatformTenantAdmin, (req: Request, res: Response) => {
    const query = String(req.query.q ?? '').trim().toLowerCase().slice(0,120);
    const status = String(req.query.status ?? 'ALL');
    if (!['ALL', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(status)) return res.status(400).json({ error: 'Invalid tenant status filter' });
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 25);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100)
      return res.status(400).json({ error: 'Invalid pagination parameters' });
    // Filter/sort cheap registry metadata first; count users only for one page.
    // This avoids scanning the entire identity store once per tenant.
    const matchedIds = Object.keys(deps.state.tenants)
      .filter((tenantId) => !deps.provisioningPendingTenants.has(tenantId))
      .filter((tenantId) => {
        const metadata = deps.state.tenantRegistry[tenantId];
        const name = metadata?.name ?? tenantId;
        const tenantStatus = metadata?.status ?? 'ACTIVE';
        return (status === 'ALL' || tenantStatus === status)
          && (!query || (tenantId + ' ' + name).toLowerCase().includes(query));
      })
      .sort((a, b) => (deps.state.tenantRegistry[a]?.name ?? a).localeCompare(deps.state.tenantRegistry[b]?.name ?? b)
        || a.localeCompare(b));
    const offset = (page - 1) * pageSize;
    return res.json({ tenants: matchedIds.slice(offset, offset + pageSize).map(deps.tenantSummary),
      total: matchedIds.length, page, pageSize });
  });
  deps.app.post('/api/platform/tenants', deps.accessAuthentication, deps.requirePlatformTenantAdmin, async (req: Request, res: Response) => {
    const parsed = deps.tenantManagementCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid tenant creation request', details: parsed.error.flatten() });
    try {
      const key = deps.provisioningIdempotencyKey(req);
      const { user, created } = await deps.createTenant(parsed.data.tenantId, parsed.data.tenantName,
        parsed.data.adminName, parsed.data.email, parsed.data.password, deps.getPrincipal(res).userId, key,
        parsed.data.developerDomain);
      return res.status(created ? 201 : 200).json({ tenant: deps.tenantSummary(user.tenantId), replayed: !created });
    } catch (error) {
      return res.status(error instanceof deps.TenantProvisioningStoreError ? 503
        : error instanceof Error && error.message.startsWith('Idempotency-Key') ? 400 : 409)
        .json({ error: error instanceof Error ? error.message : 'Unable to create tenant' });
    }
  });
}
