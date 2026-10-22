import {randomUUID} from 'node:crypto';
import type {RecordEngine} from '../system-files/record-engine.js';
import type {SqlPersistence} from '../system-files/sql-persistence.js';

export type IntegrationCommunicationDetails={
 channel?:string;
 name?:string;
 sender?:string;
 recipient?:string;
 subject?:string;
 body?:string;
 externalMessageId?:string;
 provider?:string;
};

export type IntegrationApiLogInput={
 tenantId:string;
 direction:'Inbound'|'Outbound';
 transport?:'HTTP'|'Webhook';
 provider?:string;
 credentialId?:string|null;
 actorUserId?:string|null;
 endpoint:string;
 method:string;
 statusCode?:number|null;
 outcome:'success'|'http_error'|'network_error'|'rejected';
 durationMs?:number;
 requestBytes?:number;
 responseBytes?:number;
 errorCode?:string|null;
 /** Optional metadata-driven mapping for an actual message sent by this callout. */
 communication?:IntegrationCommunicationDetails;
};

export type IntegrationActivityWriter=(input:IntegrationApiLogInput)=>Promise<void>;

const clean=(value:unknown,max=500):string=>
 String(value??'').replace(/[\r\n\0]/g,' ').trim().slice(0,max);
const cleanBody=(value:unknown):string=>String(value??'').replace(/\0/g,'').slice(0,10000);
const allowedChannels=new Set(['Email','SMS','WhatsApp','Phone','WebChat','Push','Other']);

function normalized(input:IntegrationApiLogInput):IntegrationApiLogInput{
 const method=/^(GET|POST|PUT|PATCH|DELETE)$/.test(input.method.toUpperCase())
  ?input.method.toUpperCase():'OTHER';
 const endpoint=clean(input.endpoint.split(/[?#]/,1)[0],2048);
 const provider=clean(input.provider||'Unknown',120)||'Unknown';
 const errorCode=input.errorCode&&/^[A-Z0-9_:-]{1,100}$/i.test(input.errorCode)
  ?input.errorCode:null;
 return {...input,method,endpoint,provider,errorCode,
  durationMs:Math.max(0,Math.floor(input.durationMs??0)),
  requestBytes:Math.max(0,Math.floor(input.requestBytes??0)),
  responseBytes:Math.max(0,Math.floor(input.responseBytes??0))};
}

/** Every integration attempt becomes a tenant-scoped Communication record.
 * Payloads, headers, tokens, signatures and query strings are never logged by default.
 * Message-specific fields are populated only by an explicit metadata mapping on the
 * shared HTTP Callout node; no app-specific behavior lives in this logger.
 */
export function createIntegrationCommunicationWriter(
 db:SqlPersistence,records:RecordEngine
):IntegrationActivityWriter{
 return async(raw)=>{
  const input=normalized(raw);
  // This tenant-scoped service identity has explicit OneEngine grants. Never use
  // email-based bypasses or a cross-tenant/platform identity for system logging.
  const {rows}=await db.query<{user_id:string}>(
   'SELECT user_id FROM md_tenant_developer_accounts WHERE tenant_id=$1',[input.tenantId]);
  const systemUserId=rows[0]?.user_id;
  if(!systemUserId)throw new Error('Tenant integration logger identity unavailable');

  const details=input.communication??{};
  const now=new Date().toISOString();
  const status=input.outcome==='success'
   ?input.direction==='Inbound'?'Received':'Sent':'Failed';
  const endpoint=clean(input.endpoint,2048);
  const metadata={
   type:'IntegrationApiCall',transport:input.transport??'HTTP',endpoint,
   method:input.method,statusCode:input.statusCode??null,outcome:input.outcome,
   durationMs:input.durationMs??0,requestBytes:input.requestBytes??0,
   responseBytes:input.responseBytes??0,errorCode:input.errorCode??null,
   credentialId:input.credentialId??null,actorUserId:input.actorUserId??null,
   occurredAt:now
  };
  const body=details.body===undefined
   ?JSON.stringify(metadata).slice(0,10000):cleanBody(details.body);
  const subjectPrefix=details.subject?clean(details.subject,100)+' · ':'';
  const statusLabel=input.statusCode===undefined||input.statusCode===null
   ?'NO_RESPONSE':String(input.statusCode);
  const subject=clean(subjectPrefix+input.method+' '+statusLabel+' · '+input.outcome+
   ' · '+(input.durationMs??0)+'ms · req '+(input.requestBytes??0)+'B/resp '+
   (input.responseBytes??0)+'B · '+endpoint,500);

  await records.create(input.tenantId,systemUserId,'Communication',{
   Name:clean(details.name||input.direction+' API - '+input.provider,500),
   Channel:allowedChannels.has(String(details.channel))?details.channel:'Other',
   Direction:input.direction,Status:status,
   Sender:clean(details.sender||(input.direction==='Outbound'?'MetaDrive':input.provider),500),
   Recipient:clean(details.recipient||endpoint,500),Subject:subject,Body:body,
   ExternalMessageId:clean(details.externalMessageId||randomUUID(),500),
   Provider:clean(details.provider||input.provider,500),
   RelatedObject:'IntegrationApiCall',
   RelatedRecordId:input.credentialId??undefined,
   SentAt:input.direction==='Outbound'?now:undefined,
   ReceivedAt:input.direction==='Inbound'?now:undefined,
   ErrorMessage:input.outcome==='success'?undefined:clean(input.errorCode||input.outcome,2000)
  });
 };
}

/** Best-effort shared entrypoint. It never changes the remote provider's actual result. */
export async function writeIntegrationApiLog(
 _db:SqlPersistence,input:IntegrationApiLogInput,writer?:IntegrationActivityWriter
):Promise<void>{
 if(!writer)return;
 try{await writer(normalized(input));}
 catch(error){
  console.error('Integration Communication write failed',JSON.stringify({
   direction:input.direction,transport:input.transport??'HTTP',
   error:error instanceof Error?error.name:'UnknownError'
  }));
 }
}
