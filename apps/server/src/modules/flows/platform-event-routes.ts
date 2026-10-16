import type { Request, Response } from "express";
import type { FlowsPlatformEventRoutesDependencies } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerFlowsPlatformEventRoutes(deps: FlowsPlatformEventRoutesDependencies): void {
  deps.app.get('/api/metadata/platform-events', deps.requirePermission('metadata:read'), (_req: Request, res: Response) => {
    res.json({ platformEvents: deps.tenantData(deps.getPrincipal(res).tenantId)?.platformEvents ?? [] });
  });
  deps.app.put('/api/metadata/platform-events/:apiName', deps.requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
    const parsed = deps.platformEventSchema.safeParse({ ...req.body, apiName: deps.routeParam(req, 'apiName') });
    if (!parsed.success) return res.status(400).json({ error: 'Invalid platform event metadata', details: parsed.error.flatten() });
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const existing = tenant.platformEvents.find((event) => event.apiName === parsed.data.apiName);
    const duplicate = tenant.platformEvents.find((event) =>
      event.apiName.toLowerCase() === parsed.data.apiName.toLowerCase() && event.apiName !== parsed.data.apiName);
    if (duplicate) return res.status(409).json({ error: 'Platform event API name already exists' });
    if (existing && tenant.flows.map(deps.activeFlowDefinition).some((flow) => flow !== undefined
      && flow.flowType === 'Platform Event-Triggered Flow' && flow.triggerObject === existing.apiName)) {
      const changedFields = JSON.stringify(existing.fields) !== JSON.stringify(parsed.data.fields);
      if (changedFields) return res.status(409).json({ error: 'Platform event fields cannot change while an active triggered flow subscribes to this event' });
    }
    const updated = {
      ...tenant,
      platformEvents: existing
        ? tenant.platformEvents.map((event) => event.apiName === existing.apiName ? parsed.data : event)
        : [...tenant.platformEvents, parsed.data]
    };
    deps.persistTenantRecords(principal.tenantId, updated);
    return res.status(existing ? 200 : 201).json({ platformEvent: parsed.data });
  });
  deps.app.delete('/api/metadata/platform-events/:apiName', deps.requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const apiName = deps.routeParam(req, 'apiName');
    const event = tenant.platformEvents.find((candidate) => candidate.apiName === apiName);
    if (!event) return res.status(404).json({ error: 'Platform event was not found' });
    const references = tenant.flows.filter((flow) => flow.triggerObject === apiName
      || flow.elements.some((element) => element.type === 'Publish Platform Event' && element.config.eventApiName === apiName));
    if (references.length) return res.status(409).json({
      error: `Platform event is referenced by flows: ${references.map((flow) => flow.label).join(', ')}`
    });
    deps.persistTenantRecords(principal.tenantId, {
      ...tenant,
      platformEvents: tenant.platformEvents.filter((candidate) => candidate.apiName !== apiName),
      platformEventMessages: tenant.platformEventMessages.filter((message) => message.eventApiName !== apiName)
    });
    return res.status(204).end();
  });
}
