import type { Express, Request, Response, RequestHandler } from 'express';

type NavigationItem = { type: string; apiName: string };
type App = { apiName: string; navigationItems: string[]; navigationOrder: NavigationItem[] };
export function registerAppListRoute<Principal extends {tenantId: string}, Tenant extends {apps: App[]}>(app: Express, deps: {
  requirePermission: (permission: string) => RequestHandler;
  getPrincipal: (response: Response) => Principal;
  tenantData: (tenantId: string) => Tenant | undefined;
  canOpenApp: (principal: Principal, tenant: Tenant, apiName: string) => boolean;
  canOpenTab: (principal: Principal, tenant: Tenant, apiName: string) => boolean;
}): void {
  const { requirePermission, getPrincipal, tenantData, canOpenApp, canOpenTab } = deps;
  app.get('/api/metadata/apps', requirePermission('metadata:read'), (_req: Request, res: Response) => {
    const principal = getPrincipal(res);
    const tenant = tenantData(principal.tenantId)!;
    res.json({ apps: tenant.apps
      .filter((app) => canOpenApp(principal, tenant, app.apiName))
      .map((app) => ({ ...app,
        navigationItems: app.navigationItems.filter((name) => canOpenTab(principal, tenant, name)),
        navigationOrder: app.navigationOrder.filter((item) => item.type !== 'Object' || canOpenTab(principal, tenant, item.apiName))
      })) });
  });
}
