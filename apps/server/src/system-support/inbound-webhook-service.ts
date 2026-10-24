import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
import type {FlowRuntime} from '../system-files/flow-runtime.js';
import type {RecordEngine} from '../system-files/record-engine.js';
import type {NamedCredentialService} from './named-credential-service.js';
import {writeIntegrationActivity,type IntegrationActivityWriter} from './integration-api-log.js';

type Actor={tenant_id:string;user_id:string};
type Authenticated=Request & {actor?:Actor;rawWebhookBody?:Buffer};
type Endpoint={tenant_id:string;id:string;api_name:string;flow_api:string|null;
 execution_user_id:string|null;created_by:string;credential_name:string|null;
 channel_id:string|null;channel_name:string|null;
 verify_token_digest:Buffer;signature_secret_ciphertext:Buffer;
 encryption_key_id:string;enabled:boolean;app_api:string|null;provider:string};
const identifier=/^[A-Za-z][A-Za-z0-9_]*$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
const handler=(fn:(req:Authenticated,res:Response)=>Promise<void>)=>
 (req:Request,res:Response,next:NextFunction)=>{
  void fn(req as Authenticated,res).catch(next);
 };
const digest=(value:string)=>createHash('sha256').update(value).digest();
const matches=(expected:Buffer,actual:Buffer)=>expected.length===actual.length&&timingSafeEqual(expected,actual);
/** Only non-sensitive transaction content is copied to the browser-visible Communication Object. */
function safePayload(value:unknown,depth=0):unknown {
 if(depth>7)return '[depth limit]';
 if(Array.isArray(value))return value.slice(0,100).map(item=>safePayload(item,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(
  Object.entries(value).slice(0,100).map(([key,item])=>[
   key,/(?:secret|token|password|authorization|credential|signature|cookie|api[_-]?key|private[_-]?key)/i.test(key)
    ?'[redacted]':safePayload(item,depth+1)]));
 return typeof value==='string'?value.slice(0,2000):value;
}
/** Convert Meta's WhatsApp envelope into one Communication record per real inbound message. */
function whatsappMessages(payload:unknown,endpointId:string):Array<Record<string,unknown>> {
 if(!payload||typeof payload!=='object')return [];
 const root=payload as Record<string,unknown>;
 if(root.object!=='whatsapp_business_account'||!Array.isArray(root.entry))return [];
 const result:Array<Record<string,unknown>>=[];
 const now=new Date().toISOString();
 for(const rawEntry of root.entry){
  if(!rawEntry||typeof rawEntry!=='object')continue;
  const entry=rawEntry as Record<string,unknown>;
  if(!Array.isArray(entry.changes))continue;
  for(const rawChange of entry.changes){
   if(!rawChange||typeof rawChange!=='object')continue;
   const change=rawChange as Record<string,unknown>;
   if(!change.value||typeof change.value!=='object')continue;
   const value=change.value as Record<string,unknown>;
   const metadata=(value.metadata&&typeof value.metadata==='object'?value.metadata:{}) as Record<string,unknown>;
   const contacts=Array.isArray(value.contacts)?value.contacts:[];
   const contactByWaId=new Map<string,string>();
   for(const rawContact of contacts){
    if(!rawContact||typeof rawContact!=='object')continue;
    const contact=rawContact as Record<string,unknown>;
    const profile=(contact.profile&&typeof contact.profile==='object'?contact.profile:{}) as Record<string,unknown>;
    if(typeof contact.wa_id==='string'&&typeof profile.name==='string')contactByWaId.set(contact.wa_id,profile.name);
   }
   if(!Array.isArray(value.messages))continue;
   for(const rawMessage of value.messages){
    if(!rawMessage||typeof rawMessage!=='object')continue;
    const message=rawMessage as Record<string,unknown>;
    const messageId=typeof message.id==='string'?message.id:'';
    const sender=typeof message.from==='string'?message.from:'';
    const type=typeof message.type==='string'?message.type:'message';
    const details=(message[type]&&typeof message[type]==='object'?message[type]:{}) as Record<string,unknown>;
    let body:string;
    if(type==='text'&&typeof details.body==='string')body=details.body;
    else if(['image','video','document'].includes(type)&&typeof details.caption==='string')body=details.caption;
    else if(type==='interactive'){
     const button=(details.button_reply&&typeof details.button_reply==='object'?details.button_reply:{}) as Record<string,unknown>;
     const list=(details.list_reply&&typeof details.list_reply==='object'?details.list_reply:{}) as Record<string,unknown>;
     body=String(button.title??list.title??'WhatsApp interactive reply');
    }else if(type==='button')body=String(details.text??'WhatsApp button reply');
    else if(type==='location')body=[details.name,details.address,details.latitude,details.longitude].filter(x=>x!==undefined&&x!==null&&x!=='').join(', ')||'WhatsApp location';
    else if(type==='contacts')body='WhatsApp contact card';
    else body='WhatsApp '+type+' message';
    const unix=typeof message.timestamp==='string'?Number(message.timestamp):NaN;
    const receivedAt=Number.isFinite(unix)&&unix>0?new Date(unix*1000).toISOString():now;
    result.push({
     Name:'WhatsApp '+(messageId?messageId.slice(-24):'inbound message'),
     Channel:'WhatsApp',Direction:'Inbound',Status:'Received',
     Sender:sender?(contactByWaId.has(sender)?contactByWaId.get(sender)+' ('+sender+')':sender):'',
     Recipient:String(metadata.display_phone_number??metadata.phone_number_id??''),
     Provider:'WhatsApp',Body:body.slice(0,10000),
     ExternalMessageId:messageId||undefined,ConversationId:sender||undefined,
     ReceivedAt:receivedAt,RelatedObject:'InboundWebhookEndpoint',RelatedRecordId:endpointId
    });
   }
  }
 }
 return result;
}

/** Idempotency guard for provider messages when an earlier multi-message webhook partially failed. */
async function hasInboundMessage(db:SqlPersistence,tenantId:string,externalMessageId:string):Promise<boolean>{
 const {rows}=await db.query<{id:string}>(
  `SELECT r.id FROM md_records r
   JOIN md_record_values message_id ON message_id.tenant_id=r.tenant_id
    AND message_id.record_id=r.id AND message_id.object_api=r.object_api
    AND message_id.field_api='ExternalMessageId'
   JOIN md_record_values related ON related.tenant_id=r.tenant_id
    AND related.record_id=r.id AND related.object_api=r.object_api
    AND related.field_api='RelatedObject'
   WHERE r.tenant_id=$1 AND r.object_api='Communication' AND r.is_deleted=false
    AND message_id.value_text=$2 AND related.value_text='InboundWebhookEndpoint'
   LIMIT 1`,[tenantId,externalMessageId]);
 return rows.length>0;
}

function publicUrl(req:Request,id:string){
 // Provider callbacks must be externally reachable over TLS. Render terminates TLS
 // at its edge, so Express may see the internal HTTP hop unless proxy trust is
 // explicitly configured. Never publish an HTTP callback URL to Meta.
 return 'https://'+req.get('host')+'/api/inbound-webhooks/'+encodeURIComponent(id);
}
export function registerInboundWebhookPublicRoutes(app:Express,db:SqlPersistence,
 vault:NamedCredentialService,flows:FlowRuntime,rbac:RbacEngine,records?:RecordEngine,
 activityWriter?:IntegrationActivityWriter){
 const load=async(id:string):Promise<Endpoint|undefined>=>{
  if(!uuid.test(id))return undefined;
  const {rows}=await db.query<Endpoint>(`
   SELECT w.*,a.api_name AS app_api,c.name AS credential_name,
    (SELECT p.properties->>'channelId'
     FROM md_connector_app_credentials binding
     JOIN md_apps ca ON ca.id=binding.app_id AND ca.tenant_owner_id IS NULL
     JOIN md_app_installations installed ON installed.tenant_id=binding.tenant_id
       AND installed.app_id=binding.app_id
     JOIN md_system_definitions p ON p.tenant_id=binding.tenant_id
       AND p.kind='connector-providers' AND p.api_name=ca.api_name AND p.enabled=true
     WHERE binding.tenant_id=w.tenant_id AND binding.credential_id=w.credential_id
     LIMIT 1) AS channel_id,
    (SELECT p.properties->>'communicationChannel'
     FROM md_connector_app_credentials binding
     JOIN md_apps ca ON ca.id=binding.app_id AND ca.tenant_owner_id IS NULL
     JOIN md_app_installations installed ON installed.tenant_id=binding.tenant_id
       AND installed.app_id=binding.app_id
     JOIN md_system_definitions p ON p.tenant_id=binding.tenant_id
       AND p.kind='connector-providers' AND p.api_name=ca.api_name AND p.enabled=true
     WHERE binding.tenant_id=w.tenant_id AND binding.credential_id=w.credential_id
     LIMIT 1) AS channel_name
   FROM md_inbound_webhook_endpoints w
   LEFT JOIN md_apps a ON a.id=w.app_id AND a.enabled=true
   LEFT JOIN md_named_credentials c ON c.tenant_id=w.tenant_id AND c.id=w.credential_id
   WHERE w.id=$1 AND w.enabled=true
     AND (w.credential_id IS NULL OR (c.id IS NOT NULL AND c.enabled=true))
     AND (w.app_id IS NULL OR (a.id IS NOT NULL AND EXISTS (
       SELECT 1 FROM md_app_installations i WHERE i.tenant_id=w.tenant_id AND i.app_id=w.app_id
     ) AND EXISTS (
       SELECT 1 FROM md_app_entitlements e WHERE e.tenant_id=w.tenant_id
         AND e.app_id=w.app_id AND e.active=true
         AND (e.expires_at IS NULL OR e.expires_at>now())
     ))) LIMIT 1`,[id]);
  return rows[0];
 };
 app.get('/api/inbound-webhooks/:id',handler(async(req,res)=>{
  const requestStartedAt=Date.now();
  res.setHeader('Cache-Control','no-store');
  const endpoint=await load(req.params.id);
  const mode=req.query['hub.mode'],token=req.query['hub.verify_token'];
  const challenge=req.query['hub.challenge'];
  const valid=Boolean(endpoint&&['Meta','HmacSha256'].includes(endpoint.provider)
   &&mode==='subscribe'&&typeof token==='string'&&token.length<=512
   &&typeof challenge==='string'&&challenge.length<=1024
   &&matches(endpoint.verify_token_digest,digest(token)));
  if(endpoint)await writeIntegrationActivity(db,{
   tenantId:endpoint.tenant_id,direction:'Inbound',transport:'Webhook',
   provider:endpoint.channel_id??endpoint.credential_name??endpoint.provider,
   actorUserId:endpoint.execution_user_id??endpoint.created_by,
   endpoint:'/api/inbound-webhooks/'+endpoint.api_name,method:'GET',statusCode:valid?200:403,outcome:valid?'success':'rejected',
   durationMs:Date.now()-requestStartedAt,responseBytes:valid?Buffer.byteLength(String(challenge)):0,
   errorCode:valid?null:'VERIFY_TOKEN_REJECTED'
  },activityWriter);
  if(!valid){res.status(403).type('text/plain').send('Forbidden');return;}
  res.status(200).type('text/plain').send(challenge as string);
 }));
 app.post('/api/inbound-webhooks/:id',handler(async(req,res)=>{
  const requestStartedAt=Date.now();
  res.setHeader('Cache-Control','no-store');
  const endpoint=await load(req.params.id);
  const signature=req.get('x-hub-signature-256');
  const raw=req.rawWebhookBody;
  const logInbound=async(statusCode:number,outcome:'success'|'http_error'|'network_error'|'rejected',
   errorCode?:string)=>{
   if(!endpoint)return;
   await writeIntegrationActivity(db,{
    tenantId:endpoint.tenant_id,direction:'Inbound',transport:'Webhook',
    provider:endpoint.channel_id??endpoint.credential_name??endpoint.provider,
    actorUserId:endpoint.execution_user_id??endpoint.created_by,
    endpoint:'/api/inbound-webhooks/'+endpoint.api_name,method:'POST',statusCode,outcome,durationMs:Date.now()-requestStartedAt,
    requestBytes:raw?.length??0,errorCode:errorCode??null,
    communication:{channel:endpoint.channel_name??'Other',
     provider:endpoint.channel_id??endpoint.credential_name??endpoint.provider}
   },activityWriter);
  };
  const reject=async(reason:string,rawBodyBytes?:number)=>{
   // Log only a bounded reason code and body length; never log signature, body, or secret.
   console.warn('Inbound webhook rejected',JSON.stringify({
    endpointId:req.params.id,reason,...(rawBodyBytes===undefined?{}:{rawBodyBytes})
   }));
   await logInbound(401,'rejected',reason.toUpperCase());
   res.status(401).json({error:'Webhook signature invalid'});
  };
  if(!endpoint){await reject('endpoint_unavailable');return;}
  if(!raw){await reject('raw_body_unavailable');return;}
  if(raw.length>262144){await reject('body_too_large',raw.length);return;}
  if(!signature){await reject('signature_missing',raw.length);return;}
  if(!/^sha256=[a-f0-9]{64}$/i.test(signature)){
   await reject('signature_format_invalid',raw.length);return;
  }
  const secret=vault.decryptOpaque(endpoint.signature_secret_ciphertext,endpoint.encryption_key_id);
  const signatureDigest=createHmac('sha256',secret).update(raw).digest();
  const supplied=Buffer.from(signature.slice(7),'hex');
  if(!matches(signatureDigest,supplied)){
   await reject('signature_mismatch',raw.length);return;
  }
  // Credential-linked webhooks are ingestion endpoints: persist Communication directly.
  // AceChatter reads Communication through its authorised Flows; it is not a webhook consumer.
  let flowAvailable=Boolean(endpoint.flow_api&&!endpoint.credential_name);
  if(flowAvailable&&endpoint.flow_api){
   const {rows:active}=await db.query(`
     SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2
       AND active=true AND archived=false AND flow_type='Autolaunched Flow' LIMIT 1`,
     [endpoint.tenant_id,endpoint.flow_api]);
   if(!endpoint.execution_user_id||!active[0]||!await rbac.allowed(
      endpoint.tenant_id,endpoint.execution_user_id,'Flow:'+endpoint.flow_api,'execute')){
    await logInbound(503,'http_error','FLOW_UNAVAILABLE');
    res.status(503).json({error:'Webhook Flow not available'});return;
   }
  }
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)){
   await logInbound(400,'rejected','INVALID_PAYLOAD');
   res.status(400).json({error:'Invalid webhook payload'});return;
  }
  const payloadHash=createHash('sha256').update(raw).digest('hex');
  const {rows:events}=await db.query<{id:string;status:string}>(`
   INSERT INTO md_inbound_webhook_events(tenant_id,endpoint_id,payload,payload_hash)
   VALUES($1,$2,$3::jsonb,$4)
   ON CONFLICT(tenant_id,endpoint_id,payload_hash) DO UPDATE
     SET status=CASE WHEN md_inbound_webhook_events.status='failed' THEN 'received'
                     ELSE md_inbound_webhook_events.status END
   RETURNING id,status`,
   [endpoint.tenant_id,endpoint.id,JSON.stringify(req.body),payloadHash]);
  const event=events[0];
  if(!event){await logInbound(503,'http_error','EVENT_WRITE_FAILED');res.status(503).json({error:'Unable to accept webhook'});return;}
  if(event.status==='completed'){await logInbound(200,'success');res.status(200).json({received:true});return;}
  // The event payload is retained in tenant SQL. A compact scalar copy is sent
  // only when the Flow input contract can accept it (max 4096 characters).
  const json=raw.toString('utf8');
  let requestCommunicationRecorded=false;
  try{
   // Save the provider message before any optional legacy Flow work. A credential
   // webhook never executes AceChatterReceiveWebhook or any other app Flow.
   if(endpoint.credential_name){
    if(!records&&!activityWriter)throw new Error('Communication record engine unavailable');
    const messages=whatsappMessages(req.body,endpoint.id);
    let writtenMessages=0;
    for(const values of messages){
     const externalMessageId=typeof values.ExternalMessageId==='string'?values.ExternalMessageId:'';
     if(externalMessageId&&await hasInboundMessage(db,endpoint.tenant_id,externalMessageId))continue;
     if(activityWriter){
      // The one Communication record carries both the real inbound message and this
      // webhook attempt's result/latency/byte counts; do not emit a second API row.
      await activityWriter({
       tenantId:endpoint.tenant_id,direction:'Inbound',transport:'Webhook',
       provider:endpoint.channel_id??endpoint.credential_name??endpoint.provider,
       actorUserId:endpoint.execution_user_id??endpoint.created_by,
       endpoint:'/api/inbound-webhooks/'+endpoint.api_name,method:'POST',
       statusCode:200,outcome:'success',durationMs:Date.now()-requestStartedAt,
       requestBytes:raw.length,responseBytes:Buffer.byteLength('{"received":true}'),
       communication:{
        channel:String(values.Channel??'WhatsApp'),name:String(values.Name??'WhatsApp inbound'),
        sender:String(values.Sender??''),recipient:String(values.Recipient??''),
        body:String(values.Body??''),provider:endpoint.channel_id??String(values.Provider??endpoint.provider),
        externalMessageId:externalMessageId||undefined,
        relatedObject:'InboundWebhookEndpoint',relatedRecordId:endpoint.id,
        conversationId:typeof values.ConversationId==='string'?values.ConversationId:undefined,
        receivedAt:typeof values.ReceivedAt==='string'?values.ReceivedAt:undefined
       }
      });
     }else{
      await records!.create(endpoint.tenant_id,endpoint.execution_user_id??endpoint.created_by,
       'Communication',values);
     }
     writtenMessages++;
    }
    requestCommunicationRecorded=writtenMessages>0;
    // Non-message callbacks (for example delivery-status notifications) are retained
    // in the webhook event archive and receive a generic API activity Communication.
   }else if(flowAvailable&&endpoint.flow_api&&endpoint.execution_user_id){
    const json=raw.toString('utf8');
    await flows.execute(endpoint.tenant_id,endpoint.flow_api,endpoint.execution_user_id,{
     requestId:event.id,webhookEventId:event.id,webhookPayloadJson:json.length<=4096?json:'',
     webhookEndpoint:endpoint.api_name
    });
   }else{
    if(!records)throw new Error('Communication record engine unavailable');
    const sanitized=JSON.stringify(safePayload(req.body)).slice(0,10000);
    await records.create(endpoint.tenant_id,endpoint.execution_user_id??endpoint.created_by,
     'Communication',{
      Name:'Webhook '+endpoint.api_name,Channel:'Other',Direction:'Inbound',Status:'Received',
      Provider:endpoint.provider,Body:sanitized,ReceivedAt:new Date().toISOString(),
      ExternalMessageId:event.id,RelatedObject:'InboundWebhookEvent',RelatedRecordId:event.id
     });
    requestCommunicationRecorded=true;
   }
   await db.query(`UPDATE md_inbound_webhook_events SET status='completed',
     processed_at=now(),error_code=NULL WHERE tenant_id=$1 AND id=$2`,
    [endpoint.tenant_id,event.id]);
   if(!requestCommunicationRecorded)await logInbound(200,'success');
  res.status(200).json({received:true});
  }catch(error){
   await db.query(`UPDATE md_inbound_webhook_events SET status='failed',
     processed_at=now(),error_code=$3 WHERE tenant_id=$1 AND id=$2`,
    [endpoint.tenant_id,event.id,flowAvailable?'FLOW_EXECUTION_FAILED':'COMMUNICATION_WRITE_FAILED']);
   await logInbound(503,'http_error',flowAvailable?'FLOW_EXECUTION_FAILED':'COMMUNICATION_WRITE_FAILED');
   res.status(503).json({error:'Webhook processing unavailable'});
  }
 }));
}

