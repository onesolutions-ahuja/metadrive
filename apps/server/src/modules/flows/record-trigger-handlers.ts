import type { RecordTriggerDependencies, TenantData, RuntimeRecord, FlowDebugTraceEntry, FlowRuntimeContext, RecordEvent } from '../../index.js';

export function createRecordTriggerHandlers(dependencies: RecordTriggerDependencies) {
  const { orderedRecordTriggeredFlows, asConfigRows, flowConditionsMatch, formulaContextForUser, flowVariablesForUser, flowInterviewIdentity, executeFlow, createFlowInterview, persistFlowFailure, calculateFormulaFields } = dependencies;
async function runRecordTriggeredFlows(
  tenantId: string,
  tenant: TenantData,
  userId: string,
  objectName: string,
  event: RecordEvent,
  record: RuntimeRecord,
  prior?: RuntimeRecord,
  depth = 0,
  isClone = false,
  debugExecution = false,
  debugTrace: FlowDebugTraceEntry[] = [],
  rollbackSnapshot?: TenantData
): Promise<void> {
  if (depth > 10) throw new Error('Record-triggered flow recursion exceeded the 10-level limit.');
  for (const flow of orderedRecordTriggeredFlows(tenant, objectName, 'after-save')) {
    const trigger = String(flow.startConfig.trigger ?? 'created-or-updated');
    if (event === 'deleted') {
      tenant.interviews = tenant.interviews.filter((interview) =>
        interview.kind !== 'scheduled'
        || interview.flowApiName !== flow.apiName
        || interview.record?.Id !== (prior ?? record).Id);
    }
    if (trigger !== event && trigger !== 'created-or-updated') continue;
    const conditions = asConfigRows(flow.startConfig.entryConditions);
    const source = event === 'deleted' ? prior ?? record : record;
    const context: FlowRuntimeContext = {
      record: source, prior, recordEvent: event, isClone, triggerObjectName: objectName, resourceDefinitions: flow.resources,
      formulaStack: new Set(), variables: {}, currentUserId: userId, debug: debugExecution, debugTrace,
      ...formulaContextForUser(tenant, userId), flowVariables: flowVariablesForUser(tenant, userId)
    };
    const matchesCurrentRecord = flowConditionsMatch(conditions, source, context, flow.startConfig.conditionLogic);
    const transitionAlreadyMatched = event === 'updated'
      && flow.startConfig.updatedRecordBehavior === 'transition'
      && prior
      && flowConditionsMatch(conditions, prior, { ...context, record: prior, prior: undefined }, flow.startConfig.conditionLogic);
    if (!transitionAlreadyMatched && !matchesCurrentRecord) {
      tenant.interviews = tenant.interviews.filter((interview) =>
        interview.kind !== 'scheduled'
        || interview.flowApiName !== flow.apiName
        || interview.record?.Id !== source.Id);
    }
    if (!matchesCurrentRecord || transitionAlreadyMatched) continue;
    try {
      const result = await executeFlow(
        flow, tenant, tenantId, userId, {}, source, prior, 0, undefined, depth, event, isClone,
        flowInterviewIdentity(context), false, debugExecution, debugTrace, rollbackSnapshot
      );
      if (result.status === 'waiting') {
        if (result.kind !== 'wait' && result.kind !== 'orchestration') throw new Error(`Record-triggered flow "${flow.label}" cannot pause for screen input.`);
        tenant.interviews.push(createFlowInterview(flow, userId, result));
      }
    } catch (error) {
      if (!debugExecution) persistFlowFailure(tenantId, flow, 'Record-Triggered', error, userId);
      throw error;
    }
  }
}

async function runBeforeSaveRecordTriggeredFlows(
  tenantId: string,
  tenant: TenantData,
  userId: string,
  objectName: string,
  event: 'created' | 'updated',
  record: RuntimeRecord,
  prior?: RuntimeRecord,
  depth = 0,
  isClone = false,
  debugExecution = false,
  debugTrace: FlowDebugTraceEntry[] = [],
  rollbackSnapshot?: TenantData
): Promise<void> {
  if (depth > 10) throw new Error('Before-save flow recursion exceeded the 10-level limit.');
  const object = tenant.objects.find((item) => item.apiName === objectName);
  if (!object) throw new Error(`Before-save flow trigger object "${objectName}" does not exist.`);
  for (const flow of orderedRecordTriggeredFlows(tenant, objectName, 'before-save')) {
    const trigger = String(flow.startConfig.trigger ?? 'created-or-updated');
    if (trigger !== event && trigger !== 'created-or-updated') continue;
    const conditions = asConfigRows(flow.startConfig.entryConditions);
    const context: FlowRuntimeContext = {
      record, prior, recordEvent: event, isClone, triggerObjectName: objectName, resourceDefinitions: flow.resources, formulaStack: new Set(),
      debug: debugExecution, debugTrace,
      variables: {}, currentUserId: userId, ...formulaContextForUser(tenant, userId),
      flowVariables: flowVariablesForUser(tenant, userId)
    };
    if (!flowConditionsMatch(conditions, record, context, flow.startConfig.conditionLogic)) continue;
    if (event === 'updated' && flow.startConfig.updatedRecordBehavior === 'transition' && prior
      && flowConditionsMatch(conditions, prior, { ...context, record: prior, prior: undefined }, flow.startConfig.conditionLogic)) continue;
    try {
      const result = await executeFlow(
        flow, tenant, tenantId, userId, {}, record, prior, 0, undefined, depth, event, isClone,
        flowInterviewIdentity(context), false, debugExecution, debugTrace, rollbackSnapshot
      );
      if (result.status !== 'completed') {
        throw new Error(`Before-save flow "${flow.label}" cannot pause for user or scheduled input.`);
      }
      Object.assign(record, calculateFormulaFields(object, record, { ...formulaContextForUser(tenant, userId), isClone }));
    } catch (error) {
      if (!debugExecution) persistFlowFailure(tenantId, flow, 'Record-Triggered', error, userId);
      throw error;
    }
  }
}

  return { runRecordTriggeredFlows, runBeforeSaveRecordTriggeredFlows };
}
