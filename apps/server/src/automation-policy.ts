import { randomUUID } from 'node:crypto';

export type AutomationSettings = {
  autoRetryFailedFlows: boolean;
  conversationIdleMinutes: number;
};

export const defaultAutomationSettings: AutomationSettings = {
  autoRetryFailedFlows: false,
  conversationIdleMinutes: 15
};

export function retryDelayMs(attempt: number): number {
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.min(Math.max(attempt - 1, 0), 6));
}

export function expiredConversationInterview(
  record: Record<string, unknown> | null | undefined,
  createdAt: string,
  nowMs: number,
  idleMinutes: number
): boolean {
  if (typeof record?.Conversation_Key__c !== 'string' || !record.Conversation_Key__c) return false;
  const started = Date.parse(createdAt);
  return Number.isFinite(started) && nowMs >= started + idleMinutes * 60_000;
}

// Session identity is transport metadata. Business routing and replies remain editable Flow metadata.
export function conversationKeyForIncoming(
  existingMessages: Array<Record<string, unknown>>,
  fromNumber: string,
  nowMs: number,
  idleMinutes: number,
  context = ''
): string {
  let latest: Record<string, unknown> | undefined;
  let lastAt = -Infinity;
  for (const item of existingMessages) {
    if (item.Direction__c !== 'Incoming' || item.From_Number__c !== fromNumber) continue;
    if (context && item.Conversation_Context__c !== context) continue;
    const at = typeof item.CreatedDate === 'string' ? Date.parse(item.CreatedDate) : NaN;
    if (Number.isFinite(at) && at <= nowMs && at > lastAt) {
      latest = item;
      lastAt = at;
    }
  }
  if (latest && nowMs - lastAt < idleMinutes * 60_000
    && typeof latest.Conversation_Key__c === 'string' && latest.Conversation_Key__c) {
    return latest.Conversation_Key__c;
  }
  return randomUUID();
}

/**
 * Meta's event timestamp is seconds since epoch. Only a recent inbound event
 * can start an interactive conversation: old retry deliveries remain archived
 * instead of sending another response after the idle session has expired.
 */
export function shouldTriggerInboundMessage(timestampSeconds: unknown, nowMs: number, idleMinutes: number): boolean {
  if (typeof timestampSeconds !== 'string' || !/^[0-9]{10}$/.test(timestampSeconds)) return false;
  const eventAt = Number(timestampSeconds) * 1000;
  const ageMs = nowMs - eventAt;
  return Number.isFinite(eventAt) && Number.isFinite(nowMs)
    && ageMs >= -60_000 && ageMs < idleMinutes * 60_000;
}

/** Session selection is metadata-driven; retain the last active customer context. */
export function activeConversationContext(
  records: Array<Record<string, unknown>>, fromNumber: string, nowMs: number, idleMinutes: number
): string {
  let lastAt = -Infinity;
  let context = '';
  for (const record of records) {
    if (record.Direction__c !== 'Incoming' || record.From_Number__c !== fromNumber) continue;
    if (typeof record.Conversation_Context__c !== 'string' || !record.Conversation_Context__c.trim()) continue;
    const at = typeof record.CreatedDate === 'string' ? Date.parse(record.CreatedDate) : NaN;
    if (Number.isFinite(at) && at <= nowMs && nowMs - at < idleMinutes * 60_000 && at > lastAt) {
      lastAt = at;
      context = record.Conversation_Context__c;
    }
  }
  return context;
}

/** Refresh only the matching active conversation, not another service's interview. */
export function sameConversationSession(
  interviewRecord: Record<string, unknown> | null | undefined,
  incomingRecord: Record<string, unknown>
): boolean {
  const incomingKey = incomingRecord.Conversation_Key__c;
  if (typeof incomingKey !== 'string' || !incomingKey) return false;
  if (interviewRecord?.Conversation_Key__c !== incomingKey) return false;
  const interviewContext = interviewRecord.Conversation_Context__c;
  const incomingContext = incomingRecord.Conversation_Context__c;
  if (typeof interviewContext === 'string' && interviewContext
    && typeof incomingContext === 'string' && incomingContext) {
    return interviewContext === incomingContext;
  }
  return true;
}