export function registerInboundWebhookAdminRoutes(app:Express,db:SqlPersistence,
 vault:NamedCredentialService,rbac:RbacEngine){
 app.get('/api/metadata/inbound-webhooks/options',handler(async(req,res)=>{
  const actor=req.actor!;
  await rbac.require(actor.tenant_id,actor.user_id,'WebhookSubscription','manage');
  const [apps,flows,users]=await Promise.all([
   db.query<{api_name:string}>(`SELECT a.api_name FROM md_apps a
     JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=$1
     JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=$1 AND e.active=true
     WHERE a.enabled=true AND (e.expires_at IS NULL OR e.expires_at>now())
     ORDER BY a.api_name`,[actor.tenant_id]),
   db.query<{api_name:string}>(`SELECT DISTINCT api_name FROM md_flow_definitions
      WHERE tenant_id=$1 AND active=true AND archived=false
        AND flow_type='Autolaunched Flow' ORDER BY api_name`,[actor.tenant_id]),
   db.query<{id:string;email:string}>(`SELECT id,email FROM md_users
      WHERE tenant_id=$1 ORDER BY email LIMIT 500`,[actor.tenant_id])
  ]);
  res.json({apps:apps.rows.map(a=>a.api_name),flows:flows.rows.map(f=>f.api_name),
    users:users.rows});
 }));
 app.get('/api/metadata/inbound-webhooks',handler(async(req,res)=>{
  const actor=req.actor!;
  await rbac.require(actor.tenant_id,actor.user_id,'WebhookSubscription','read');
  const {rows}=await db.query(`
   SELECT w.id,w.api_name AS "apiName",COALESCE(a.api_name,c.name) AS "appApiName",
    w.flow_api AS "flowApi",w.execution_user_id AS "executionUserId",
    w.enabled,w.provider,w.created_at AS "createdAt",
    (SELECT count(*)::int FROM md_inbound_webhook_events e
      WHERE e.tenant_id=w.tenant_id AND e.endpoint_id=w.id) AS "eventCount"
   FROM md_inbound_webhook_endpoints w
   LEFT JOIN md_apps a ON a.id=w.app_id
   LEFT JOIN md_named_credentials c ON c.tenant_id=w.tenant_id AND c.id=w.credential_id
   WHERE w.tenant_id=$1 ORDER BY w.api_name`,[actor.tenant_id]);
  res.json({endpoints:rows.map((x:Record<string,unknown>)=>({...x,
    callbackUrl:publicUrl(req,String(x.id)),hasVerifyToken:true,hasAppSecret:true}))});
 }));
 app.post('/api/metadata/inbound-webhooks',handler(async(req,res)=>{
  const actor=req.actor!;
  await rbac.require(actor.tenant_id,actor.user_id,'WebhookSubscription','manage');
  const body=req.body as Record<string,unknown>;
  if(!body||typeof body!=='object'||Array.isArray(body)
    ||typeof body.apiName!=='string'||!identifier.test(body.apiName)
    ||typeof body.appApiName!=='string'||!identifier.test(body.appApiName)
    ||typeof body.flowApi!=='string'||!identifier.test(body.flowApi)
    ||typeof body.executionUserId!=='string'||!uuid.test(body.executionUserId)
    ||typeof body.verifyToken!=='string'||body.verifyToken.length<24||body.verifyToken.length>512
    ||!['Meta','HmacSha256'].includes(String(body.provider??'Meta'))
    ||typeof body.appSecret!=='string'||body.appSecret.length<16||body.appSecret.length>512
    ||body.enabled!==undefined&&typeof body.enabled!=='boolean')
   {res.status(400).json({error:'Invalid webhook settings'});return;}
  const [{rows:apps},{rows:flow},{rows:users}]=await Promise.all([
   db.query<{id:string}>(`SELECT a.id FROM md_apps a
     JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=$1
     JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=$1
     WHERE a.api_name=$2 AND a.enabled=true AND e.active=true
       AND (e.expires_at IS NULL OR e.expires_at>now())`,
      [actor.tenant_id,body.appApiName]),
   db.query(`SELECT 1 FROM md_flow_definitions
      WHERE tenant_id=$1 AND api_name=$2 AND active=true AND archived=false
      AND flow_type='Autolaunched Flow'`,[actor.tenant_id,body.flowApi]),
   db.query(`SELECT 1 FROM md_users WHERE tenant_id=$1 AND id=$2`,
      [actor.tenant_id,body.executionUserId])
  ]);
  if(!apps[0]||!flow[0]||!users[0]
    ||!await rbac.allowed(actor.tenant_id,String(body.executionUserId),
       'Flow:'+body.flowApi,'execute'))
    {res.status(403).json({error:'App, Flow, or execution identity unavailable'});return;}
  const secured=vault.encryptOpaque(body.appSecret);
  const {rows}=await db.query<{id:string}>(`
   INSERT INTO md_inbound_webhook_endpoints
    (tenant_id,api_name,app_id,flow_api,execution_user_id,
     verify_token_digest,signature_secret_ciphertext,encryption_key_id,
     provider,enabled,created_by)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
   RETURNING id`,[actor.tenant_id,body.apiName,apps[0].id,body.flowApi,
    body.executionUserId,digest(body.verifyToken),secured.ciphertext,secured.keyId,
    body.provider??'Meta',body.enabled===true,actor.user_id]);
  await db.query(`INSERT INTO md_security_events(tenant_id,actor_user_id,action,details)
   VALUES($1,$2,'InboundWebhookCreated',$3::jsonb)`,
   [actor.tenant_id,actor.user_id,JSON.stringify({endpointId:rows[0].id,appApiName:body.appApiName,flowApi:body.flowApi})]);
  res.status(201).json({id:rows[0].id,callbackUrl:publicUrl(req,rows[0].id)});
 }));
 app.patch('/api/metadata/inbound-webhooks/:id',handler(async(req,res)=>{
  const actor=req.actor!;
  await rbac.require(actor.tenant_id,actor.user_id,'WebhookSubscription','manage');
  if(!uuid.test(req.params.id)||typeof req.body?.enabled!=='boolean'){
   res.status(400).json({error:'Invalid webhook state'});return;
  }
  const {rows}=await db.query(`UPDATE md_inbound_webhook_endpoints
   SET enabled=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id`,
   [actor.tenant_id,req.params.id,req.body.enabled]);
  if(!rows[0]){res.status(404).json({error:'Webhook not found'});return;}
  await db.query(`INSERT INTO md_security_events(tenant_id,actor_user_id,action,details)
   VALUES($1,$2,'InboundWebhookStatusChanged',$3::jsonb)`,
   [actor.tenant_id,actor.user_id,JSON.stringify({endpointId:req.params.id,enabled:req.body.enabled})]);
  res.json({enabled:req.body.enabled});
 }));
}
