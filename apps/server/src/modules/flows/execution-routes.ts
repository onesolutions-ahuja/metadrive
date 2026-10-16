import type { Request, Response } from "express";
import type { FlowsExecutionRoutesDependencies, FlowDebugTraceEntry } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerFlowsExecutionRoutes(deps: FlowsExecutionRoutesDependencies): void {
  deps.app.post('/api/flows/:apiName/execute', deps.accessAuthentication, deps.requirePermission('flows:run'), async (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const apiName = deps.routeParam(req, 'apiName');
    const flow = tenant.flows.find((item) => item.apiName === apiName);
    if (!flow) return res.status(404).json({ error: `Flow "${apiName}" was not found` });
    if (!['Autolaunched Flow', 'Screen Flow', 'Flow Orchestration'].includes(flow.flowType)) return res.status(400).json({ error: 'Only autolaunched, screen and orchestration flows can be invoked through this endpoint' });
    try {
      deps.authoriseManualCoreFlow(principal.tenantId, principal.tenantId,
        principal.userId, principal.permissions, flow.status);
    } catch (error) {
      return res.status(403).json({ error: error instanceof Error ? error.message : 'Flow execution denied' });
    }
    const input = deps.z.record(deps.z.unknown()).safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Flow input values must be an object' });
    const inputError = deps.validateFlowInputValues(flow, deps.sanitizeChatterCallerInput(apiName, input.data));
    if (inputError) return res.status(400).json({ error: inputError });
    const guard = deps.authoriseChatterFlow(apiName, {
      tenantId: principal.tenantId, userId: principal.userId,
      tenant, input: deps.sanitizeChatterCallerInput(apiName, input.data), credentials: tenant.namedCredentials, users: deps.state.users
    });
    if (guard && !guard.ok) return res.status(guard.status).json({error:guard.error});
    const authorisedInput = guard?.ok ? guard.input : input.data;
    const validation = deps.validateFlow(
      flow, tenant.objects, tenant.namedCredentials, tenant.integrationConnections,
      tenant.connectorDefinitions, tenant.emailAlerts, deps.formulaContextForUser(tenant, principal.userId), tenant.flows,
      tenant.approvalProcesses, tenant.platformEvents, principal.tenantId
    );
    if (!validation.valid) return res.status(422).json({ error: 'Flow execution validation failed', details: validation.errors });
    try {
      const working = structuredClone(tenant);
      const result = await deps.executeFlow(guard?.ok ? deps.trustedChatterExecutionFlow(flow, authorisedInput) : flow, working, principal.tenantId, principal.userId, authorisedInput, undefined, undefined, 0, undefined, 0, undefined, false, undefined, true);
      if (result.status === 'waiting') {
        const interview = deps.createFlowInterview(flow, principal.userId, result);
        working.interviews = [...working.interviews, interview];
        deps.persistTenantRecords(principal.tenantId, working);
        return res.status(202).json(result.kind === 'screen'
          ? { interviewId: interview.id, screen: result.screen, outcomes: result.outcomes, values: result.variables }
          : { interviewId: interview.id, waitUntil: result.waitUntil });
      }
      deps.persistTenantRecords(principal.tenantId, working);
      return res.json({ outputs: result.outputs });
    } catch (error) {
      deps.persistFlowFailure(principal.tenantId, flow, 'Manual', error, principal.userId);
      return res.status(422).json({ error: error instanceof Error ? error.message : 'Flow execution failed' });
    }
  });
  deps.app.post('/api/flows/:apiName/debug', deps.accessAuthentication, deps.requirePermission('flows:run'), async (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const apiName = deps.routeParam(req, 'apiName');
    const flow = tenant.flows.find((item) => item.apiName === apiName);
    if (!flow) return res.status(404).json({ error: `Flow "${apiName}" was not found` });
    if (!['Autolaunched Flow', 'Screen Flow', 'Flow Orchestration'].includes(flow.flowType)) {
      return res.status(400).json({ error: 'Only autolaunched, screen and orchestration flows can be debugged from Flow Builder' });
    }
    const input = deps.z.record(deps.z.unknown()).safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Flow debug inputs must be an object' });
    const inputError = deps.validateFlowInputValues(flow, input.data);
    if (inputError) return res.status(400).json({ error: inputError });
    const validation = deps.validateFlow(
      flow, tenant.objects, tenant.namedCredentials, tenant.integrationConnections,
      tenant.connectorDefinitions, tenant.emailAlerts, deps.formulaContextForUser(tenant, principal.userId), tenant.flows,
      tenant.approvalProcesses, tenant.platformEvents, principal.tenantId
    );
    if (!validation.valid) return res.status(422).json({ error: 'Flow debug validation failed', details: validation.errors });
    const debugTrace: FlowDebugTraceEntry[] = [];
    try {
      const working = structuredClone(tenant);
      const result = await deps.executeFlow(
        flow, working, principal.tenantId, principal.userId, input.data,
        undefined, undefined, 0, undefined, 0, undefined, false, undefined, true, true, debugTrace
      );
      return res.json({ ...result, sideEffectsSimulated: true });
    } catch (error) {
      return res.status(422).json({
        error: error instanceof Error ? error.message : 'Flow debug failed',
        debugTrace,
        sideEffectsSimulated: true
      });
    }
  });
}
