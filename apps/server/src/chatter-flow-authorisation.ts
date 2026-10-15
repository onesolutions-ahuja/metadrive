import { canAccessChatterRecord, chatterScopeForUser, isWhatsAppMessage, type ChatterGrantSource } from './chatter-authorisation.js';

type Credential = { id:string; protocol:string; enabled?:boolean; baseUrl:string;
  configuration?:Record<string,string>; name:string };
type User = { id:string; tenantId:string; disabled?:boolean };
type Context = { tenantId:string; userId:string; tenant:ChatterGrantSource;
  input:Record<string,unknown>; credentials:readonly Credential[]; users:readonly User[] };
export type ChatterFlowDecision =
  | {ok:true;input:Record<string,unknown>}
  | {ok:false;status:400|403|409|422;error:string};
const reject=(status:400|403|409|422,error:string):ChatterFlowDecision=>({ok:false,status,error});
const val=(x:unknown):string=>typeof x==='string'?x.trim():'';
const conversation = (input:Record<string,unknown>) => {
  try {
    const parsed=JSON.parse(val(input.ConversationId));
    if (!Array.isArray(parsed)||parsed.length!==2) return null;
    const [account,phone]=parsed;
    if (typeof account!=='string'||!account.trim()||typeof phone!=='string'||!/^\+?[1-9]\d{5,14}$/.test(phone)) return null;
    return {account:account.trim(),phone};
  } catch { return null; }
};
function secureCredential(credential:Credential, account:string):boolean {
  if (credential.protocol!=='HTTPS'||credential.enabled===false) return false;
  const config=credential.configuration??{};
  const configured=[config.PhoneNumberId,config.phone_number_id].filter(Boolean);
  if (configured.length && !configured.every(id=>id===account)) return false;
  try {
    const url=new URL(credential.baseUrl);
    const segments=url.pathname.split('/').filter(Boolean);
    return url.protocol==='https:'&&url.hostname==='graph.facebook.com'&&!url.username&&!url.password&&!url.search&&!url.hash
      &&!url.port&&/^v\d+\.\d+$/.test(segments[0]??'')
      &&segments[1]===account&&(segments.length===2||(segments.length===3&&segments[2]==='messages'));
  } catch { return false; }
}
export function authoriseChatterFlow(apiName:string,context:Context):ChatterFlowDecision|null {
  const operation=apiName==='CHATTER_SEND_MESSAGE'?'send'
    :apiName==='CHATTER_ASSIGN_CONVERSATION'?'assign':null;
  if (!operation) return null;
  const key=conversation(context.input);
  if (!key || val(context.input.ChannelAccountId)!==key.account) return reject(400,'Invalid conversation reference');
  const records=context.tenant.records.Communication_Records__c??[];
  const same=records.filter(row => {
    if (!isWhatsAppMessage(row)||val(row.Channel_Account__c)!==key.account) return false;
    return val(row.Direction__c).toLowerCase()==='incoming'
      ? val(row.From_Number__c)===key.phone : val(row.To_Number__c)===key.phone;
  }).sort((a,b)=>val(b.Occurred_At__c||b.CreatedDate).localeCompare(val(a.Occurred_At__c||a.CreatedDate)));
  const latest=same[0];
  if (!latest || !canAccessChatterRecord(context.tenantId,context.userId,context.tenant,latest,operation)) {
    return reject(403,'Conversation or channel permission denied');
  }
  const trusted={...context.input,ChannelAccountId:key.account,RecipientPhone:key.phone,
    TargetRecordId:val(latest.Id)};
  if (operation==='assign') {
    const assignee=val(context.input.AssigneeId);
    const user=context.users.find(item=>item.id===assignee&&item.tenantId===context.tenantId&&!item.disabled);
    const grant=user?chatterScopeForUser(context.tenantId,assignee,context.tenant).grants.find(item=>
      item.channelAccountId===key.account&&item.canRead):undefined;
    if (!user||!grant) return reject(403,'Assignee must have channel read permission');
    return {ok:true,input:{...trusted,AssigneeId:assignee}};
  }
  const body=val(context.input.Body);
  if (!body||body.length>4096||body.includes('\0'))return reject(400,'Invalid message body');
  const lastInbound=same.find(row=>val(row.Direction__c).toLowerCase()==='incoming');
  const lastAt=Date.parse(val(lastInbound?.Occurred_At__c||lastInbound?.CreatedDate));
  if (!Number.isFinite(lastAt)||lastAt>Date.now()+60000||Date.now()-lastAt>=24*60*60*1000) {
    return reject(422,'Outside the 24-hour WhatsApp service window; use an approved template');
  }
  const candidates=context.credentials.filter(item=>secureCredential(item,key.account));
  if(candidates.length!==1)return reject(409,'Exactly one enabled Meta Named Credential must match this account');
  return {ok:true,input:{...trusted,Body:body,
    SenderPhone:val(lastInbound?.To_Number__c)||val(latest.From_Number__c),
    AssignedUserId:val(latest.Assigned_User__c)||context.userId,
    AuthorisedCredentialId:candidates[0].id}};
}
