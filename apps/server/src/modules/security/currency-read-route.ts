import type { Express, Request, Response, RequestHandler } from 'express';

/** Tenant currency settings read endpoint, guarded by existing OneEngine RBAC. */
export function registerCurrencyReadRoute<P extends { tenantId: string }, T extends { currencySettings: unknown }>(app: Express, deps: {
  requirePermission: (permission: string) => RequestHandler;
  getPrincipal: (res: Response) => P;
  tenantData: (tenantId: string) => T | undefined;
}): void {
  const { requirePermission, getPrincipal, tenantData } = deps;
  app.get('/api/metadata/currencies', requirePermission('security:read'), (_req: Request, res: Response) => {
    res.json(tenantData(getPrincipal(res).tenantId)!.currencySettings);
  });
}
