import { canAccessChatterConversation, type ChatterScope, type ChatterOperation } from './chatter-access-policy.js';

/** Authorisation is calculated from tenant-owned server records, never browser props. */
export type ChatterRow = Record<string, unknown>;
export type ChatterGrantSource = { records: Record<string, ChatterRow[]> };
const asText = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const conversationAssignmentCache = new WeakMap<ChatterRow[], Map<string,string>>();
function latestAssignments(rows:ChatterRow[]): Map<string,string> {
  const existing=conversationAssignmentCache.get(rows);
  if(existing)return existing;
  const latest=new Map<string,{timestamp:string;assignee:string}>();
  for(const row of rows){
    if(!isWhatsAppMessage(row))continue;
    const account=asText(row.Channel_Account__c);
    const phone=asText(String(row.Direction__c).toLowerCase()==='incoming'
      ? row.From_Number__c : row.To_Number__c);
    if(!account||!phone)continue;
    const key=JSON.stringify([account,phone]);
    const timestamp=asText(row.Occurred_At__c||row.CreatedDate);
    const previous=latest.get(key);
    if(!previous||timestamp>=previous.timestamp)latest.set(key,{
      timestamp,assignee:asText(row.Assigned_User__c)
    });
  }
  const result=new Map([...latest.entries()].map(([key,value])=>[key,value.assignee]));
  conversationAssignmentCache.set(rows,result);
  return result;
}
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
  const assignedUserId=latestAssignments(tenant.records.Communication_Records__c??[])
    .get(JSON.stringify([channelAccountId,number])) || null;
  return canAccessChatterConversation(chatterScopeForUser(tenantId,userId,tenant), {
    tenantId, channelAccountId, assignedUserId
  }, operation);
}
