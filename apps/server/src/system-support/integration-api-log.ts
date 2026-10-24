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
 /** Preserve message relationships when one Communication also represents an API attempt. */
 relatedObject?:string;
 relatedRecordId?:string;
 conversationId?:string;
 receivedAt?:string;
 sentAt?:string;
};

export type IntegrationActivityInput={
 tenantId:string;
 direction:'Inbound'|'Outbound';
 transport?:'HTTP'|'Webhook'|'SMTP';
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
 occurredAt?:string;
 /** Optional metadata-driven mapping for an actual message sent by this callout. */
 communication?:IntegrationCommunicationDetails;
};

export type IntegrationActivityWriter=(input:IntegrationActivityInput)=>Promise<void>;

const clean=(value:unknown,max=500):string=>
 String(value??'').replace(/[\r\n\0]/g,' ').trim().slice(0,max);
const cleanBody=(value:unknown):string=>String(value??'').replace(/\0/g,'').slice(0,10000);
const allowedChannels=new Set(['Email','SMS','WhatsApp','Phone','WebChat','Push','Other']);

function normalized(input:IntegrationActivityInput):IntegrationActivityInput{
 const method=/^(GET|POST|PUT|PATCH|DELETE|SMTP)$/.test(input.method.toUpperCase())
  ?input.method.toUpperCase():'OTHER';
 const endpoint=clean(input.endpoint.split(/[?#]/,1)[0],2048);
 const provider=clean(input.provider||'Unknown',120)||'Unknown';
 const statusCode=Number.isInteger(input.statusCode)&&Number(input.statusCode)>=100
  &&Number(input.statusCode)<=599?Number(input.statusCode):null;
 const errorCode=input.errorCode&&/^[A-Z0-9_:-]{1,100}$/i.test(input.errorCode)
  ?input.errorCode:null;
 return {...input,method,endpoint,provider,errorCode,
  statusCode,durationMs:Math.min(2147483647,Math.max(0,Math.floor(input.durationMs??0))),
  requestBytes:Math.min(2147483647,Math.max(0,Math.floor(input.requestBytes??0))),
  responseBytes:Math.min(2147483647,Math.max(0,Math.floor(input.responseBytes??0)))};
}

/** Every external integration attempt becomes a tenant-scoped Communication record.
 * Payloads, headers, tokens, signatures and query strings are never logged by default.
 * Message-specific fields require an explicit caller mapping; no app-specific behavior
 * lives in this logger.
 */
export function createIntegrationCommunicationWriter(
 db:SqlPersistence,records:RecordEngine
):IntegrationActivityWriter{
 return async(raw)=>{
  const input=normalized(raw);
  // Never impersonate developer@tenant. It is deliberately disabled until
  // activation and SQL OneEngine RBAC rejects disabled users.
  // The tenant-scoped, permanently login-locked writer has *only* Communication
  // create permissions granted through the standard OneEngine policy.
  const {rows}=await db.query<{user_id:string}>(`
   SELECT a.user_id FROM md_communication_logger_accounts a
   JOIN md_users u ON u.tenant_id=a.tenant_id AND u.id=a.user_id
   WHERE a.tenant_id=$1 AND u.enabled=true`,[input.tenantId]);
  const systemUserId=rows[0]?.user_id;
  if(!systemUserId)throw new Error('Tenant Communication writer identity unavailable');

  const details=input.communication??{};
  const now=input.occurredAt??new Date().toISOString();
  const status=input.outcome==='success'
   ?input.direction==='Inbound'?'Received':'Sent':'Failed';
  // normalized() strips query strings and fragments. Use only this sanitised value
  // in every displayed/logged field; never rebuild a subject from the raw endpoint.
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

  const record:Record<string,unknown>={
   OwnerId:input.actorUserId||systemUserId,
   Name:clean(details.name||input.direction+' API - '+input.provider,500),
   Channel:allowedChannels.has(String(details.channel))?details.channel:'Other',
   Direction:input.direction,Status:status,
   Sender:clean(details.sender||(input.direction==='Outbound'?'MetaDrive':input.provider),500),
   Recipient:clean(details.recipient||endpoint,500),Subject:subject,Body:body,
   ExternalMessageId:clean(details.externalMessageId||randomUUID(),500),
   Provider:clean(details.provider||input.provider,500),
   RelatedObject:clean(details.relatedObject||'IntegrationApiCall',120),
   RelatedRecordId:details.relatedRecordId??input.credentialId??undefined,
   ConversationId:details.conversationId,
   SentAt:details.sentAt??(input.direction==='Outbound'&&input.outcome==='success'?now:undefined),
   ReceivedAt:details.receivedAt??(input.direction==='Inbound'&&input.outcome==='success'?now:undefined),
   ErrorMessage:input.outcome==='success'?undefined:clean(input.errorCode||input.outcome,2000)
  };
  // RecordEngine treats a supplied undefined field as invalid input.
  // Omitted optional fields are not the same as explicit null values.
  await records.create(input.tenantId,systemUserId,'Communication',
   Object.fromEntries(Object.entries(record).filter(([,value])=>value!==undefined)));
 };
}

type IntegrationOutboxRow={
 tenant_id:string;id:string;direction:IntegrationActivityInput['direction'];
 transport:NonNullable<IntegrationActivityInput['transport']>;provider:string;
 credential_id:string|null;actor_user_id:string|null;endpoint:string;method:string;
 status_code:number|null;outcome:IntegrationActivityInput['outcome'];duration_ms:number;
 request_bytes:number;response_bytes:number;error_code:string|null;channel:string;
 name:string;sender:string;recipient:string;subject:string|null;body:string|null;
 external_message_id:string;related_object:string;related_record_id:string|null;
 conversation_id:string|null;received_at:Date|string|null;sent_at:Date|string|null;
 occurred_at:Date|string;attempt_count:number
};

/** Durable handoff to the Communication Object. Failed record writes stay queued for worker retry. */
export class IntegrationCommunicationOutbox{
 constructor(private readonly db:SqlPersistence,private readonly writer:IntegrationActivityWriter){}

 readonly write:IntegrationActivityWriter=async(raw)=>{
  const input=normalized(raw),id=randomUUID(),occurredAt=input.occurredAt??new Date().toISOString();
  const details=input.communication??{};
  const communication={
   channel:allowedChannels.has(String(details.channel))?String(details.channel):'Other',
   name:clean(details.name||input.direction+' API - '+input.provider,500),
   sender:clean(details.sender||(input.direction==='Outbound'?'MetaDrive':input.provider),500),
   recipient:clean(details.recipient||input.endpoint,500),
   subject:details.subject===undefined?null:clean(details.subject,500),
   body:details.body===undefined?null:cleanBody(details.body),
   externalMessageId:clean(details.externalMessageId||id,500),
   provider:clean(details.provider||input.provider,500),
   relatedObject:clean(details.relatedObject||'IntegrationApiCall',120),
   relatedRecordId:details.relatedRecordId??input.credentialId??null,
   conversationId:details.conversationId===undefined?null:clean(details.conversationId,500),
   receivedAt:details.receivedAt??null,sentAt:details.sentAt??null
  };
  await this.db.query(`INSERT INTO md_communication_delivery_outbox
   (tenant_id,id,direction,transport,provider,credential_id,actor_user_id,endpoint,method,
    status_code,outcome,duration_ms,request_bytes,response_bytes,error_code,channel,name,
    sender,recipient,subject,body,external_message_id,related_object,related_record_id,
    conversation_id,received_at,sent_at,occurred_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
    $21,$22,$23,$24,$25,$26::timestamptz,$27::timestamptz,$28::timestamptz)`,
   [input.tenantId,id,input.direction,input.transport??'HTTP',input.provider,
    input.credentialId??null,input.actorUserId??null,input.endpoint,input.method,
    input.statusCode,input.outcome,input.durationMs,input.requestBytes,input.responseBytes,
    input.errorCode,communication.channel,communication.name,communication.sender,
    communication.recipient,communication.subject,communication.body,
    communication.externalMessageId,communication.relatedObject,communication.relatedRecordId,
    communication.conversationId,communication.receivedAt,communication.sentAt,occurredAt]);
  await this.dispatchById(id);
 };

 async dispatchOne():Promise<boolean>{
  const row=await this.claim();
  if(!row)return false;
  await this.deliver(row);
  return true;
 }

 private async dispatchById(id:string):Promise<void>{
  const row=await this.claim(id);
  if(row)await this.deliver(row);
 }

 private async claim(id?:string):Promise<IntegrationOutboxRow|undefined>{
  const {rows}=await this.db.query<IntegrationOutboxRow>(`
   WITH candidate AS(
    SELECT tenant_id,id FROM md_communication_delivery_outbox
    WHERE ($1::uuid IS NULL OR id=$1)
     AND ((status='pending' AND next_attempt_at<=now())
       OR (status='processing' AND claimed_at<now()-interval '5 minutes'))
    ORDER BY next_attempt_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
   )
   UPDATE md_communication_delivery_outbox o
   SET status='processing',attempt_count=o.attempt_count+1,claimed_at=now()
   FROM candidate c WHERE o.tenant_id=c.tenant_id AND o.id=c.id
   RETURNING o.*`,[id??null]);
  return rows[0];
 }

 private async deliver(row:IntegrationOutboxRow):Promise<void>{
  try{
   const {rows:existing}=await this.db.query<{id:string}>(`
    SELECT r.id FROM md_records r
    JOIN md_record_values v ON v.tenant_id=r.tenant_id AND v.record_id=r.id
     AND v.object_api=r.object_api AND v.field_api='ExternalMessageId'
    WHERE r.tenant_id=$1 AND r.object_api='Communication' AND r.is_deleted=false
     AND v.value_text=$2 LIMIT 1`,[row.tenant_id,row.external_message_id]);
   if(!existing[0]){
    await this.writer({
     tenantId:row.tenant_id,direction:row.direction,transport:row.transport,
     provider:row.provider,credentialId:row.credential_id,actorUserId:row.actor_user_id,
     endpoint:row.endpoint,method:row.method,statusCode:row.status_code,
     outcome:row.outcome,durationMs:row.duration_ms,requestBytes:row.request_bytes,
     responseBytes:row.response_bytes,errorCode:row.error_code,
     occurredAt:new Date(row.occurred_at).toISOString(),
     communication:{channel:row.channel,name:row.name,sender:row.sender,
      recipient:row.recipient,subject:row.subject??undefined,body:row.body??undefined,
      externalMessageId:row.external_message_id,provider:row.provider,
      relatedObject:row.related_object,relatedRecordId:row.related_record_id??undefined,
      conversationId:row.conversation_id??undefined,
      receivedAt:row.received_at?new Date(row.received_at).toISOString():undefined,
      sentAt:row.sent_at?new Date(row.sent_at).toISOString():undefined}
    });
   }
   await this.db.query(`DELETE FROM md_communication_delivery_outbox
    WHERE tenant_id=$1 AND id=$2 AND status='processing'`,[row.tenant_id,row.id]);
  }catch(error){
   const errorCode=error instanceof Error?error.name:'UnknownError';
   await this.db.query(`UPDATE md_communication_delivery_outbox
    SET status='pending',claimed_at=NULL,last_error=$3,
     next_attempt_at=now()+(LEAST(3600,power(2,LEAST(attempt_count,12))::integer)
       * interval '1 second')
    WHERE tenant_id=$1 AND id=$2 AND status='processing'`,
    [row.tenant_id,row.id,errorCode]);
   console.error('Integration Communication outbox delivery deferred',JSON.stringify({
    transport:row.transport,attempt:row.attempt_count,error:errorCode
   }));
  }
 }
}

/** Best-effort audit writer: logging failure must never change the external provider result.
 * Failures remain visible in sanitized server diagnostics for alerting and recovery.
 */
export async function writeIntegrationActivity(
 _db:SqlPersistence,input:IntegrationActivityInput,writer?:IntegrationActivityWriter
):Promise<void>{
 if(!writer){
  console.error('Integration Communication write failed',JSON.stringify({
   direction:input.direction,transport:input.transport??'HTTP',error:'WriterNotConfigured'
  }));
  return;
 }
 try{
  await writer(normalized(input));
 }catch(error){
  // Do not include endpoint, credentials, request data, or provider error text in diagnostics.
  console.error('Integration Communication write failed',JSON.stringify({
   direction:input.direction,transport:input.transport??'HTTP',
   error:error instanceof Error?error.name:'UnknownError'
  }));
 }
}
