import type { Request, Response } from "express";
import type { ObjectsListRoutesDependencies } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerObjectsListRoutes(deps: ObjectsListRoutesDependencies): void {
  deps.app.get('/api/metadata/objects', deps.requirePermission('metadata:read'), (_req: Request, res: Response) => {
    res.json({ objects: deps.tenantData(deps.getPrincipal(res).tenantId)?.objects ?? [] });
  });
}
