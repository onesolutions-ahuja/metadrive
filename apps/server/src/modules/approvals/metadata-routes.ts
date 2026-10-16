import type { Request, Response } from "express";
import type { ApprovalsMetadataRoutesDependencies, FlowMetadata } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerApprovalsMetadataRoutes(deps: ApprovalsMetadataRoutesDependencies): void {
  deps.app.get('/api/metadata/approval-processes', deps.requirePermission('metadata:read'), (_req: Request, res: Response) => {
    const tenant = deps.tenantData(deps.getPrincipal(res).tenantId);
    return res.json({ approvalProcesses: tenant?.approvalProcesses ?? [] });
  });
  deps.app.put('/api/metadata/approval-processes/:apiName', deps.requireAnyPermission('metadata:write', 'security:manage'), (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const apiName = deps.routeParam(req, 'apiName');
    const parsed = deps.approvalProcessRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid approval process', details: parsed.error.flatten() });
    if (parsed.data.apiName !== apiName) return res.status(400).json({ error: 'Approval process API name must match the requested resource' });
    const object = tenant.objects.find((item) => item.apiName === parsed.data.objectApiName);
    if (!object) return res.status(400).json({ error: `Approval process object "${parsed.data.objectApiName}" does not exist` });
    const inactiveApprover = parsed.data.approverUserIds.find((userId) =>
      !deps.state.users.some((user) => user.id === userId && user.tenantId === principal.tenantId && !user.disabled));
    if (inactiveApprover) return res.status(400).json({ error: `Approval process approver "${inactiveApprover}" must be an active user in this tenant` });
    const existing = tenant.approvalProcesses.find((item) => item.apiName === apiName);
    const activeFlowReferences = existing
      ? tenant.flows
        .map(deps.activeFlowDefinition)
        .filter((flow): flow is FlowMetadata => flow !== undefined && flow.elements.some((element) =>
          element.type === 'Action' && element.config.actionType === 'Submit for Approval'
          && element.config.approvalProcessApiName === apiName))
        .map((flow) => flow.label)
      : [];
    if (activeFlowReferences.length && !parsed.data.active) {
      return res.status(409).json({
        error: `Approval process cannot be deactivated while referenced by active flows: ${activeFlowReferences.join(', ')}`
      });
    }
    if (existing && existing.objectApiName !== parsed.data.objectApiName && activeFlowReferences.length) {
      return res.status(409).json({
        error: `Approval process object cannot change while referenced by active flows: ${activeFlowReferences.join(', ')}`
      });
    }
    const now = new Date().toISOString();
    const approvalProcess = deps.approvalProcessSchema.parse({
      ...parsed.data,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
    deps.persistTenantRecords(principal.tenantId, {
      ...tenant,
      approvalProcesses: existing
        ? tenant.approvalProcesses.map((item) => item.apiName === apiName ? approvalProcess : item)
        : [...tenant.approvalProcesses, approvalProcess]
    });
    return res.json({ approvalProcess });
  });
  deps.app.delete('/api/metadata/approval-processes/:apiName', deps.requireAnyPermission('metadata:write', 'security:manage'), (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const apiName = deps.routeParam(req, 'apiName');
    const approvalProcess = tenant.approvalProcesses.find((item) => item.apiName === apiName);
    if (!approvalProcess) return res.status(404).json({ error: `Approval process "${apiName}" was not found` });
    const flowReferences = tenant.flows
      .filter((flow) => flow.elements.some((element) =>
        element.type === 'Action' && element.config.actionType === 'Submit for Approval'
        && element.config.approvalProcessApiName === apiName))
      .map((flow) => flow.label);
    if (flowReferences.length) return res.status(409).json({ error: `Approval process is referenced by flows: ${flowReferences.join(', ')}` });
    if (tenant.approvalRequests.some((item) => item.flowApiName && item.status === 'Pending'
      && item.processApiName === apiName)) {
      return res.status(409).json({ error: 'Approval process has pending approval requests' });
    }
    deps.persistTenantRecords(principal.tenantId, {
      ...tenant,
      approvalProcesses: tenant.approvalProcesses.filter((item) => item.apiName !== apiName)
    });
    return res.status(204).end();
  });
}
