import type { FlowSchedulerDependencies, FlowRuntimeContext, FlowMetadata, TenantData, RuntimeRecord } from '../index.js';
import { defaultAutomationSettings, retryBudgetExhausted, expiredConversationInterview } from '../automation-policy.js';
import { scheduledOccurrence, nextScheduledOccurrence } from './occurrences.js';

export function createFlowSchedulingRuntime(deps: FlowSchedulerDependencies) {
  const { getState, activeFlowDefinition, tenantIsActive, tenantData, persistTenantRecords, createFlowFailureLog, asConfigRows, flowVariablesForUser, flowInterviewIdentity, flowConditionsMatch, formulaContextForUser, createFlowInterview, flowRetryDelayMs, executeFlow } = deps;
async function resumeDueFlowInterviews(now: Date): Promise<void> {
  for (const [tenantId, tenant] of Object.entries(getState().tenants)) {
    if (!tenantIsActive(tenantId)) continue;
    for (const interview of [...tenant.interviews]) {
      if (!['wait', 'scheduled', 'async'].includes(interview.kind) || !interview.waitUntil) continue;
      const settings = tenant.automationSettings ?? defaultAutomationSettings;
      const conversationKey = interview.record?.Conversation_Key__c;
      const conversational = interview.kind !== 'async' && typeof conversationKey === 'string' && Boolean(conversationKey);
      const owningFlow = conversational ? tenant.flows.find(flow => flow.apiName === interview.flowApiName) : undefined;
      const sessionRecords = owningFlow?.triggerObject ? (tenant.records[owningFlow.triggerObject] ?? []) : [];
      const lastActivityAt = sessionRecords.reduce((latest, item) => {
        if (item.Conversation_Key__c !== conversationKey || item.Direction__c !== 'Incoming') return latest;
        const timestamp = typeof item.CreatedDate === 'string' ? Date.parse(item.CreatedDate) : NaN;
        return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
      }, Date.parse(interview.createdAt));
      const expired = conversational
        ? expiredConversationInterview(interview.record, new Date(lastActivityAt).toISOString(), now.getTime(), settings.conversationIdleMinutes)
        : Date.parse(interview.expiresAt) <= now.getTime();
      if (expired || (!settings.autoRetryFailedFlows && interview.attempts > 0)
        || (interview.attempts > 0 && retryBudgetExhausted(interview.attempts, settings.maxRetryAttempts))) {
        const current = tenantData(tenantId);
        if (current) persistTenantRecords(tenantId, {
          ...current, interviews: current.interviews.filter(item => item.id !== interview.id)
        });
        continue;
      }
      if (Date.parse(interview.waitUntil) > now.getTime()
        || (interview.retryAt && Date.parse(interview.retryAt) > now.getTime())) continue;
      const currentTenant = tenantData(tenantId);
      if (!currentTenant) continue;
      const savedFlow = currentTenant.flows.find((item) => item.apiName === interview.flowApiName);
      const activeInterviewFlow = activeFlowDefinition(savedFlow);
      const archivedAsyncVersion = interview.kind === 'async' && savedFlow?.activeVersion !== null
        ? savedFlow?.versions.find((version) => version.versionNumber === interview.versionNumber)
        : undefined;
      const flow = interview.allowDraft && savedFlow?.status === 'Draft'
        && savedFlow.versionNumber === interview.versionNumber
        ? savedFlow
        : activeInterviewFlow?.versionNumber === interview.versionNumber
          ? activeInterviewFlow
          : savedFlow && archivedAsyncVersion
            ? { ...savedFlow, ...archivedAsyncVersion, status: 'Active' as const,
              activeVersion: archivedAsyncVersion.versionNumber, versionNumber: archivedAsyncVersion.versionNumber }
            : undefined;
      const working = structuredClone(currentTenant);
      try {
        if (interview.kind === 'wait' && !conversational && Date.parse(interview.expiresAt) <= now.getTime()) {
          throw new Error('Wait interview expired before it could resume.');
        }
        if (!flow) throw new Error('Wait interview flow version is no longer active.');
        if (interview.nextElementId === null) {
          working.interviews = working.interviews.filter((item) => item.id !== interview.id);
          persistTenantRecords(tenantId, working);
          continue;
        }
        const result = await executeFlow(flow, working, tenantId, interview.userId, {}, interview.record ?? undefined, interview.prior ?? undefined, 0, {
          startAt: interview.nextElementId,
          variables: interview.variables,
          interviewGuid: interview.id,
          interviewStartTime: interview.createdAt
        }, 0, interview.recordEvent ?? undefined, interview.isClone, undefined, interview.allowDraft);
        if (result.status === 'waiting') {
          const updated = createFlowInterview(flow, interview.userId, result);
          working.interviews = working.interviews.map((item) => item.id === interview.id ? updated : item);
        } else {
          working.interviews = working.interviews.filter((item) => item.id !== interview.id);
        }
        persistTenantRecords(tenantId, working);
      } catch (error) {
        console.error(`Wait interview "${interview.id}" failed: ${error instanceof Error ? error.message : String(error)}`);
        const failedTenant = structuredClone(tenantData(tenantId) ?? currentTenant);
        const failedInterview = failedTenant.interviews.find((item) => item.id === interview.id);
        const expired = Date.parse(interview.expiresAt) <= now.getTime();
        if (expired || !settings.autoRetryFailedFlows
          || retryBudgetExhausted((failedInterview?.attempts ?? 0) + 1, settings.maxRetryAttempts)) {
          failedTenant.interviews = failedTenant.interviews.filter((item) => item.id !== interview.id);
        } else if (failedInterview) {
          failedInterview.attempts += 1;
          failedInterview.retryAt = new Date(now.getTime() + flowRetryDelayMs(failedInterview.attempts)).toISOString();
        }
        failedTenant.flowLogs.push(createFlowFailureLog(
          flow ?? { apiName: interview.flowApiName, label: interview.flowApiName },
          interview.kind === 'scheduled' ? 'Scheduled Path' : interview.kind === 'async' ? 'Async Path' : 'Wait Interview',
          error,
          interview.userId
        ));
        persistTenantRecords(tenantId, failedTenant);
      }
    }
  }
}

async function executeDueScheduledFlows(now = new Date()): Promise<void> {
  await resumeDueFlowInterviews(now);
  for (const [tenantId, tenant] of Object.entries(getState().tenants)) {
    if (!tenantIsActive(tenantId)) continue;
    for (const candidate of [...tenant.flows]) {
      const currentTenant = tenantData(tenantId);
      if (!currentTenant) continue;
      const flow = activeFlowDefinition(candidate);
      if (!flow || flow.flowType !== 'Schedule-Triggered Flow' || !flow.triggerObject) continue;
      const runKey = `${flow.apiName}@${flow.activeVersion ?? flow.versionNumber}`;
      const latestOccurrence = scheduledOccurrence(flow, now);
      const pendingRetry = currentTenant.scheduleRetries[runKey];
      const settings = currentTenant.automationSettings ?? defaultAutomationSettings;
      const autoRetry = settings.autoRetryFailedFlows;
      if (pendingRetry && (!autoRetry
        || retryBudgetExhausted(pendingRetry.attempts, settings.maxRetryAttempts))) {
        const updated = structuredClone(currentTenant);
        updated.scheduleRuns[runKey] = pendingRetry.occurrenceAt;
        delete updated.scheduleRetries[runKey];
        persistTenantRecords(tenantId, updated);
        continue;
      }
      const lastRun = currentTenant.scheduleRuns[runKey];
      const pendingOccurrence = pendingRetry && (!lastRun || Date.parse(pendingRetry.occurrenceAt) > Date.parse(lastRun))
        ? new Date(pendingRetry.occurrenceAt)
        : undefined;
      const occurrence = pendingOccurrence ?? (lastRun
        ? nextScheduledOccurrence(flow, new Date(lastRun), now)
        : latestOccurrence);
      if (pendingRetry && occurrence?.toISOString() === pendingRetry.occurrenceAt
        && Date.parse(pendingRetry.retryAt) > now.getTime()) continue;
      if (!occurrence || (currentTenant.scheduleRuns[runKey] && Date.parse(currentTenant.scheduleRuns[runKey]) >= occurrence.getTime())) continue;
      const working = structuredClone(currentTenant);
      try {
        const objectName = flow.triggerObject;
        const conditions = asConfigRows(flow.startConfig.entryConditions);
        const candidates = working.records[objectName] ?? [];
        if (candidates.length > 2000) throw new Error(`Scheduled flow "${flow.label}" exceeded the 2,000-record execution limit.`);
        for (const record of candidates) {
          const scheduledUserId = getState().users.find((user) => user.tenantId === tenantId && !user.disabled)?.id ?? 'scheduled-system';
          const context: FlowRuntimeContext = {
            record,
            resourceDefinitions: flow.resources,
            formulaStack: new Set(),
            variables: {},
            currentUserId: scheduledUserId,
            ...formulaContextForUser(working, scheduledUserId),
            flowVariables: flowVariablesForUser(working, scheduledUserId)
          };
          if (flowConditionsMatch(conditions, record, context, flow.startConfig.conditionLogic)) {
            const result = await executeFlow(flow, working, tenantId, context.currentUserId, {}, record, undefined, 0, undefined, 0, undefined, false, flowInterviewIdentity(context));
            if (result.status === 'waiting') {
              if (result.kind !== 'wait') throw new Error('Scheduled flows cannot pause for screen input.');
              working.interviews.push(createFlowInterview(flow, context.currentUserId, result));
            }
          }
        }
        working.scheduleRuns[runKey] = occurrence.toISOString();
        delete working.scheduleRetries[runKey];
        persistTenantRecords(tenantId, working);
      } catch (error) {
        console.error(`Scheduled flow "${flow.apiName}" failed for tenant "${tenantId}": ${error instanceof Error ? error.message : String(error)}`);
        const failedTenant = structuredClone(tenantData(tenantId) ?? currentTenant);
        const attempts = (pendingRetry?.occurrenceAt === occurrence.toISOString() ? pendingRetry.attempts : 0) + 1;
        if (autoRetry && !retryBudgetExhausted(attempts, settings.maxRetryAttempts)) {
          failedTenant.scheduleRetries[runKey] = {
            occurrenceAt: occurrence.toISOString(),
            attempts,
            retryAt: new Date(now.getTime() + flowRetryDelayMs(attempts)).toISOString()
          };
        } else {
          // Mark the failed occurrence handled; a later scheduled occurrence may still run.
          failedTenant.scheduleRuns[runKey] = occurrence.toISOString();
          delete failedTenant.scheduleRetries[runKey];
        }
        failedTenant.flowLogs.push(createFlowFailureLog(flow, 'Scheduled', error, null));
        persistTenantRecords(tenantId, failedTenant);
      }
    }
  }
}

function platformEventFlowMatches(
  flow: FlowMetadata,
  tenant: TenantData,
  userId: string,
  payload: RuntimeRecord
): boolean {
  const context: FlowRuntimeContext = {
    record: payload,
    triggerObjectName: flow.triggerObject ?? undefined,
    currentUserId: userId,
    resourceDefinitions: flow.resources,
    formulaStack: new Set(),
    variables: Object.fromEntries(flow.resources.map((resource) => [resource.name, resource.value])),
    flowVariables: flowVariablesForUser(tenant, userId),
    ...formulaContextForUser(tenant, userId)
  };
  return flowConditionsMatch(
    asConfigRows(flow.startConfig.entryConditions),
    payload,
    context,
    flow.startConfig.conditionLogic
  );
}

async function deliverPendingPlatformEvents(now = new Date()): Promise<void> {
  const nowIso = now.toISOString();
  for (const tenantId of Object.keys(getState().tenants)) {
    if (!tenantIsActive(tenantId)) continue;
    const snapshot = tenantData(tenantId);
    if (!snapshot) continue;
    const dueMessages = snapshot.platformEventMessages.filter((message) =>
      !message.processedAt && !message.deadLettered
      && (!message.retryAt || Date.parse(message.retryAt) <= now.getTime()));
    for (const queuedMessage of dueMessages) {
      let currentTenant = tenantData(tenantId);
      let message = currentTenant?.platformEventMessages.find((item) => item.id === queuedMessage.id);
      if (!currentTenant || !message || message.processedAt || message.deadLettered) continue;
      const settings = currentTenant.automationSettings ?? defaultAutomationSettings;
      const autoRetry = settings.autoRetryFailedFlows;
      if ((!autoRetry && message.attempts > 0)
        || (message.attempts > 0 && retryBudgetExhausted(message.attempts, settings.maxRetryAttempts))) {
        persistTenantRecords(tenantId, {
          ...currentTenant,
          platformEventMessages: currentTenant.platformEventMessages.map(item =>
            item.id === message?.id ? { ...item, deadLettered: true, retryAt: null } : item)
        });
        continue;
      }
      const subscriberTenant = currentTenant;
      const eventMessage = message;
      const subscribers = subscriberTenant.flows.map(activeFlowDefinition)
        .filter((flow): flow is FlowMetadata => flow !== undefined
        && flow.flowType === 'Platform Event-Triggered Flow'
        && flow.triggerObject === eventMessage.eventApiName
        && platformEventFlowMatches(flow, subscriberTenant, eventMessage.publishedBy, eventMessage.payload as RuntimeRecord));
      if (!subscribers.length) {
        persistTenantRecords(tenantId, {
          ...currentTenant,
          platformEventMessages: currentTenant.platformEventMessages.map((item) => item.id === message?.id
            ? { ...item, processedAt: nowIso, retryAt: null, lastError: '' }
            : item)
        });
        continue;
      }
      for (const subscriber of subscribers) {
        currentTenant = tenantData(tenantId);
        message = currentTenant?.platformEventMessages.find((item) => item.id === queuedMessage.id);
        if (!currentTenant || !message || message.deliveredFlowApiNames.includes(subscriber.apiName)) continue;
        try {
          const working = structuredClone(currentTenant);
          const activeFlow = activeFlowDefinition(working.flows.find((flow) => flow.apiName === subscriber.apiName
            && flow.flowType === 'Platform Event-Triggered Flow'));
          if (!activeFlow) continue;
          const result = await executeFlow(
            activeFlow, working, tenantId, message.publishedBy, {},
            message.payload as RuntimeRecord
          );
          if (result.status === 'waiting') {
            if (result.kind === 'screen') throw new Error('Platform Event-Triggered Flows cannot pause for screen input.');
            working.interviews.push(createFlowInterview(activeFlow, message.publishedBy, result));
          }
          working.platformEventMessages = working.platformEventMessages.map((item) => item.id === message?.id
            ? {
              ...item,
              deliveredFlowApiNames: [...item.deliveredFlowApiNames, activeFlow.apiName],
              attempts: 0,
              retryAt: null,
              lastError: ''
            }
            : item);
          const updatedMessage = working.platformEventMessages.find((item) => item.id === message?.id);
          const allDelivered = subscribers.every((flow) =>
            updatedMessage?.deliveredFlowApiNames.includes(flow.apiName));
          if (allDelivered && updatedMessage) {
            working.platformEventMessages = working.platformEventMessages.map((item) => item.id === updatedMessage.id
              ? { ...item, processedAt: nowIso }
              : item);
          }
          persistTenantRecords(tenantId, working);
        } catch (error) {
          const failedTenant = tenantData(tenantId);
          if (!failedTenant) continue;
          const failedMessage = failedTenant.platformEventMessages.find((item) => item.id === queuedMessage.id);
          if (!failedMessage) continue;
          const attempts = failedMessage.attempts + 1;
          const deadLettered = !autoRetry || retryBudgetExhausted(attempts, settings.maxRetryAttempts);
          const retryAt = deadLettered ? null : new Date(now.getTime() + flowRetryDelayMs(attempts)).toISOString();
          const failure = error instanceof Error ? error.message : String(error);
          persistTenantRecords(tenantId, {
            ...failedTenant,
            platformEventMessages: failedTenant.platformEventMessages.map((item) => item.id === failedMessage.id
              ? { ...item, attempts, retryAt, lastError: failure.slice(0, 1000), deadLettered }
              : item),
            flowLogs: [...failedTenant.flowLogs, createFlowFailureLog(subscriber, 'Platform Event', failure, failedMessage.publishedBy)]
          });
          break;
        }
      }
    }
  }
}


  return { resumeDueFlowInterviews, executeDueScheduledFlows, deliverPendingPlatformEvents };
}
