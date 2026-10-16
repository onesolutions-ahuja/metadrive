import type { Express, Request, Response, RequestHandler } from 'express';
type Item = { type: string; apiName: string };
type AppMetadata = { apiName: string; navigationItems: string[]; navigationOrder: Item[] };
export function registerAppListRoute<P extends { tenantId: string }, T extends { apps: AppMetadata[] }>(app: Express, deps: {
  requirePermission: (permission: string) => RequestHandler;
  getPrincipal: (res: Response) => P;
  tenantData: (tenantId: string) => T | undefined;
  canOpenApp: (principal: P, tenant: T, name: string) => boolean;
  canOpenTab: (principal: P, tenant: T, name: string) => boolean;
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
