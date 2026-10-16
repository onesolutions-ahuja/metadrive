import type { Express, Request, Response, RequestHandler } from 'express';

export function registerConnectorProviderListRoute<P extends { tenantId: string }, T extends { connectorDefinitions: unknown[] }>(app: Express, deps: {
  requirePermission: (permission: string) => RequestHandler;
  getPrincipal: (res: Response) => P;
  tenantData: (tenantId: string) => T | undefined;
}): void {
  const { requirePermission, getPrincipal, tenantData } = deps;
  app.get('/api/connector-providers', requirePermission('metadata:read'), (_req: Request, res: Response) => {
    const tenant = tenantData(getPrincipal(res).tenantId)!;
    res.json({ providers: tenant.connectorDefinitions });
  });
}
