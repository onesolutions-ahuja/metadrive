import { canAccessChatterConversation, type ChatterScope, type ChatterOperation } from './chatter-access-policy.js';

/** Authorisation is calculated from tenant-owned server records, never browser props. */
export type ChatterRow = Record<string, unknown>;
export type ChatterGrantSource = { records: Record<string, ChatterRow[]> };
const asText = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
export function isWhatsAppMessage(record: ChatterRow): boolean {
  return asText(record.Event_Type__c).toLowerCase() === 'message'
    && asText(record.Communication_Mode__c).toLowerCase() === 'whatsapp';
}
export function chatterScopeForUser(tenantId: string, userId: string, tenant: ChatterGrantSource): ChatterScope {
  const rows = tenant.records.Chatter_Channel_Grant__c ?? [];
  const mine = rows.filter(row => asText(row.User_Id__c) === userId && row.Active__c === true);
  return {
    tenantId, userId,
    viewAllConversations: mine.some(row => row.View_All__c === true),
    grants: mine.filter(row => asText(row.Channel_Account__c)).map(row => ({
      userId, channelAccountId: asText(row.Channel_Account__c),
      canRead: row.Can_Read__c === true,
      canSend: row.Can_Send__c === true,
      canAssign: row.Can_Assign__c === true
    }))
  };
}
export function canAccessChatterRecord(
  tenantId: string, userId: string, tenant: ChatterGrantSource,
  record: ChatterRow, operation: ChatterOperation
): boolean {
  if (!isWhatsAppMessage(record)) return false;
  const channelAccountId = asText(record.Channel_Account__c);
  const number = asText(String(record.Direction__c).toLowerCase() === 'incoming'
    ? record.From_Number__c : record.To_Number__c);
  // Assignment belongs to the conversation, not a historical message.
  // Resolve the latest record to keep old messages visible after reassignment.
  const latest = (tenant.records.Communication_Records__c ?? [])
    .filter(row => isWhatsAppMessage(row)
      && asText(row.Channel_Account__c) === channelAccountId
      && asText(String(row.Direction__c).toLowerCase() === 'incoming'
        ? row.From_Number__c : row.To_Number__c) === number)
    .sort((a,b)=>asText(b.Occurred_At__c||b.CreatedDate)
      .localeCompare(asText(a.Occurred_At__c||a.CreatedDate)))[0];
  return canAccessChatterConversation(chatterScopeForUser(tenantId,userId,tenant), {
    tenantId, channelAccountId,
    assignedUserId: asText(latest?.Assigned_User__c) || null
  }, operation);
}
