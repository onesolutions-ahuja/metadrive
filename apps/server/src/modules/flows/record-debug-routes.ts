import type { Request, Response } from "express";
import type { FlowRecordDebugRoutesDependencies, FlowDebugTraceEntry, FlowRuntimeContext } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerFlowRecordDebugRoutes(deps: FlowRecordDebugRoutesDependencies): void {
  deps.app.post('/api/flows/:apiName/debug-record', deps.accessAuthentication, deps.requirePermission('flows:run'), async (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant was not found' });
    const flow = tenant.flows.find((item) => item.apiName === deps.routeParam(req, 'apiName'));
    if (!flow) return res.status(404).json({ error: 'Flow was not found' });
    if (flow.flowType !== 'Record-Triggered Flow') {
      return res.status(400).json({ error: 'Record-triggered debug only supports Record-Triggered Flows' });
    }
    const parsed = deps.recordFlowDebugRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid record-trigger test inputs', details: parsed.error.flatten() });
    const { event, isClone } = parsed.data;
    // Test fixtures may omit platform-maintained audit fields. Supply them only
    // in the isolated fixture; never modify live records or silently accept an
    // invalid value explicitly provided by the caller.
    const now = new Date().toISOString();
    const recordId = typeof parsed.data.record.Id === 'string' && parsed.data.record.Id
      ? parsed.data.record.Id : `DEBUG-${deps.randomUUID()}`;
    const fixture = (values: Record<string, unknown>, id: string) => deps.runtimeRecordSchema.safeParse({
      Id: id, CreatedDate: now, LastModifiedDate: now, ...values
    });
    const recordResult = fixture(parsed.data.record, recordId);
    const priorResult = parsed.data.prior ? fixture(parsed.data.prior, recordId) : undefined;
    if (!recordResult.success || (priorResult && !priorResult.success)) {
      return res.status(400).json({ error: 'Invalid record sample: Id must be text and audit timestamps must be valid ISO dates' });
    }
    const record = recordResult.data;
    const prior = priorResult?.data;
    if (prior && prior.Id !== record.Id) {
      return res.status(400).json({ error: 'Current and prior samples must identify the same record' });
    }
    const objectName = flow.triggerObject ?? '';
    const object = tenant.objects.find((item) => item.apiName === objectName);
    if (!object || !deps.hasObjectPermission(principal, tenant, objectName, 'read')) {
      return res.status(403).json({ error: 'Read access to the Flow trigger object is required' });
    }
    const auditFields = new Set(['CreatedDate', 'LastModifiedDate', 'CreatedById', 'LastModifiedById', 'SystemModstamp']);
    const availableFields = new Set(['Id', ...auditFields, ...object.fields.map((field) => field.apiName)]);
    for (const sample of [record, prior]) {
      if (!sample) continue;
      const unknown = Object.keys(sample).find((name) => !availableFields.has(name));
      if (unknown) return res.status(400).json({ error: `Unknown record field "${unknown}"` });
      const protectedField = Object.keys(sample).find((name) => name !== 'Id' && !auditFields.has(name)
        && !deps.hasFieldPermission(principal, tenant, objectName, name, 'read'));
      if (protectedField) return res.status(403).json({ error: `No read permission for field "${protectedField}"` });
      if (typeof sample.Id === 'string') {
        const persisted = tenant.records[objectName]?.find((item) => item.Id === sample.Id);
        if (persisted && !deps.hasRecordAccess(principal, tenant, objectName, persisted, 'Read')) {
          return res.status(403).json({ error: 'Read access to the selected record is required' });
        }
      }
    }
    if ((event === 'updated' || event === 'deleted') && !prior) {
      return res.status(400).json({ error: 'Updated and deleted record tests require prior record values' });
    }
    if (event === 'created' && prior) {
      return res.status(400).json({ error: 'Created record tests cannot contain prior values' });
    }
    if (event === 'deleted' && flow.startConfig.runWhen === 'before-save') {
      return res.status(400).json({ error: 'Deleted record tests cannot run before save' });
    }
    const validation = deps.validateFlow(
      flow, tenant.objects, tenant.namedCredentials, tenant.integrationConnections,
      tenant.connectorDefinitions, tenant.emailAlerts, deps.formulaContextForUser(tenant, principal.userId),
      tenant.flows, tenant.approvalProcesses, tenant.platformEvents, principal.tenantId
    );
    if (!validation.valid) return res.status(422).json({ error: 'Flow debug validation failed', details: validation.errors });
    const debugTrace: FlowDebugTraceEntry[] = [];
    try {
      const trigger = String(flow.startConfig.trigger ?? 'created-or-updated');
      const matchesEvent = trigger === event || (trigger === 'created-or-updated' && event !== 'deleted');
      const source = event === 'deleted' ? prior ?? record : record;
      const context: FlowRuntimeContext = {
        record: source, prior, recordEvent: event, isClone,
        triggerObjectName: objectName, resourceDefinitions: flow.resources,
        formulaStack: new Set(), variables: {}, currentUserId: principal.userId,
        debug: true, debugTrace,
        ...deps.formulaContextForUser(tenant, principal.userId),
        flowVariables: deps.flowVariablesForUser(tenant, principal.userId)
      };
      const conditions = deps.asConfigRows(flow.startConfig.entryConditions);
      const matchesCriteria = matchesEvent && deps.flowConditionsMatch(conditions, source, context, flow.startConfig.conditionLogic);
      const matchedPrior = event === 'updated' && flow.startConfig.updatedRecordBehavior === 'transition'
        && prior && deps.flowConditionsMatch(conditions, prior, { ...context, record: prior, prior: undefined }, flow.startConfig.conditionLogic);
      if (!matchesCriteria || matchedPrior) {
        return res.json({
          status: 'skipped', matchedEvent: matchesEvent,
          reason: !matchesEvent ? 'Trigger event does not match'
            : matchedPrior ? 'Record matched entry conditions before this update'
              : 'Record did not match entry conditions',
          debugTrace, sideEffectsSimulated: true
        });
      }
      const working = structuredClone(tenant);
      const result = await deps.executeFlow(
        flow, working, principal.tenantId, principal.userId, {}, structuredClone(source),
        prior ? structuredClone(prior) : undefined, 0, undefined, 0, event, isClone,
        undefined, true, true, debugTrace
      );
      return res.json({ ...result, matchedEvent: true, debugTrace, sideEffectsSimulated: true });
    } catch (error) {
      return res.status(422).json({
        error: error instanceof Error ? error.message : 'Record-triggered debug failed',
        debugTrace, sideEffectsSimulated: true
      });
    }
  });
}
