import type { Request, Response } from "express";
import type { FlowDefinitionRoutesDependencies, FlowMetadata } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerFlowDefinitionRoutes(deps: FlowDefinitionRoutesDependencies): void {
  deps.app.put('/api/metadata/flows/:apiName', deps.requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
    const parsed = deps.flowSchema.safeParse({ ...req.body, apiName: req.params.apiName });
    if (!parsed.success) return res.status(400).json({ error: 'Invalid flow metadata', details: parsed.error.flatten() });
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const existing = tenant.flows.find((flow) => flow.apiName === req.params.apiName);
    const requested = parsed.data;
    if (requested.status === 'Active' && existing
      && tenant.interviews.some((interview) => interview.flowApiName === existing.apiName && interview.kind !== 'async')) {
      return res.status(409).json({ error: 'Flow cannot be activated while interviews are pending.' });
    }
    const now = new Date().toISOString();
    const history = deps.uniqueFlowHistory(existing, now);
    const previousActive = existing?.activeVersion ?? null;
    const versionNumber = existing
      ? Math.max(existing.versionNumber, ...history.map((version) => version.versionNumber)) + 1
      : 1;
    // Draft saves never publish an edited graph. Keep the old published version running.
    const author = deps.state.users.find((item) => item.id === principal.userId && item.tenantId === principal.tenantId);
    const nextFlow: FlowMetadata = {
      ...requested,
      createdAt: existing?.createdAt ?? now,
      createdBy: existing?.createdBy ?? author?.name ?? principal.email,
      lastModifiedAt: now,
      lastModifiedBy: author?.name ?? principal.email,
      versionNumber,
      activeVersion: requested.status === 'Active' ? versionNumber : previousActive,
      versions: history
    };
    if (requested.status === 'Active') {
      const validation = deps.validateFlow(nextFlow, tenant.objects, tenant.namedCredentials, tenant.integrationConnections, tenant.connectorDefinitions, tenant.emailAlerts,
        deps.formulaContextForUser(tenant, principal.userId),
        [...tenant.flows.filter((flow) => flow.apiName !== nextFlow.apiName), nextFlow], tenant.approvalProcesses, tenant.platformEvents, principal.tenantId);
      if (validation.errors.length) return res.status(422).json({ error: 'Flow validation failed', details: validation.errors });
      // Exactly one active version; do not leave stale Active labels on archived revisions.
      nextFlow.versions = [...history.map((version) => ({
        ...version,
        status: version.status === 'Draft' ? 'Draft' as const : 'Obsolete' as const
      })), deps.flowVersionSnapshot(nextFlow, now)];
    }
    const updatedTenant = { ...tenant, flows: existing ? tenant.flows.map((flow) => flow.apiName === nextFlow.apiName ? nextFlow : flow) : [...tenant.flows, nextFlow] };
    const nextState = { ...deps.state, tenants: { ...deps.state.tenants, [principal.tenantId]: updatedTenant } };
    deps.persistState(nextState);
    deps.state = nextState;
    return res.json({ flow: nextFlow });
  });
  deps.app.post('/api/metadata/flows/:apiName/deactivate', deps.requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const existing = tenant.flows.find((flow) => flow.apiName === deps.routeParam(req, 'apiName'));
    if (!existing) return res.status(404).json({ error: 'Flow was not found' });
    if (existing.activeVersion === null) {
      return res.status(409).json({ error: 'Flow is not active' });
    }
    if (tenant.interviews.some((interview) => interview.flowApiName === existing.apiName)) {
      return res.status(409).json({ error: 'Flow cannot be deactivated while its interviews are pending; wait for them to finish or expire.' });
    }
    const activeSubflowReferences = tenant.flows
      .filter((candidate) => candidate.apiName !== existing.apiName)
      .map(deps.activeFlowDefinition)
      .filter((candidate): candidate is FlowMetadata => Boolean(candidate))
      .flatMap((candidate) => candidate.elements
        .filter((element) => element.type === 'Subflow' && element.config.flowApiName === existing.apiName)
        .map((element) => `${candidate.label} / ${element.label}`));
    if (activeSubflowReferences.length) {
      return res.status(409).json({
        error: `Flow cannot be deactivated while referenced by active subflows: ${activeSubflowReferences.join(', ')}`
      });
    }
    const versions = deps.uniqueFlowHistory(existing, new Date().toISOString())
      .map((version) => ({
        ...version,
        status: version.status === 'Draft' ? 'Draft' as const : 'Obsolete' as const
      }));
    const flow: FlowMetadata = {
      ...existing,
      status: 'Draft',
      versionNumber: Math.max(existing.versionNumber, ...versions.map((version) => version.versionNumber)) + 1,
      activeVersion: null,
      versions
    };
    deps.persistTenantRecords(principal.tenantId, {
      ...tenant,
      flows: tenant.flows.map((candidate) => candidate.apiName === flow.apiName ? flow : candidate)
    });
    return res.json({ flow });
  });
  deps.app.delete('/api/metadata/flows/:apiName', deps.requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const apiName = deps.routeParam(req, 'apiName');
    const flow = tenant.flows.find((candidate) => candidate.apiName === apiName);
    if (!flow) return res.status(404).json({ error: 'Flow was not found' });
    const references = tenant.flows
      .filter((candidate) => candidate.apiName !== apiName)
      .flatMap((candidate) => candidate.elements
        .filter((element) => element.type === 'Subflow' && element.config.flowApiName === apiName)
        .map((element) => `${candidate.label} / ${element.label}`));
    if (references.length) return res.status(409).json({ error: `Flow is referenced by subflows: ${references.join(', ')}` });
    if (tenant.interviews.some((interview) => interview.flowApiName === apiName)) {
      return res.status(409).json({ error: 'Flow cannot be deleted while its interviews are pending; wait for them to finish or expire.' });
    }
    if (flow.activeVersion !== null) return res.status(409).json({ error: 'Deactivate the flow before deleting it.' });
    deps.persistTenantRecords(principal.tenantId, {
      ...tenant,
      flows: tenant.flows.filter((candidate) => candidate.apiName !== apiName),
      scheduleRuns: Object.fromEntries(Object.entries(tenant.scheduleRuns).filter(([key]) => !key.startsWith(`${apiName}@`))),
      scheduleRetries: Object.fromEntries(Object.entries(tenant.scheduleRetries).filter(([key]) => !key.startsWith(`${apiName}@`)))
    });
    return res.status(204).end();
  });
  deps.app.post('/api/metadata/flows/:apiName/validate', deps.requirePermission('metadata:read'), (req: Request, res: Response) => {
    const parsed = deps.flowSchema.safeParse({ ...req.body, apiName: req.params.apiName });
    if (!parsed.success) return res.status(400).json({ error: 'Invalid flow metadata', details: parsed.error.flatten() });
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const validation = deps.validateFlow(parsed.data, tenant.objects, tenant.namedCredentials, tenant.integrationConnections, tenant.connectorDefinitions, tenant.emailAlerts,
      deps.formulaContextForUser(tenant, principal.userId),
      [...tenant.flows.filter((flow) => flow.apiName !== parsed.data.apiName), parsed.data], tenant.approvalProcesses, tenant.platformEvents, principal.tenantId);
    return res.json(validation);
  });
}
