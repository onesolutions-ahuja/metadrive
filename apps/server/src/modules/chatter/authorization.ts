import {canAccessChatterConversation, type ChatterScope, type ChatterOperation} from '../../chatter-access-policy.js';

type Row = Record<string, unknown>;
type Tenant = {records: Record<string, Row[]>; pages: Array<{apiName:string;status:string}>;
  namedCredentials: Array<{id:string;protocol:string;enabled?:boolean;baseUrl:string}>};
type Principal = {tenantId:string;userId:string};
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const enabled = (value: unknown): boolean => value === true;
const msg = (row: Row): boolean => row.Communication_Mode__c === 'WhatsApp' && row.Event_Type__c === 'Message';
const linked = (row: Row, account: string, phone: string): boolean =>
  text(row.Channel_Account__c) === account && msg(row) &&
  (text(row.From_Number__c) === phone || text(row.To_Number__c) === phone);

function accountGrants(tenant:Tenant, principal:Principal): ChatterScope {
  const mine = (tenant.records.Chatter_Channel_Grant__c ?? []).filter(row =>
    enabled(row.Active__c) && text(row.User_Id__c) === principal.userId);
  return {tenantId:principal.tenantId,userId:principal.userId,
    viewAllConversations:mine.some(row => enabled(row.View_All__c)),
    grants:mine.map(row => ({
      userId:principal.userId,channelAccountId:text(row.Channel_Account__c),
      canRead:enabled(row.Can_Read__c), canSend:enabled(row.Can_Send__c),
      canAssign:enabled(row.Can_Assign__c)
    }))};
}

/** Scope all WhatsApp message reads through existing OneEngine record RBAC AND channel grants.
 * Legacy tenants remain unchanged until Chatter is activated.
 */
export function chatterRecordVisible(tenant:Tenant,principal:Principal,record:Row,access:'Read'|'Edit'|'Delete'): boolean {
  if(!tenant.pages.some(page => page.apiName==='UNE_CHATTER' && page.status==='Active') || !msg(record)) return true;
  const account = text(record.Channel_Account__c);
  if(!account) return false;
  const scope = accountGrants(tenant,principal);
  const operation:ChatterOperation = access==='Read'?'read':'assign';
  const contact=text(record.Direction__c==='Incoming'?record.From_Number__c:record.To_Number__c);
  if (!contact) return false;
  const latestAssigned=(tenant.records.Communication_Records__c??[])
    .filter(row=>linked(row,account,contact)&&text(row.Assigned_User__c))
    .sort((a,b)=>text(b.Occurred_At__c).localeCompare(text(a.Occurred_At__c)))[0];
  return canAccessChatterConversation(scope,{
    tenantId:principal.tenantId,channelAccountId:account,
    assignedUserId:text(latestAssigned?.Assigned_User__c) || null
  },operation);
}

type Inputs = Record<string,unknown>;
export function prepareChatterFlowInputs(
  tenant:Tenant, principal:Principal, flowApiName:string, supplied:Inputs,
  users:ReadonlyArray<{id:string;tenantId:string;disabled?:boolean}>
): {inputs:Inputs;error?:string} {
  if(flowApiName!=='CHATTER_SEND_MESSAGE' && flowApiName!=='CHATTER_ASSIGN_CONVERSATION') return {inputs:supplied};
  const deny=(error:string):{inputs:Inputs;error:string}=>({inputs:{},error});
  if(!tenant.pages.some(page=>page.apiName==='UNE_CHATTER'&&page.status==='Active')) return deny('Chatter is not activated');
  if(!users.some(user=>user.id===principal.userId&&user.tenantId===principal.tenantId&&!user.disabled))
    return deny('Authenticated tenant user is unavailable');
  const channelAccountId=text(supplied.ChannelAccountId);
  const conversationId=text(supplied.ConversationId);
  let key:unknown;
  try{key=JSON.parse(conversationId)}catch{return deny('Invalid conversation identity');}
  if(!Array.isArray(key)||key.length!==2||key[0]!==channelAccountId||
    typeof key[1]!=='string'||!/^\d{7,15}$/.test(key[1])) return deny('Invalid conversation identity');
  const recipient=key[1];
  const account=(tenant.records.Chatter_Channel_Account__c??[]).find(row =>
    enabled(row.Active__c)&&text(row.Phone_Number_Id__c)===channelAccountId);
  if(!account)return deny('Channel is unavailable');
  const messages=(tenant.records.Communication_Records__c??[]).filter(row=>linked(row,channelAccountId,recipient))
    .sort((a,b)=>text(b.Occurred_At__c).localeCompare(text(a.Occurred_At__c)));
  if(!messages.length)return deny('Conversation was not found');
  const scope=accountGrants(tenant,principal);
  const latestAssigned=messages.find(row=>text(row.Assigned_User__c));
  const conversation={tenantId:principal.tenantId,channelAccountId,
    assignedUserId:text(latestAssigned?.Assigned_User__c)||null};
  const operation:ChatterOperation=flowApiName==='CHATTER_SEND_MESSAGE'?'send':'assign';
  if(!canAccessChatterConversation(scope,conversation,operation))return deny('Conversation permission denied');
  if(operation==='assign'){
    const targetId=text(supplied.TargetUserId)||principal.userId;
    if(!users.some(user=>user.id===targetId&&user.tenantId===principal.tenantId&&!user.disabled))
      return deny('Assignment target is not an active tenant user');
    return {inputs:{ConversationId:conversationId,ChannelAccountId:channelAccountId,TargetUserId:targetId}};
  }
  const body=text(supplied.Body);
  if(!body||body.length>4096)return deny('Message must be between 1 and 4096 characters');
  if(text(supplied.RecipientPhone)!==recipient)return deny('Recipient does not match the conversation');
  const received=messages.find(row=>row.Direction__c==='Incoming' &&
    Number.isFinite(Date.parse(text(row.Occurred_At__c))) &&
    Date.now()-Date.parse(text(row.Occurred_At__c))<=24*60*60*1000 &&
    Date.now()>=Date.parse(text(row.Occurred_At__c)));
  if(!received)return deny('Outside the 24-hour service window; an approved template is required');
  const id=text(account.Named_Credential_Id__c);
  const credential=tenant.namedCredentials.find(row=>row.id===id&&row.protocol==='HTTPS'&&row.enabled!==false);
  if(!credential)return deny('Authorized channel credential is unavailable');
  try{
    const url=new URL(credential.baseUrl);
    const segments=url.pathname.split('/').filter(Boolean);
    if(url.protocol!=='https:'||url.hostname!=='graph.facebook.com'||url.search||url.hash||
       !/^v\d+\.\d+$/.test(segments[0]??'')||segments.length>3||
       (segments[1]&&segments[1]!==channelAccountId)||
       (segments[2]&&segments[2]!=='messages')) return deny('Channel credential is not bound to the verified Meta number');
  }catch{return deny('Invalid channel credential');}
  return {inputs:{ConversationId:conversationId,ChannelAccountId:channelAccountId,
    RecipientPhone:recipient,Body:body,CredentialId:id,
    PhoneNumberId:channelAccountId,SenderNumber:text(account.Display_Number__c),
    MessagePath:new URL(credential.baseUrl).pathname.split('/').filter(Boolean).length===1
      ? channelAccountId+'/messages'
      : new URL(credential.baseUrl).pathname.split('/').filter(Boolean).length===2?'messages':''}};
}
