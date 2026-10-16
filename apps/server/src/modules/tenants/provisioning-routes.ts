import type { Request, Response } from "express";
import type { TenantProvisioningRoutesDependencies, LocalUser, PlatformState } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerTenantProvisioningRoutes(deps: TenantProvisioningRoutesDependencies): void {
  deps.app.get('/api/tenant/developer-account', deps.accessAuthentication, (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!principal.permissions.includes('security:manage') || !deps.hasObjectPermission(principal, tenant, 'User', 'read'))
      return res.status(403).json({ error: 'Tenant user administration permission required' });
    const seed = deps.state.tenantRegistry[principal.tenantId]?.developerSeed;
    if (!seed) return res.json({ seeded: false });
    const user = deps.state.users.find((item) => item.id === seed.userId && item.tenantId === principal.tenantId);
    return res.json({
      seeded: true, userId: seed.userId, email: user?.email ?? seed.email,
      active: Boolean(user && !user.disabled), activated: Boolean(seed.activatedAt),
      initialPermissions: 'System Administrator', tenantControlled: true
    });
  });
  deps.app.post('/api/tenant/developer-account/activate', deps.accessAuthentication, async (req: Request, res: Response) => {
    if (deps.jwtService.config.mode !== 'local')
      return res.status(501).json({ error: 'Developer credentials are managed by the identity provider' });
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!principal.permissions.includes('security:manage') || !deps.hasObjectPermission(principal, tenant, 'User', 'edit'))
      return res.status(403).json({ error: 'Tenant user administration permission required' });
    const seed = deps.state.tenantRegistry[principal.tenantId]?.developerSeed;
    if (!seed) return res.status(404).json({ error: 'No developer seeder exists for this tenant' });
    if (seed.activatedAt) return res.status(409).json({
      error: 'Developer was already activated. Manage its access through tenant User and RBAC settings.'
    });
    if (deps.developerActivationPending.has(seed.userId)) return res.status(409).json({ error: 'Developer activation already in progress' });
    const parsed = deps.activateDeveloperSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'A new password of 12–256 characters is required' });
    deps.developerActivationPending.add(seed.userId);
    try {
      const credentials = await deps.hashPassword(parsed.data.password);
      const now = new Date().toISOString();
      const current = deps.state.users.find((item) => item.id === seed.userId && item.tenantId === principal.tenantId);
      const currentSeed = deps.state.tenantRegistry[principal.tenantId]?.developerSeed;
      if (!current || !currentSeed || currentSeed.activatedAt) return res.status(409).json({
        error: 'Developer identity changed during activation'
      });
      const changed: LocalUser = { ...current, disabled: false,
        passwordSalt: credentials.salt, passwordHash: credentials.hash,
        authVersion: (current.authVersion ?? 0) + 1,
        authRevokedBefore: Math.floor(Date.now() / 1000) };
      const nextState: PlatformState = {
        ...deps.state,
        users: deps.state.users.map((item) => item.id === changed.id ? changed : item),
        tenants: {
          ...deps.state.tenants,
          [principal.tenantId]: deps.withSecurityEvent(tenant, principal.userId,
            'tenant.developer.activated', { developerUserId: changed.id }, changed.id)
        },
        tenantRegistry: { ...deps.state.tenantRegistry,
          [principal.tenantId]: {
            ...deps.state.tenantRegistry[principal.tenantId],
            developerSeed: { ...currentSeed, email: changed.email, activatedAt: now }
          }
        },
        refreshSessions: deps.state.refreshSessions.map((item) => item.userId === changed.id
          ? { ...item, revokedAt: Date.now() / 1000 } : item)
      };
      deps.persistState(nextState);
      deps.state = nextState;
      await deps.latestStateCommit;
      return res.json({ activated: true, userId: changed.id, email: changed.email });
    } catch (error) {
      console.error('CRITICAL: developer activation commit failed', error);
      // Fail closed if durability cannot be established until state is reconciled.
      deps.provisioningCommitFailed = true;
      return res.status(503).json({ error: 'Developer activation could not be durably committed' });
    } finally {
      // Keep the login path closed after a persistence failure.
      if (!deps.provisioningCommitFailed) deps.developerActivationPending.delete(seed.userId);
    }
  });
  deps.app.get('/api/platform/tenants/:tenantId/provisioning', deps.accessAuthentication, deps.requirePlatformTenantAdmin,
    (req: Request, res: Response) => {
      const tenantId = deps.routeParam(req, 'tenantId');
      const tenant = Object.hasOwn(deps.state.tenants, tenantId) ? deps.state.tenants[tenantId] : undefined;
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      if (deps.provisioningPendingTenants.has(tenantId))
        return res.status(202).json({ tenantId, status: 'PROVISIONING' });
      const registry = deps.tenantRegistryEntry(tenantId);
      return res.json({
        tenantId,
        status: registry.provisioning?.status ?? 'READY',
        version: registry.provisioning?.version ?? 0,
        completedAt: registry.provisioning?.completedAt ?? registry.createdAt,
        initialized: {
          developerAccount: registry.developerSeed ? {
            email: registry.developerSeed.email, activated: Boolean(registry.developerSeed.activatedAt)
          } : null,
          objects: tenant.objects.length, profiles: tenant.accessControl.profiles.length,
          permissionSets: tenant.accessControl.permissionSets.length,
          initialAdministrator: tenant.accessControl.users.length > 0
        }
      });
    });
  deps.app.get('/api/platform/tenants/:tenantId', deps.accessAuthentication, deps.requirePlatformTenantAdmin, (req: Request, res: Response) => {
    const tenantId = deps.routeParam(req, 'tenantId');
    if (!Object.hasOwn(deps.state.tenants, tenantId)) return res.status(404).json({ error: 'Tenant not found' });
    if (deps.provisioningPendingTenants.has(tenantId)) return res.status(409).json({ error: 'Tenant provisioning is not yet ready' });
    return res.json({ tenant: deps.tenantSummary(tenantId) });
  });
  deps.app.patch('/api/platform/tenants/:tenantId', deps.accessAuthentication, deps.requirePlatformTenantAdmin, (req: Request, res: Response) => {
    const tenantId = deps.routeParam(req, 'tenantId');
    if (!Object.hasOwn(deps.state.tenants, tenantId)) return res.status(404).json({ error: 'Tenant not found' });
    if (deps.provisioningPendingTenants.has(tenantId)) return res.status(409).json({ error: 'Tenant provisioning is not yet ready' });
    const parsed = deps.tenantManagementUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid tenant update', details: parsed.error.flatten() });
    const previous = deps.tenantRegistryEntry(tenantId);
    const next = { ...previous, ...parsed.data, updatedAt: new Date().toISOString() };
    deps.commitTenantChange(deps.getPrincipal(res).userId, tenantId, 'UPDATED', next, previous);
    return res.json({ tenant: deps.tenantSummary(tenantId) });
  });
}
