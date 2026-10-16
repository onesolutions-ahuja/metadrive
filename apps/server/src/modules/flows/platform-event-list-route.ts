import type { Express, Request, Response, RequestHandler } from 'express';

export function registerPlatformEventListRoute<P extends {tenantId:string}, T extends {platformEvents: unknown[]}>(app: Express, deps: {
  requirePermission: (permission: string) => RequestHandler;
  getPrincipal: (res: Response) => P;
  tenantData: (tenantId: string) => T | undefined;
}): void {
  const { requirePermission, getPrincipal, tenantData } = deps;
  app.get('/api/metadata/platform-events', requirePermission('metadata:read'), (_req: Request, res: Response) => {
    res.json({ platformEvents: tenantData(getPrincipal(res).tenantId)?.platformEvents ?? [] });
  });
}
