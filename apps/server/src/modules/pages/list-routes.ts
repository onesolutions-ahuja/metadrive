import type { Request, Response } from "express";
import type { PageListRoutesDependencies } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerPageListRoutes(deps: PageListRoutesDependencies): void {
  deps.app.get('/api/metadata/pages', deps.requirePermission('metadata:read'), (_req: Request, res: Response) => {
    const principal=deps.getPrincipal(res);
    const pages=deps.tenantData(principal.tenantId)?.pages??[];
    res.json({pages:pages.filter(page=>!deps.isProtectedAdministrationPage(page)
      || (page.requiredPermissions??[]).every(permission=>principal.permissions.includes(permission)))});
  });
}
