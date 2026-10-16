import type { TenantsDomainRoutesDependencies } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerTenantsDomainRoutes(deps: TenantsDomainRoutesDependencies): void {
  deps.app.get('/api/platform/tenants/:tenantId/domains', deps.accessAuthentication, deps.requirePlatformTenantAdmin,
    (req, res) => deps.listTenantDomains(req, res, true));
  deps.app.post('/api/platform/tenants/:tenantId/domains', deps.accessAuthentication, deps.requirePlatformTenantAdmin,
    (req, res) => { void deps.addTenantDomain(req, res, true); });
  deps.app.post('/api/platform/tenants/:tenantId/domains/:hostname/verify', deps.accessAuthentication, deps.requirePlatformTenantAdmin,
    (req, res) => { void deps.verifyTenantDomain(req, res, true); });
  deps.app.delete('/api/platform/tenants/:tenantId/domains/:hostname', deps.accessAuthentication, deps.requirePlatformTenantAdmin,
    (req, res) => { void deps.removeTenantDomain(req, res, true); });
  // Tenants can manage only their own records with security:manage; platform
  // superadmin policy never acts as tenant-admin impersonation.
  deps.app.get('/api/tenant/domains', deps.accessAuthentication, deps.requirePermission('security:manage'),
    (req, res) => deps.listTenantDomains(req, res, false));
  deps.app.post('/api/tenant/domains', deps.accessAuthentication, deps.requirePermission('security:manage'),
    (req, res) => { void deps.addTenantDomain(req, res, false); });
  deps.app.post('/api/tenant/domains/:hostname/verify', deps.accessAuthentication, deps.requirePermission('security:manage'),
    (req, res) => { void deps.verifyTenantDomain(req, res, false); });
  deps.app.delete('/api/tenant/domains/:hostname', deps.accessAuthentication, deps.requirePermission('security:manage'),
    (req, res) => { void deps.removeTenantDomain(req, res, false); });
}
