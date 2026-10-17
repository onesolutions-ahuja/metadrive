import type { FlowMetadata, FlowExecutionResult, FlowInterview } from '../../index.js';

import { defaultAutomationSettings } from '../../automation-policy.js';

type InterviewDependencies = {
  getTenantIdForUser: (userId: string) => string | undefined;
  tenantData: (tenantId: string) => TenantData | undefined;
};

export function createFlowInterview(flow: FlowMetadata, userId: string, result: Extract<FlowExecutionResult, { status: 'waiting' }>, dependencies: InterviewDependencies): FlowInterview {
  const createdAt = result.interviewStartTime;
  const tenantId = dependencies.getTenantIdForUser(userId);
  const idleMinutes = (tenantId ? dependencies.tenantData(tenantId)?.automationSettings.conversationIdleMinutes : undefined)
    ?? defaultAutomationSettings.conversationIdleMinutes;
  const conversationExpiry = ['screen', 'wait'].includes(result.kind) && typeof result.record?.Conversation_Key__c === 'string' && result.record.Conversation_Key__c
    ? new Date(Date.parse(createdAt) + idleMinutes * 60_000).toISOString()
    : null;
  const expiresAt = conversationExpiry ?? (result.kind === 'screen'
    ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    : (result.kind === 'scheduled' || result.kind === 'async' || result.kind === 'orchestration')
      ? '9999-12-31T23:59:59.999Z'
      : new Date(Date.parse(result.waitUntil) + 7 * 24 * 60 * 60 * 1000).toISOString());
  return {
    id: result.interviewGuid,
    flowApiName: flow.apiName,
    versionNumber: flow.status === 'Active' ? flow.activeVersion ?? flow.versionNumber : flow.versionNumber,
    userId,
    allowDraft: flow.status === 'Draft',
    kind: result.kind,
    recordEvent: result.recordEvent ?? null,
    isClone: result.isClone ?? false,
    screenElementId: result.kind === 'screen' ? result.screen.id : result.kind === 'orchestration' ? result.stage.id : null,
    waitUntil: result.kind === 'screen' ? null : result.waitUntil,
    nextElementId: result.nextElementId,
    variables: result.variables,
    record: result.record ?? null,
    prior: result.prior ?? null,
    createdAt,
    expiresAt,
    history: [],
    retryAt: null,
    attempts: 0
  };
}

