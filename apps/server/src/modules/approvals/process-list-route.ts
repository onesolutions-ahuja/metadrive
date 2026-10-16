import type { Express, Request, Response, RequestHandler } from 'express';

export function registerApprovalProcessListRoute<P extends {tenantId:string}, T extends {approvalProcesses: unknown[]}>(app: Express, deps: {
  requirePermission: (permission: string) => RequestHandler;
  getPrincipal: (res: Response) => P;
  tenantData: (tenantId: string) => T | undefined;
}): void {
  const { requirePermission, getPrincipal, tenantData } = deps;
  app.get('/api/metadata/approval-processes', requirePermission('metadata:read'), (_req: Request, res: Response) => {
    const tenant = tenantData(getPrincipal(res).tenantId);
    return res.json({ approvalProcesses: tenant?.approvalProcesses ?? [] });
  });
}
