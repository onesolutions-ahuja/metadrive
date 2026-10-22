import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
import type {FlowRuntime} from '../system-files/flow-runtime.js';
import type {RecordEngine} from '../system-files/record-engine.js';
import type {NamedCredentialService} from './named-credential-service.js';

type Actor={tenant_id:string;user_id:string};
type Authenticated=Request & {actor?:Actor;rawWebhookBody?:Buffer};
type Endpoint={tenant_id:string;id:string;api_name:string;flow_api:string|null;
 execution_user_id:string|null;created_by:string;credential_name:string|null;
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
function publicUrl(req:Request,id:string){
 return req.protocol+'://'+req.get('host')+'/api/inbound-webhooks/'+encodeURIComponent(id);
}
export function registerInboundWebhookPublicRoutes(app:Express,db:SqlPersistence,
 vault:NamedCredentialService,flows:FlowRuntime,rbac:RbacEngine,records?:RecordEngine){
 const load=async(id:string):Promise<Endpoint|undefined>=>{
  if(!uuid.test(id))return undefined;
  const {rows}=await db.query<Endpoint>(`
   SELECT w.*,a.api_name AS app_api,c.name AS credential_name
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
  res.setHeader('Cache-Control','no-store');
  const endpoint=await load(req.params.id);
  const mode=req.query['hub.mode'],token=req.query['hub.verify_token'];
  const challenge=req.query['hub.challenge'];
  if(!endpoint||!['Meta','HmacSha256'].includes(endpoint.provider)||mode!=='subscribe'||typeof token!=='string'||token.length>512
     ||typeof challenge!=='string'||challenge.length>1024
     ||!matches(endpoint.verify_token_digest,digest(token))){
   res.status(403).type('text/plain').send('Forbidden');return;
  }
  res.status(200).type('text/plain').send(challenge);
 }));
 app.post('/api/inbound-webhooks/:id',handler(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const endpoint=await load(req.params.id);
  const signature=req.get('x-hub-signature-256');
  const raw=req.rawWebhookBody;
  if(!endpoint||!raw||raw.length>262144||!signature
    ||!/^sha256=[a-f0-9]{64}$/i.test(signature)){
   res.status(401).json({error:'Webhook signature invalid'});return;
  }
  const secret=vault.decryptOpaque(endpoint.signature_secret_ciphertext,endpoint.encryption_key_id);
  const signatureDigest=createHmac('sha256',secret).update(raw).digest();
  const supplied=Buffer.from(signature.slice(7),'hex');
  if(!matches(signatureDigest,supplied)){
   res.status(401).json({error:'Webhook signature invalid'});return;
  }
  // A credential webhook may also route through an authorised tenant Flow.
  // Preserve the existing Communication archive when Flow routing is configured.
  // Legacy app/Flow-only endpoints retain their existing Flow-only behaviour.
  if(endpoint.flow_api){
   const {rows:active}=await db.query(`
     SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2
       AND active=true AND archived=false AND flow_type='Autolaunched Flow' LIMIT 1`,
     [endpoint.tenant_id,endpoint.flow_api]);
   if(!endpoint.execution_user_id||!active[0]||!await rbac.allowed(
      endpoint.tenant_id,endpoint.execution_user_id,'Flow:'+endpoint.flow_api,'execute')){
    res.status(503).json({error:'Webhook Flow not available'});return;
   }
  }
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)){
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
  if(!event){res.status(503).json({error:'Unable to accept webhook'});return;}
  if(event.status==='completed'){res.status(200).json({received:true});return;}
  // The event payload is retained in tenant SQL. A compact scalar copy is sent
  // only when the Flow input contract can accept it (max 4096 characters).
  const json=raw.toString('utf8');
  try{
   if(endpoint.flow_api&&endpoint.execution_user_id){
    await flows.execute(endpoint.tenant_id,endpoint.flow_api,endpoint.execution_user_id,{
     requestId:event.id,webhookEventId:event.id,webhookPayloadJson:json.length<=4096?json:'',
     webhookEndpoint:endpoint.api_name
    });
   }
   // Credential-linked endpoints keep their existing generic Communication
   // record even when a tenant enables a reusable Flow consumer.
   if(!endpoint.flow_api||endpoint.credential_name){
    if(!records)throw new Error('Communication record engine unavailable');
    const sanitized=JSON.stringify(safePayload(req.body)).slice(0,10000);
    await records.create(endpoint.tenant_id,endpoint.execution_user_id??endpoint.created_by,
     'Communication',{
      Name:'Webhook '+endpoint.api_name,
      Channel:'Other',Direction:'Inbound',Status:'Received',
      Provider:endpoint.credential_name??endpoint.provider,
      Body:sanitized,ReceivedAt:new Date().toISOString(),
      ExternalMessageId:event.id,RelatedObject:'InboundWebhookEvent',RelatedRecordId:event.id
     });
   }
   await db.query(`UPDATE md_inbound_webhook_events SET status='completed',
     processed_at=now(),error_code=NULL WHERE tenant_id=$1 AND id=$2`,
    [endpoint.tenant_id,event.id]);
   res.status(200).json({received:true});
  }catch(error){
   await db.query(`UPDATE md_inbound_webhook_events SET status='failed',
     processed_at=now(),error_code=$3 WHERE tenant_id=$1 AND id=$2`,
    [endpoint.tenant_id,event.id,endpoint.flow_api?'FLOW_EXECUTION_FAILED':'COMMUNICATION_WRITE_FAILED']);
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
