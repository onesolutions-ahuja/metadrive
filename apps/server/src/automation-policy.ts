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
  idleMinutes: number
): string {
  let latest: Record<string, unknown> | undefined;
  let lastAt = -Infinity;
  for (const item of existingMessages) {
    if (item.Direction__c !== 'Incoming' || item.From_Number__c !== fromNumber) continue;
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
