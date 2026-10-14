import { buildChatterView, type CommunicationRow } from './chatterRecordAdapter';

export type ChannelGrant = { channelAccountId: string; canRead: boolean; canSend: boolean; canAssign: boolean };
type PresentationContext = { grants: readonly ChannelGrant[]; userId: string; viewAll: boolean;
  eligibleAssignees?: readonly {id:string;name:string;channelAccountId:string}[] };
type Presenter = (records: readonly CommunicationRow[], context: PresentationContext) => Record<string, unknown>;

function communicationThread(records: readonly CommunicationRow[], context: PresentationContext): Record<string, unknown> {
  const grants = new Map(context.grants.filter(grant=>grant.canRead).map(grant => [grant.channelAccountId, grant]));
  const visible = records.filter(row => grants.has(String(row.Channel_Account__c || '')));
  const model = buildChatterView(visible);
  const conversations = model.conversations.map(chat => ({
    ...chat,
    canSend: grants.get(chat.channelAccountId)?.canSend === true,
    canAssign: grants.get(chat.channelAccountId)?.canAssign === true
  }));
  return {
    conversations, messages:model.messages, currentUserId:context.userId,
    canViewAll:context.viewAll, allowedAccountIds:[...grants.keys()],
    canSend:conversations.some(chat=>chat.canSend),
    eligibleAssignees:context.eligibleAssignees??[],
    channelAccounts:[...grants.keys()].map(id=>({id,name:id}))
  };
}
/** Extend via named metadata adapters, not per-component rendering code. */
const recordPresenters: Readonly<Record<string, Presenter>> = Object.freeze({
  CommunicationThread: communicationThread
});
export function presentPageRecords(apiName: unknown, records: readonly CommunicationRow[], context: PresentationContext) {
  if (typeof apiName !== 'string' || !apiName) return {records};
  const presenter = recordPresenters[apiName];
  return presenter ? presenter(records, context) : {records:[]};
}
