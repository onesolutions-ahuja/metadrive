import type { Request, Response } from "express";
import type { ApprovalsDecisionRoutesDependencies } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerApprovalsDecisionRoutes(deps: ApprovalsDecisionRoutesDependencies): void {
  deps.app.get('/api/approvals/inbox', deps.accessAuthentication, (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant was not found' });
    const canManage = principal.permissions.includes('approvals:manage');
    const requests = tenant.approvalRequests
      .filter((item) => item.status === 'Pending' && (item.approverId === principal.userId || canManage))
      .filter((item) => {
        const object = tenant.objects.find((candidate) => candidate.apiName === item.objectApiName);
        const record = tenant.records[item.objectApiName]?.find((candidate) => candidate.Id === item.recordId);
        return Boolean(object && record && deps.hasRecordAccess(principal, tenant, item.objectApiName, record, 'Read'));
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((item) => {
        const object = tenant.objects.find((candidate) => candidate.apiName === item.objectApiName)!;
        const record = tenant.records[item.objectApiName]!.find((candidate) => candidate.Id === item.recordId)!;
        return {
          ...item,
          objectLabel: object.label,
          recordName: object.fields.some((field) => field.apiName === 'Name'
            && deps.hasFieldPermission(principal, tenant, item.objectApiName, field.apiName, 'read'))
            ? String(record.Name ?? item.recordId)
            : item.recordId
        };
      });
    return res.json({ requests });
  });
  deps.app.post('/api/approvals/:id/decision', deps.accessAuthentication, (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant was not found' });
    const parsed = deps.approvalDecisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid approval decision', details: parsed.error.flatten() });
    const requestId = deps.routeParam(req, 'id');
    const request = tenant.approvalRequests.find((item) =>
      item.id === requestId && item.status === 'Pending'
      && (item.approverId === principal.userId || principal.permissions.includes('approvals:manage')));
    if (!request) return res.status(404).json({ error: 'Pending approval request was not found' });
    const record = tenant.records[request.objectApiName]?.find((candidate) => candidate.Id === request.recordId);
    if (!record || !deps.hasRecordAccess(principal, tenant, request.objectApiName, record, 'Read')) {
      return res.status(404).json({ error: 'Pending approval request was not found' });
    }
    const now = new Date().toISOString();
    const decided = {
      ...request,
      status: parsed.data.decision,
      decisionComments: parsed.data.comments,
      decidedAt: now,
      decidedBy: principal.userId
    };
    const peers = tenant.approvalRequests.filter((item) => item.groupId === request.groupId);
    const allApproved = peers.every((item) => item.id === request.id || item.status === 'Approved');
    const finalized = parsed.data.decision === 'Rejected' || request.approvalMode !== 'ALL' || allApproved;
    const requests = tenant.approvalRequests.map((item) => item.groupId !== request.groupId || item.status !== 'Pending'
      ? item
      : item.id === request.id
        ? decided
        : finalized
          ? { ...item, status: 'Canceled' as const, decisionComments: 'Resolved by another approver.', decidedAt: now, decidedBy: principal.userId }
          : item);
    let interviews = tenant.interviews;
    // A human decision only releases its own tenant-scoped, version-pinned
    // orchestration stage. No other pending Flow interview is affected.
    if (finalized && request.orchestrationInterviewId) {
      const interview = tenant.interviews.find((item) =>
        item.id === request.orchestrationInterviewId && item.kind === 'orchestration'
        && item.flowApiName === request.flowApiName);
      if (!interview) return res.status(409).json({ error: 'The orchestration stage is no longer pending' });
      const saved = tenant.flows.find((item) => item.apiName === interview.flowApiName);
      const active = deps.activeFlowDefinition(saved);
      const archived = saved?.versions.find((version) => version.versionNumber === interview.versionNumber);
      const flow = saved?.versionNumber === interview.versionNumber
        && (saved.status === 'Active' || interview.allowDraft) ? saved
        : active?.versionNumber === interview.versionNumber ? active
        : archived ? { ...saved!, ...archived, versionNumber: archived.versionNumber,
            status: 'Active' as const, activeVersion: archived.versionNumber } : undefined;
      const stage = flow?.elements.find((item) => item.id === interview.screenElementId && item.type === 'Orchestration Stage');
      const outcome = parsed.data.decision;
      const connectors = flow?.connectors.filter((item) =>
        item.from === stage?.id && item.kind === 'normal' && item.label.toLowerCase() === outcome.toLowerCase()) ?? [];
      if (!stage || connectors.length !== 1) {
        return res.status(409).json({ error: 'The orchestration stage has no valid decision path' });
      }
      const statusVariable = typeof stage.config.statusVariable === 'string' ? stage.config.statusVariable : '';
      interviews = tenant.interviews.map((item) => item.id !== interview.id ? item : {
        ...item, kind: 'async' as const, waitUntil: now, retryAt: null, attempts: 0,
        nextElementId: connectors[0].to,
        variables: { ...item.variables, ...(statusVariable ? { [statusVariable]: outcome } : {}) }
      });
    }
    const submitter = deps.state.users.find((user) => user.id === request.submittedBy && user.tenantId === principal.tenantId && !user.disabled);
    const notifications = finalized && submitter ? [...tenant.notifications, deps.customNotificationSchema.parse({
      id: deps.randomUUID(),
      recipientId: submitter.id,
      title: `Approval ${parsed.data.decision.toLowerCase()}`,
      body: `${request.objectApiName} ${request.recordId} was ${parsed.data.decision.toLowerCase()} by ${deps.state.users.find((user) => user.id === principal.userId)?.name ?? 'an approver'}.`,
      flowApiName: request.flowApiName,
      sentBy: principal.userId,
      createdAt: now,
      readAt: null
    })] : tenant.notifications;
    deps.persistTenantRecords(principal.tenantId, { ...tenant, approvalRequests: requests, notifications, interviews });
    return res.json({ request: decided });
  });
}
