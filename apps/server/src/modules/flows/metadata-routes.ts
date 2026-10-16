import type { Request, Response } from "express";
import type { FlowsMetadataRoutesDependencies } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerFlowsMetadataRoutes(deps: FlowsMetadataRoutesDependencies): void {
  deps.app.get('/api/metadata/flows/list', deps.requirePermission('metadata:read'), (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant was not found' });
    const query = typeof req.query.search === 'string' ? req.query.search.trim().toLocaleLowerCase().slice(0, 160) : '';
    const page = Math.max(1, Math.min(100000, Number.parseInt(String(req.query.page ?? '1'), 10) || 1));
    const pageSize = 50;
    const matches = tenant.flows
      .filter((flow) => !query || [flow.label, flow.apiName, flow.flowType, flow.status].some((value) => value.toLocaleLowerCase().includes(query)))
      .sort((a, b) => a.label.localeCompare(b.label));
    const offset = (page - 1) * pageSize;
    const list = matches.slice(offset, offset + pageSize).map((flow) => ({
      apiName: flow.apiName, label: flow.label, flowType: flow.flowType, status: flow.status,
      versionNumber: flow.versionNumber, activeVersion: flow.activeVersion,
      createdAt: flow.createdAt, createdBy: flow.createdBy,
      lastModifiedAt: flow.lastModifiedAt, lastModifiedBy: flow.lastModifiedBy
    }));
    return res.json({ flows: list, total: matches.length, page, pageSize });
  });
  deps.app.get('/api/metadata/flows', deps.requirePermission('metadata:read'), (_req: Request, res: Response) => {
    res.json({ flows: deps.tenantData(deps.getPrincipal(res).tenantId)?.flows ?? [] });
  });
  deps.app.get('/api/metadata/automation-settings', deps.requirePermission('metadata:read'), (_req: Request, res: Response) => {
    res.json(deps.tenantData(deps.getPrincipal(res).tenantId)?.automationSettings ?? deps.defaultAutomationSettings);
  });
  deps.app.put('/api/metadata/automation-settings', deps.requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
    const parsed = deps.automationSettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid automation settings', details: parsed.error.flatten() });
    const tenantId = deps.getPrincipal(res).tenantId;
    const tenant = deps.tenantData(tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    deps.persistTenantRecords(tenantId, { ...tenant, automationSettings: parsed.data });
    return res.json(parsed.data);
  });
  deps.app.get('/api/metadata/flow-logs', deps.requirePermission('metadata:read'), (_req: Request, res: Response) => {
    const logs = deps.tenantData(deps.getPrincipal(res).tenantId)?.flowLogs ?? [];
    res.json({ logs: [...logs].sort((left, right) => right.failedAt.localeCompare(left.failedAt)) });
  });
  deps.app.get('/api/metadata/flow-interviews', deps.requirePermission('metadata:read'), (_req: Request, res: Response) => {
    const tenant = deps.tenantData(deps.getPrincipal(res).tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant was not found' });
    const usersById = new Map(deps.state.users
      .filter((user) => user.tenantId === deps.getPrincipal(res).tenantId)
      .map((user) => [user.id, user.name]));
    const interviews = tenant.interviews
      .map((interview) => {
        const flow = tenant.flows.find((candidate) =>
          candidate.apiName === interview.flowApiName && candidate.versionNumber === interview.versionNumber);
        const screen = flow?.elements.find((element) => element.id === interview.screenElementId);
        return {
          id: interview.id,
          flowApiName: interview.flowApiName,
          flowLabel: flow?.label ?? interview.flowApiName,
          versionNumber: interview.versionNumber,
          kind: interview.kind,
          userId: interview.userId,
          userName: usersById.get(interview.userId) ?? interview.userId,
          screenLabel: screen?.label ?? null,
          recordId: interview.record?.Id ?? null,
          createdAt: interview.createdAt,
          expiresAt: interview.expiresAt,
          waitUntil: interview.waitUntil,
          retryAt: interview.retryAt,
          attempts: interview.attempts
        };
      })
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    return res.json({ interviews });
  });
  deps.app.delete('/api/metadata/flow-interviews/:interviewId', deps.requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant was not found' });
    const interviewId = deps.routeParam(req, 'interviewId');
    if (!tenant.interviews.some((interview) => interview.id === interviewId)) {
      return res.status(404).json({ error: 'Pending Flow interview was not found' });
    }
    deps.persistTenantRecords(principal.tenantId, {
      ...tenant,
      interviews: tenant.interviews.filter((interview) => interview.id !== interviewId),
      approvalRequests: tenant.approvalRequests.map((request) =>
        request.orchestrationInterviewId === interviewId && request.status === 'Pending'
          ? { ...request, status: 'Canceled' as const, decisionComments: 'Flow interview canceled.',
            decidedAt: new Date().toISOString(), decidedBy: principal.userId }
          : request)
    });
    return res.status(204).end();
  });
}
