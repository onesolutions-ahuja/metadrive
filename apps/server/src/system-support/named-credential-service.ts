import {OAuthAuthorizationService} from './oauth-authorization-service.js';
import nodemailer from 'nodemailer';
import {createCipheriv,createDecipheriv,randomBytes,randomUUID,createHash} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request as secureRequest} from 'node:https';
import type {PoolClient} from 'pg';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
import {decodeMetadataValues,type MetadataValueRow} from '../system-files/component-runtime.js';
import {flowAppIsEntitled} from '../system-files/flow-validation.js';
import {prepareFlowHttpRequest} from '../system-files/flow-http-mapping.js';
import {resolveFlowIntegrationCallout} from '../system-files/flow-integration-connection.js';

type CalloutJob={
 id:string;tenant_id:string;run_id:string;user_id:string;credential_id:string;method:string;
 connection_api:string|null;operation_api:string|null;operation_path_ciphertext:Buffer|null;
 path_ciphertext:Buffer;headers_ciphertext:Buffer;body_ciphertext:Buffer|null;
 idempotency_key_ciphertext:Buffer|null;max_attempts:number;timeout_ms:number;attempt_count:number
};
type CalloutValue={api_name:string;value_ciphertext:Buffer;data_type:string};
type FlowEmailJob={id:string;tenant_id:string;user_id:string;credential_id:string;
 flow_id:string;flow_version:number;flow_api:string;payload_ciphertext:Buffer;encryption_key_id:string};
type CalloutScalar=string|number|boolean|null;
const isCalloutScalar=(value:unknown):value is CalloutScalar=>
 value===null||typeof value==='string'||typeof value==='boolean'
 ||typeof value==='number'&&Number.isFinite(value);
const publicIp=(address:string)=>{
   if(isIP(address)===4){
    const [a,b]=address.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||
      a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&b>=18&&b<=19||
      a===192&&b===0||a===192&&b===88||a===192&&b===0||a===198&&b===51||
      a===203&&b===0);
   }
   if(isIP(address)===6){
    const v=address.toLowerCase();
    return !(/^(::|fc|fd|fe8|fe9|fea|feb)/.test(v)||v.includes(':ffff:'));
   }
   return false;
  };

/** Tenant-scoped encrypted named credentials. Never disclose stored secret material. */
export class NamedCredentialService {
  constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine){}
  private dispatching=false;
  private activeKeyId():string {
   return process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID || 'legacy';
 }
 private keyFor(id:string):Buffer|null {
  if(id==='legacy' && process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY){
   const decoded=Buffer.from(process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY,'base64');
   return decoded.length===32?decoded:null;
  }
  let parsed:unknown;
  try {parsed=JSON.parse(process.env.METADRIVE_CREDENTIAL_KEYS??'');}catch{return null;}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return null;
  const raw=(parsed as Record<string,unknown>)[id];
  if(typeof raw!=='string')return null;
  const decoded=Buffer.from(raw,'base64');
  return decoded.length===32?decoded:null;
 }
 private key() {
  // The active key belongs to the application, never to a hosting provider.
  // Keep the legacy single-key setting readable for existing installations.
  const activeId=process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID;
  if(process.env.METADRIVE_CREDENTIAL_KEYS||activeId)
   return activeId?this.keyFor(activeId):null;
  return this.keyFor('legacy');
 }
 private encryptValue(value:string) {
  const key=this.key();
  if(!key)throw new Error('Durable HTTP Callout encryption is not configured');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]);
 }
 private decryptValue(value:Buffer) {
  const key=this.key();
  if(!key||value.length<29)throw new Error('Queued HTTP Callout cannot be decrypted');
  const decipher=createDecipheriv('aes-256-gcm',key,value.subarray(0,12));
  decipher.setAuthTag(value.subarray(value.length-16));
  return Buffer.concat([decipher.update(value.subarray(12,value.length-16)),
   decipher.final()]).toString('utf8');
 }
 private decryptValueWithKey(value:Buffer,keyId:string) {
  const key=this.keyFor(keyId);
  if(!key||value.length<29)throw new Error('Queued Flow email cannot be decrypted');
  const decipher=createDecipheriv('aes-256-gcm',key,value.subarray(0,12));
  decipher.setAuthTag(value.subarray(value.length-16));
  return Buffer.concat([decipher.update(value.subarray(12,value.length-16)),
   decipher.final()]).toString('utf8');
 }
 /** Opaque tenant metadata encryption shared by MFA and Named Credentials.
  * Callers keep key identity in relational SQL and never expose ciphertext to clients.
  */
 encryptOpaque(value:string):{ciphertext:Buffer;keyId:string}{
  const key=this.key();
  if(!key)throw new Error('Credential encryption is not configured');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  return {ciphertext:Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]),
   keyId:this.activeKeyId()};
 }
 decryptOpaque(ciphertext:Buffer,keyId:string):string{
  const key=this.keyFor(keyId);
  if(!key||!ciphertext||ciphertext.length<29)throw new Error('Credential encryption key is unavailable');
  const decipher=createDecipheriv('aes-256-gcm',key,ciphertext.subarray(0,12));
  decipher.setAuthTag(ciphertext.subarray(-16));
  return Buffer.concat([decipher.update(ciphertext.subarray(12,-16)),decipher.final()]).toString('utf8');
 }
 async readiness(tenantId:string,userId:string){
  return {canManage:await this.rbac.allowed(tenantId,userId,'NamedCredential','manage'),
   encryptionReady:Boolean(this.key())};
 }
 async list(tenantId:string,userId:string){
  await this.rbac.require(tenantId,userId,'NamedCredential','read');
  const {rows}=await this.db.query<{
   id:string;name:string;label:string;protocol:string;base_url:string;auth_type:string;
   header_name:string;secret_ciphertext:Buffer|null;configuration_ciphertext:Buffer|null;
   encryption_key_id:string;enabled:boolean;updated_at:Date
  }>('SELECT id,name,label,protocol,base_url,auth_type,header_name,secret_ciphertext,configuration_ciphertext,encryption_key_id,enabled,updated_at FROM md_named_credentials WHERE tenant_id=$1 ORDER BY label,name',[tenantId]);
  const publicKeys=new Set(['graphApiVersion','wabaId','phoneNumberId',
   'businessPortfolioId','metaAppId','businessPhoneE164','templateLanguage',
   'webhookCallbackUrl','displayName']);
  return rows.map(x=>{
   let configuration:Record<string,string>={};
   if(x.name==='WhatsApp_Cloud_API'&&x.configuration_ciphertext){
    try{
     const raw=JSON.parse(this.decryptOpaque(x.configuration_ciphertext,x.encryption_key_id)) as unknown;
     if(raw&&typeof raw==='object'&&!Array.isArray(raw))
      configuration=Object.fromEntries(Object.entries(raw)
       .filter(([key,value])=>publicKeys.has(key)&&typeof value==='string')) as Record<string,string>;
    }catch{/* Never expose unreadable or confidential credential values. */}
   }
   return {id:x.id,name:x.name,label:x.label,protocol:x.protocol,
    baseUrl:x.base_url,authType:x.auth_type,headerName:x.header_name,
    hasSecret:Boolean(x.secret_ciphertext),enabled:x.enabled,configuration,
    keyId:x.encryption_key_id,updatedAt:x.updated_at};
  });
 }
 async create(tenantId:string,userId:string,body:unknown){
  await this.rbac.require(tenantId,userId,'NamedCredential','manage');
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Invalid credential');
  const x=body as Record<string,unknown>;
  if(typeof x.name!=='string'|| !/^[A-Za-z][A-Za-z0-9_]*$/.test(x.name)
    ||typeof x.label!=='string'||!x.label.trim()
    ||!['HTTPS','SMTP'].includes(String(x.protocol))
    ||!['None','Bearer','Basic','API Key','OAuth Client Credentials','OAuth Authorization Code'].includes(String(x.authType))
    ||typeof x.baseUrl!=='string'||typeof x.headerName!=='string')
    throw new Error('Invalid credential');
  if(x.configuration && (typeof x.configuration!=='object'||Array.isArray(x.configuration)||Object.values(x.configuration as object).some(v=>typeof v!=='string')))throw new Error('Invalid credential configuration');
  const secret=x.secret;
  if(secret!==undefined && typeof secret!=='string')throw new Error('Invalid credential secret');
  const key=secret?this.key():null;
  if(secret&&!key)throw new Error('Credential encryption is not configured');
  let encrypted:Buffer|null=null;
  if(secret&&key) {
   const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
   encrypted=Buffer.concat([iv,cipher.update(secret,'utf8'),cipher.final(),cipher.getAuthTag()]);
  }
  let encryptedConfiguration:Buffer|null=null;
  const config={...(x.configuration as Record<string,string>|undefined),...(typeof x.username==='string'&&x.username?{username:x.username}:{})};
  if(config && Object.keys(config).length){
   if(!this.key())throw new Error('Credential encryption is not configured');
   const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key()!,iv);
   encryptedConfiguration=Buffer.concat([iv,cipher.update(JSON.stringify(config),'utf8'),cipher.final(),cipher.getAuthTag()]);
  }
  const {rows}=await this.db.query<{id:string}>(
   'INSERT INTO md_named_credentials(tenant_id,name,label,protocol,base_url,auth_type,header_name,secret_ciphertext,configuration_ciphertext,enabled,encryption_key_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
   [tenantId,x.name,x.label,x.protocol,x.baseUrl,x.authType,x.headerName,encrypted,encryptedConfiguration,x.enabled!==false,this.activeKeyId()]);
  return (await this.list(tenantId,userId)).find(item=>item.id===rows[0].id);
 }
 /** Transactional, privileged re-encryption of a single tenant credential. */
 async rotate(tenantId:string,userId:string,id:string) {
  await this.rbac.require(tenantId,userId,'Security','manage');
  await this.rbac.require(tenantId,userId,'NamedCredential','manage');
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid credential');
  const targetId=this.activeKeyId(),targetKey=this.key();
  if(!targetKey)throw new Error('Credential encryption is not configured');
  await this.db.transaction(async client=>{
   const {rows}=await client.query<{
    encryption_key_id:string;secret_ciphertext:Buffer|null;configuration_ciphertext:Buffer|null
   }>('SELECT encryption_key_id,secret_ciphertext,configuration_ciphertext FROM md_named_credentials WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
   const existing=rows[0];
   if(!existing)throw new Error('Credential not found');
   if(existing.encryption_key_id===targetId)return;
   const oldKey=this.keyFor(existing.encryption_key_id);
   if(!oldKey&&(existing.secret_ciphertext||existing.configuration_ciphertext))
    throw new Error('Original credential encryption key is unavailable');
   const reencrypt=(encrypted:Buffer|null):Buffer|null=>{
    if(!encrypted)return null;
    if(!oldKey||encrypted.length<29)throw new Error('Invalid encrypted credential');
    const decipher=createDecipheriv('aes-256-gcm',oldKey,encrypted.subarray(0,12));
    decipher.setAuthTag(encrypted.subarray(encrypted.length-16));
    const plain=Buffer.concat([decipher.update(encrypted.subarray(12,-16)),decipher.final()]);
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',targetKey,iv);
    return Buffer.concat([iv,cipher.update(plain),cipher.final(),cipher.getAuthTag()]);
   };
   const secret=reencrypt(existing.secret_ciphertext);
   const config=reencrypt(existing.configuration_ciphertext);
   await client.query('UPDATE md_named_credentials SET secret_ciphertext=$3,configuration_ciphertext=$4,encryption_key_id=$5,updated_at=now() WHERE tenant_id=$1 AND id=$2',
    [tenantId,id,secret,config,targetId]);
   // Provider grants have independent key identities and must rotate atomically as well.
   const {rows:oauthRows}=await client.query<{
    key_id:string;access_ciphertext:Buffer;refresh_ciphertext:Buffer|null
   }>('SELECT key_id,access_ciphertext,refresh_ciphertext FROM md_credential_oauth_tokens WHERE tenant_id=$1 AND credential_id=$2 FOR UPDATE',
    [tenantId,id]);
   if(oauthRows[0]&&oauthRows[0].key_id!==targetId){
    const token=oauthRows[0];
    const rotateToken=(value:Buffer|null)=>{
     if(!value)return null;
     const plaintext=this.decryptOpaque(value,token.key_id);
     return this.encryptOpaque(plaintext).ciphertext;
    };
    await client.query(`UPDATE md_credential_oauth_tokens
      SET key_id=$3,access_ciphertext=$4,refresh_ciphertext=$5,updated_at=now()
      WHERE tenant_id=$1 AND credential_id=$2`,
      [tenantId,id,targetId,rotateToken(token.access_ciphertext),rotateToken(token.refresh_ciphertext)]);
   }
   await client.query(
    'INSERT INTO md_security_events(tenant_id,actor_user_id,action,details) VALUES($1,$2,$3,$4::jsonb)',
    [tenantId,userId,'NamedCredentialKeyRotation',JSON.stringify({credentialId:id,previousKeyId:existing.encryption_key_id,newKeyId:targetId})]);
  });
  return (await this.list(tenantId,userId)).find(c=>c.id===id);
 }
 async setEnabled(tenantId:string,userId:string,id:string,enabled:unknown){
  await this.rbac.require(tenantId,userId,'NamedCredential','manage');
  if(typeof enabled!=='boolean'|| !/^[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid credential');
  const result=await this.db.query(
   'UPDATE md_named_credentials SET enabled=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id',
   [tenantId,id,enabled]);
  if(!result.rowCount)throw new Error('Credential not found');
  return (await this.list(tenantId,userId)).find(item=>item.id===id);
 }
 async remove(tenantId:string,userId:string,id:string){
  await this.rbac.require(tenantId,userId,'NamedCredential','manage');
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid credential');
  const result=await this.db.query(
   'DELETE FROM md_named_credentials WHERE tenant_id=$1 AND id=$2 RETURNING id',[tenantId,id]);
  if(!result.rowCount)throw new Error('Credential not found');
 }
 async enqueueCallout(client:PoolClient,tenantId:string,userId:string,runId:string,nodeId:number,
   config:Record<string,unknown>,variables:Record<string,CalloutScalar>){
  await this.rbac.require(tenantId,userId,'NamedCredential','read');
  await this.rbac.require(tenantId,userId,'HTTPCallout','execute');
  const resolvedConfig=await resolveFlowIntegrationCallout(client,this.rbac,tenantId,userId,config);
  const prepared=prepareFlowHttpRequest(resolvedConfig,variables);
  const credentialId=resolvedConfig.namedCredentialId;
  const method=String(resolvedConfig.method??'GET').toUpperCase();
  const path=prepared.path;
  const headers=typeof resolvedConfig.headers==='string'?resolvedConfig.headers:'';
  const body=prepared.body??null;
  const maxAttempts=Number(config.maxAttempts??5);
  const idempotencyKey=typeof config.idempotencyKey==='string'
   ?config.idempotencyKey.trim().replace(/\{!([A-Za-z][A-Za-z0-9_.]*)\}/g,(_match,name:string)=>{
    if(!Object.hasOwn(variables,name))throw new Error('Unknown HTTP Callout idempotency resource');
    return String(variables[name]??'');
   }):'';
  const timeout=Math.min(30000,Math.max(1000,Number(config.timeoutMs)||15000));
  if(typeof credentialId!=='string'||!/^[0-9a-f-]{36}$/i.test(credentialId)
    ||!['GET','POST','PUT','PATCH','DELETE'].includes(method)
    ||typeof path!=='string'||path.startsWith('/')||path.includes('\\')||path.length>2048
    ||headers.length>8192||body&&Buffer.byteLength(body)>32768
    ||!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>5
    ||idempotencyKey.length>200)
   throw new Error('Invalid durable HTTP Callout configuration');
  await client.query('SAVEPOINT flow_http_callout_job');
  try{
   const credential=await client.query<{id:string}>(`
    SELECT id FROM md_named_credentials
    WHERE tenant_id=$1 AND id=$2 AND protocol='HTTPS' AND enabled=true
   `,[tenantId,credentialId]);
   if(!credential.rows[0])throw new Error('HTTPS credential unavailable');
   const {rows}=await client.query<{id:string}>(`
    INSERT INTO md_http_callout_jobs(tenant_id,run_id,node_id,user_id,credential_id,method,
     path_ciphertext,headers_ciphertext,body_ciphertext,idempotency_key_ciphertext,
     max_attempts,timeout_ms,connection_api,operation_api,operation_path_ciphertext)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id
   `,[tenantId,runId,nodeId,userId,credentialId,method,
    this.encryptValue(path),this.encryptValue(headers),body===null?null:this.encryptValue(body),
    idempotencyKey?this.encryptValue(idempotencyKey):null,maxAttempts,timeout,
    resolvedConfig.integrationConnectionId??null,resolvedConfig.integrationConnectionId
      ?resolvedConfig.operation:null,
    resolvedConfig.integrationConnectionId?this.encryptValue(String(resolvedConfig.path)):null]);
   for(const [apiName,value] of Object.entries(variables)){
    if(!/^[A-Za-z][A-Za-z0-9_.]*$/.test(apiName)||!isCalloutScalar(value))
     throw new Error('Invalid durable HTTP Callout variable');
    await client.query(`
     INSERT INTO md_http_callout_job_values(tenant_id,job_id,api_name,value_ciphertext,data_type)
     VALUES($1,$2,$3,$4,$5)
    `,[tenantId,rows[0].id,apiName,this.encryptValue(value===null?'null':String(value)),
     value===null?'null':typeof value]);
   }
   await client.query('RELEASE SAVEPOINT flow_http_callout_job');
   return rows[0].id;
  }catch(error){
   await client.query('ROLLBACK TO SAVEPOINT flow_http_callout_job');
   await client.query('RELEASE SAVEPOINT flow_http_callout_job');
   throw error;
  }
 }
 async dispatchOne(){
  if(this.dispatching)return false;
  this.dispatching=true;
  try{
   const job=await this.db.transaction(async client=>{
    // Unknown remote outcome: quarantine abandoned calls, never send them twice.
    await client.query(`UPDATE md_http_callout_jobs
      SET status='failed',claimed_at=NULL,last_error='RECONCILIATION_REQUIRED',completed_at=now()
      WHERE status='processing' AND claimed_at<now()-interval '5 minutes'`);
    const {rows}=await client.query<CalloutJob>(`
     WITH candidate AS (
      SELECT id FROM md_http_callout_jobs
      WHERE status='queued' AND next_attempt_at<=now()
      ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE md_http_callout_jobs j
     SET status='processing',attempt_count=j.attempt_count+1,claimed_at=now()
     FROM candidate c WHERE j.id=c.id
     RETURNING j.id,j.tenant_id,j.run_id,j.user_id,j.credential_id,j.method,j.path_ciphertext,
     j.headers_ciphertext,j.body_ciphertext,j.idempotency_key_ciphertext,j.max_attempts,
     j.timeout_ms,j.attempt_count,j.connection_api,j.operation_api,j.operation_path_ciphertext
    `);
    return rows[0];
   });
   if(!job)return false;
   try{
    // Validate current tenant, actor and published Flow before any remote side effect.
    const {rows:eligible}=await this.db.query<{api_name:string}>(`
      SELECT f.api_name FROM md_flow_runs r
      JOIN md_flow_definitions f ON f.tenant_id=r.tenant_id AND f.id=r.flow_id
      JOIN md_users u ON u.tenant_id=r.tenant_id AND u.id=r.started_by
      JOIN md_tenants t ON t.id=r.tenant_id
      WHERE r.tenant_id=$1 AND r.id=$2 AND r.started_by=$3
        AND f.active=true AND f.archived=false
        AND u.enabled=true AND t.status='ACTIVE'`,
      [job.tenant_id,job.run_id,job.user_id]);
    if(!eligible.length ||
       !await this.rbac.allowed(job.tenant_id,job.user_id,
        'Flow:'+eligible[0].api_name,'execute'))
      throw new Error('Queued HTTP Callout eligibility changed');
    const {rows}=await this.db.query<CalloutValue>(`
     SELECT api_name,value_ciphertext,data_type FROM md_http_callout_job_values
     WHERE tenant_id=$1 AND job_id=$2
    `,[job.tenant_id,job.id]);
    const variables:Record<string,CalloutScalar>=Object.create(null) as Record<string,CalloutScalar>;
    for(const row of rows){
     let value:CalloutScalar;
     const stored=this.decryptValue(row.value_ciphertext);
     if(row.data_type==='null'){
      if(stored!=='null')throw new Error('Invalid queued HTTP Callout null');
      value=null;
     }
     else if(row.data_type==='boolean'){
      if(stored!=='true'&&stored!=='false')throw new Error('Invalid queued HTTP Callout Boolean');
      value=stored==='true';
     }
     else if(row.data_type==='number'){
      value=Number(stored);
      if(!Number.isFinite(value))throw new Error('Invalid queued HTTP Callout number');
     }else if(row.data_type==='string')value=stored;
     else throw new Error('Invalid queued HTTP Callout value type');
     variables[row.api_name]=value;
    }
    if(job.connection_api){
     if(!job.operation_api||!job.operation_path_ciphertext)
      throw new Error('Queued Flow provider identity is incomplete');
     const approved=await resolveFlowIntegrationCallout(this.db,this.rbac,
      job.tenant_id,job.user_id,{integrationConnectionId:job.connection_api,
       operation:job.operation_api});
     if(approved.namedCredentialId!==job.credential_id||approved.method!==job.method
       ||approved.path!==this.decryptValue(job.operation_path_ciphertext))
      throw new Error('Queued Flow provider operation is no longer approved');
    }
    const response=await this.callout(job.tenant_id,job.user_id,{
     namedCredentialId:job.credential_id,method:job.method,
     path:this.decryptValue(job.path_ciphertext),headers:this.decryptValue(job.headers_ciphertext),
     body:job.body_ciphertext?this.decryptValue(job.body_ciphertext):'',
     timeoutMs:job.timeout_ms
    },variables,job.idempotency_key_ciphertext
      ?this.decryptValue(job.idempotency_key_ciphertext):job.id,true);
    // Commit terminal state and provider acknowledgement atomically.
    await this.db.transaction(async client=>{
     const {rowCount}=await client.query(`
      UPDATE md_http_callout_jobs SET status='completed',completed_at=now(),claimed_at=NULL
      WHERE tenant_id=$1 AND id=$2 AND status='processing'
     `,[job.tenant_id,job.id]);
     if(!rowCount)throw new Error('HTTP Callout claim no longer active');
     await client.query(`
      INSERT INTO md_http_callout_receipts(tenant_id,job_id,attempt,response_status)
      VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,job_id,attempt) DO NOTHING
     `,[job.tenant_id,job.id,job.attempt_count,response.status]);
    });
   }catch(error){
    // Any thrown error may have occurred after a remote side effect.
    await this.db.query(`
     UPDATE md_http_callout_jobs SET status='failed',
      last_error='RECONCILIATION_REQUIRED',claimed_at=NULL,completed_at=now()
     WHERE tenant_id=$1 AND id=$2 AND status='processing'
    `,[job.tenant_id,job.id]);
   }
   return true;
  }finally{this.dispatching=false;}
 }
 async update(tenantId:string,userId:string,id:string,body:unknown){
  await this.rbac.require(tenantId,userId,'NamedCredential','manage');
  if(!/^[0-9a-f-]{36}$/i.test(id)||!body||typeof body!=='object'||Array.isArray(body))
   throw new Error('Invalid credential');
  const current=await this.db.query<{encryption_key_id:string;secret_ciphertext:Buffer|null;configuration_ciphertext:Buffer|null}>(
   'SELECT encryption_key_id,secret_ciphertext,configuration_ciphertext FROM md_named_credentials WHERE tenant_id=$1 AND id=$2',
   [tenantId,id]);
  if(!current.rows[0])throw new Error('Credential not found');
  // A partial update cannot re-label ciphertext encrypted with an older key.
  if(current.rows[0].encryption_key_id!==this.activeKeyId() &&
     (current.rows[0].secret_ciphertext || current.rows[0].configuration_ciphertext))
    throw new Error('Credential key rotation requires a complete re-encryption workflow');
  const x=body as Record<string,unknown>;
  if(typeof x.name!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(x.name)||
    typeof x.label!=='string'||!x.label.trim()||
    !['HTTPS','SMTP'].includes(String(x.protocol))||
    !['None','Bearer','Basic','API Key','OAuth Client Credentials','OAuth Authorization Code'].includes(String(x.authType))||
    typeof x.baseUrl!=='string'||typeof x.headerName!=='string')throw new Error('Invalid credential');
  if(x.configuration && (typeof x.configuration!=='object'||Array.isArray(x.configuration)
    ||Object.values(x.configuration as object).some(value=>typeof value!=='string')))
    throw new Error('Invalid credential configuration');
  if(x.secret!==undefined && typeof x.secret!=='string')throw new Error('Invalid credential secret');
  const encrypt=(plain:string):Buffer=>{
   const key=this.key();if(!key)throw new Error('Credential encryption is not configured');
   const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
   return Buffer.concat([iv,cipher.update(plain,'utf8'),cipher.final(),cipher.getAuthTag()]);
  };
  const encrypted=x.secret?encrypt(x.secret as string):null;
  const configuration={...(x.configuration as Record<string,string>|undefined),...(typeof x.username==='string'&&x.username?{username:x.username}:{})};
  const encryptedConfig=configuration&&Object.keys(configuration).length
    ?encrypt(JSON.stringify(configuration)):null;
  const result=await this.db.query(
   `UPDATE md_named_credentials SET name=$3,label=$4,protocol=$5,base_url=$6,
     auth_type=$7,header_name=$8,
     secret_ciphertext=COALESCE($9,secret_ciphertext),
     configuration_ciphertext=COALESCE($10,configuration_ciphertext),
     encryption_key_id=CASE WHEN $9::bytea IS NOT NULL OR $10::bytea IS NOT NULL THEN $11 ELSE encryption_key_id END,
     updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id`,
   [tenantId,id,x.name,x.label,x.protocol,x.baseUrl,x.authType,x.headerName,encrypted,encryptedConfig,this.activeKeyId()]);
  if(!result.rowCount)throw new Error('Credential not found');
  return (await this.list(tenantId,userId)).find(c=>c.id===id);
 }
 
 /** Deliver tenant recovery mail using the saved encrypted SMTP credential.
  * Public DNS and TLS certificate validation protect outbound platform traffic.
  */
 async sendRecoveryEmail(tenantId:string,id:string,from:string,to:string,subject:string,body:string):Promise<void>{
  return this.sendTenantEmail(tenantId,id,from,to,subject,body);
 }
 /** Queue encrypted SMTP delivery; duplicate request keys never enqueue twice. */
 async sendQuickActionEmail(tenantId:string,userId:string,objectApi:string,recordId:string,
  actionId:string,credentialId:string,from:string,to:string,subject:string,body:string,
  requestKey:string=randomUUID()){
  await this.rbac.require(tenantId,userId,'Email','send');
  await this.rbac.require(tenantId,userId,'NamedCredential','read');
  const email=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(!uuid.test(requestKey)||!uuid.test(credentialId)||!email.test(to)||to.length>254
    ||!email.test(from)||from.length>254||typeof subject!=='string'
    ||!subject.trim()||subject.length>300||/[\r\n]/.test(subject)
    ||typeof body!=='string'||!body.trim()||body.length>10000
    ||!(/^[A-Za-z][A-Za-z0-9_]*$/.test(objectApi))
    ||!(/^[A-Za-z][A-Za-z0-9_-]*$/.test(actionId))
    ||(objectApi==='Global'?recordId!=='':!uuid.test(recordId)))
    throw new Error('Invalid Quick Action email');
  const payload=JSON.stringify({from,to,subject,body});
  const digest=createHash('sha256').update(JSON.stringify([
    objectApi,recordId,actionId,credentialId,payload])).digest('hex');
  return this.db.transaction(async client=>{
    const credential=await client.query(`SELECT 1 FROM md_named_credentials
      WHERE tenant_id=$1 AND id=$2 AND protocol='SMTP' AND enabled=true FOR SHARE`,
      [tenantId,credentialId]);
    if(!credential.rowCount)throw new Error('SMTP credential unavailable');
    const {rows}=await client.query<{id:string;payload_digest:string;status:string}>(`
      INSERT INTO md_quick_action_email_jobs
        (tenant_id,user_id,object_api,record_id,action_id,credential_id,
          payload_ciphertext,encryption_key_id,request_key,payload_digest)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT(tenant_id,user_id,request_key) DO UPDATE
        SET request_key=EXCLUDED.request_key
      RETURNING id,payload_digest,status`,
      [tenantId,userId,objectApi,recordId||null,actionId,credentialId,
       this.encryptValue(payload),this.activeKeyId(),requestKey,digest]);
    const job=rows[0];
    if(!job||job.payload_digest!==digest)
      throw new Error('Quick Action request key already belongs to a different message');
    await client.query(`INSERT INTO md_security_events(tenant_id,actor_user_id,action,details)
      VALUES($1,$2,'quick-action.email.queued',
      jsonb_build_object('objectApi',$3::text,'actionId',$4::text,'jobId',$5::text))`,
      [tenantId,userId,objectApi,actionId,job.id]);
    return {status:job.status,jobId:job.id};
  });
 }

 private quickActionEmailDispatching=false;
 async dispatchOneQuickActionEmail(){
  if(this.quickActionEmailDispatching)return false;
  this.quickActionEmailDispatching=true;
  try{
    const job=await this.db.transaction(async client=>{
      await client.query(`UPDATE md_quick_action_email_jobs
        SET status='failed',error_code='DELIVERY_OUTCOME_UNKNOWN',completed_at=now()
        WHERE status='sending' AND claimed_at<now()-interval '5 minutes'`);
      const {rows}=await client.query<{
        id:string;tenant_id:string;user_id:string;object_api:string;record_id:string|null;
        action_id:string;credential_id:string;payload_ciphertext:Buffer;encryption_key_id:string
      }>(`WITH candidate AS(
        SELECT id FROM md_quick_action_email_jobs WHERE status='queued'
        ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
       ) UPDATE md_quick_action_email_jobs j SET status='sending',claimed_at=now()
       FROM candidate c WHERE j.id=c.id
       RETURNING j.id,j.tenant_id,j.user_id,j.object_api,j.record_id,j.action_id,
        j.credential_id,j.payload_ciphertext,j.encryption_key_id`);
      return rows[0];
    });
    if(!job)return false;
    let errorCode='AUTHORIZATION_CHANGED';
    try{
      const actionResource='Action:'+(job.object_api==='Global'
        ?'Global.':job.object_api+'.')+job.action_id;
      const {rowCount:eligible}=await this.db.query(`
        SELECT 1 FROM md_users u
        JOIN md_tenants t ON t.id=u.tenant_id
        JOIN md_named_credentials c ON c.tenant_id=u.tenant_id AND c.id=$4
        WHERE u.tenant_id=$1 AND u.id=$2 AND u.enabled=true
          AND t.status='ACTIVE' AND c.protocol='SMTP' AND c.enabled=true
          AND (
            ($3='Global' AND EXISTS(
              SELECT 1 FROM md_global_quick_actions a
              WHERE a.tenant_id=u.tenant_id AND a.action_id=$5
                AND a.enabled=true AND a.behavior='Send Email'
                AND a.credential_id=$4))
            OR ($3<>'Global' AND EXISTS(
              SELECT 1 FROM md_object_actions a
              WHERE a.tenant_id=u.tenant_id AND a.object_api=$3 AND a.action_id=$5
                AND a.enabled=true AND a.behavior='Send Email'
                AND a.credential_id=$4))
          )`,
        [job.tenant_id,job.user_id,job.object_api,job.credential_id,job.action_id]);
      if(!eligible
        ||!await this.rbac.allowed(job.tenant_id,job.user_id,actionResource,'execute')
        ||!await this.rbac.allowed(job.tenant_id,job.user_id,'Email','send')
        ||!await this.rbac.allowed(job.tenant_id,job.user_id,'NamedCredential','read'))
        throw new Error('Quick Action email authorization changed');
      if(job.object_api!=='Global'){
        await this.rbac.require(job.tenant_id,job.user_id,job.object_api,'read');
        if(!job.record_id)throw new Error('Quick Action source record unavailable');
        await this.rbac.requireRecord(job.tenant_id,job.user_id,
          job.object_api,job.record_id,'read');
      }
      const payload=JSON.parse(this.decryptValueWithKey(
        job.payload_ciphertext,job.encryption_key_id)) as Record<string,unknown>;
      if(!payload||typeof payload.from!=='string'||typeof payload.to!=='string'
        ||typeof payload.subject!=='string'||typeof payload.body!=='string')
        throw new Error('Queued Quick Action email payload invalid');
      errorCode='DELIVERY_OUTCOME_UNKNOWN';
      await this.sendTenantEmail(job.tenant_id,job.credential_id,
        payload.from,payload.to,payload.subject,payload.body);
      await this.db.query(`UPDATE md_quick_action_email_jobs SET status='completed',
        claimed_at=NULL,completed_at=now() WHERE tenant_id=$1 AND id=$2 AND status='sending'`,
        [job.tenant_id,job.id]);
      await this.db.query(`INSERT INTO md_security_events(tenant_id,actor_user_id,action,details)
        VALUES($1,$2,'quick-action.email.delivered',jsonb_build_object('jobId',$3::text))`,
        [job.tenant_id,job.user_id,job.id]);
    }catch{
      await this.db.query(`UPDATE md_quick_action_email_jobs SET status='failed',
        error_code=$3,claimed_at=NULL,completed_at=now()
        WHERE tenant_id=$1 AND id=$2 AND status='sending'`,
        [job.tenant_id,job.id,errorCode]);
      await this.db.query(`INSERT INTO md_security_events(tenant_id,actor_user_id,action,details)
        VALUES($1,$2,'quick-action.email.failed',
          jsonb_build_object('jobId',$3::text,'errorCode',$4::text))`,
        [job.tenant_id,job.user_id,job.id,errorCode]);
    }
    return true;
  }finally{this.quickActionEmailDispatching=false;}
 }

 async enqueueFlowEmail(client:PoolClient,tenantId:string,userId:string,flowId:string,flowVersion:number,
  runId:string,nodeId:number,step:number,credentialId:string,from:string,recipients:string[],
  subject:string,body:string) {
  await this.rbac.require(tenantId,userId,'Email','send');
  await this.rbac.require(tenantId,userId,'NamedCredential','read');
  const email=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  if(!/^[0-9a-f-]{36}$/i.test(flowId)||!Number.isSafeInteger(flowVersion)||flowVersion<1
    ||!/^[0-9a-f-]{36}$/i.test(runId)||!Number.isSafeInteger(nodeId)||nodeId<1||nodeId>250
    ||!Number.isSafeInteger(step)||step<0||step>=200
    ||!/^[0-9a-f-]{36}$/i.test(credentialId)||!email.test(from)||from.length>254
    ||!Array.isArray(recipients)||recipients.length<1||recipients.length>100
    ||recipients.some(value=>typeof value!=='string'||value.length>254||!email.test(value))
    ||new Set(recipients).size!==recipients.length||subject.length>300||/[\r\n]/.test(subject)
    ||body.length>10000)
   throw new Error('Invalid Flow email configuration');
  const credential=await client.query<{id:string}>(`
   SELECT id FROM md_named_credentials
   WHERE tenant_id=$1 AND id=$2 AND protocol='SMTP' AND enabled=true FOR SHARE`,
   [tenantId,credentialId]);
  if(!credential.rows[0])throw new Error('SMTP credential unavailable');
  const payload=JSON.stringify({from,recipients,subject,body});
  const {rows}=await client.query<{id:string}>(`
   INSERT INTO md_flow_email_jobs
    (tenant_id,run_id,flow_id,flow_version,node_id,step,user_id,credential_id,
     payload_ciphertext,encryption_key_id)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
   [tenantId,runId,flowId,flowVersion,nodeId,step,userId,credentialId,
    this.encryptValue(payload),this.activeKeyId()]);
  if(!rows[0])throw new Error('Unable to queue Flow email');
  await client.query(`INSERT INTO md_security_events(tenant_id,actor_user_id,action,details)
   VALUES($1,$2,'flow.email.queued',jsonb_build_object('flowId',$3,'runId',$4,'step',$5))`,
   [tenantId,userId,flowId,runId,step]);
  return rows[0].id;
 }

 private emailDispatching=false;
 async dispatchOneFlowEmail() {
  if(this.emailDispatching)return false;
  this.emailDispatching=true;
  try{
   const job=await this.db.transaction(async client=>{
    await client.query(`UPDATE md_flow_email_jobs SET status='failed',
     error_code='DELIVERY_OUTCOME_UNKNOWN',completed_at=now()
     WHERE status='sending' AND claimed_at<now()-interval '5 minutes'`);
    await client.query(`UPDATE md_flow_email_jobs j SET status='failed',
     error_code='AUTHORIZATION_CHANGED',completed_at=now()
     WHERE j.status='queued' AND NOT EXISTS(
      SELECT 1 FROM md_flow_runs r JOIN md_flow_definitions f
       ON f.tenant_id=r.tenant_id AND f.id=j.flow_id
      WHERE r.tenant_id=j.tenant_id AND r.id=j.run_id
       AND r.flow_id=j.flow_id
       AND r.status IN ('completed','waiting') AND f.version=j.flow_version
       AND f.active=true AND f.archived=false)
      OR j.status='queued' AND NOT EXISTS(
       SELECT 1 FROM md_users u WHERE u.tenant_id=j.tenant_id
        AND u.id=j.user_id AND u.enabled=true)
      OR j.status='queued' AND NOT EXISTS(
       SELECT 1 FROM md_named_credentials c WHERE c.tenant_id=j.tenant_id
        AND c.id=j.credential_id AND c.protocol='SMTP' AND c.enabled=true)`);
    const {rows}=await client.query<FlowEmailJob>(`
     WITH candidate AS(
      SELECT j.id FROM md_flow_email_jobs j
      JOIN md_flow_runs r ON r.tenant_id=j.tenant_id AND r.id=j.run_id
      JOIN md_flow_definitions f ON f.tenant_id=j.tenant_id AND f.id=j.flow_id
      JOIN md_users u ON u.tenant_id=j.tenant_id AND u.id=j.user_id AND u.enabled=true
      JOIN md_named_credentials c ON c.tenant_id=j.tenant_id AND c.id=j.credential_id
       AND c.protocol='SMTP' AND c.enabled=true
      WHERE j.status='queued' AND r.flow_id=j.flow_id AND r.status IN ('completed','waiting')
       AND f.version=j.flow_version AND f.active=true AND f.archived=false
      ORDER BY j.created_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1
     )
     UPDATE md_flow_email_jobs j SET status='sending',claimed_at=now()
     FROM candidate c WHERE j.id=c.id
     RETURNING j.id,j.tenant_id,j.user_id,j.credential_id,j.flow_id,j.flow_version,
      j.payload_ciphertext,j.encryption_key_id,
      (SELECT api_name FROM md_flow_definitions WHERE tenant_id=j.tenant_id AND id=j.flow_id) AS flow_api
    `);
    return rows[0];
   });
   if(!job)return false;
   let errorCode='DELIVERY_FAILED';
   const markFailed=async(code:string)=>{
    await this.db.query(`UPDATE md_flow_email_jobs SET status='failed',
     error_code=$3,completed_at=now(),claimed_at=NULL
     WHERE tenant_id=$1 AND id=$2 AND status='sending'`,
     [job.tenant_id,job.id,code]);
    await this.db.query(`INSERT INTO md_security_events(tenant_id,actor_user_id,action,details)
     VALUES($1,$2,'flow.email.failed',jsonb_build_object('flowId',$3,'jobId',$4,'errorCode',$5))`,
     [job.tenant_id,job.user_id,job.flow_id,job.id,code]);
   };
   let message:{from:string;recipients:string[];subject:string;body:string};
   try{
    const {rows:metadata}=await this.db.query<MetadataValueRow>(`
     SELECT property_path,value_kind,value_text FROM md_flow_editor_values
     WHERE tenant_id=$1 AND flow_id=$2`,[job.tenant_id,job.flow_id]);
    const graph=decodeMetadataValues(metadata).builder as Record<string,unknown>|undefined;
    const appApiName=typeof graph?.appApiName==='string'&&graph.appApiName
     ?graph.appApiName:null;
    const authorized=await flowAppIsEntitled(this.db,job.tenant_id,appApiName)
     &&await this.rbac.allowed(job.tenant_id,job.user_id,'Flow:'+job.flow_api,'execute')
     &&await this.rbac.allowed(job.tenant_id,job.user_id,'Email','send')
     &&await this.rbac.allowed(job.tenant_id,job.user_id,'NamedCredential','read');
    if(!authorized){
     errorCode='AUTHORIZATION_CHANGED';
     throw new Error('Flow email authorization changed');
    }
    let payload:unknown;
    try{payload=JSON.parse(this.decryptValueWithKey(job.payload_ciphertext,job.encryption_key_id));}
    catch{throw new Error('Queued Flow email payload is invalid');}
    if(!payload||typeof payload!=='object'||Array.isArray(payload))
     throw new Error('Queued Flow email payload is invalid');
    const data=payload as Record<string,unknown>;
    if(typeof data.from!=='string'||!Array.isArray(data.recipients)
      ||!data.recipients.every((value):value is string=>typeof value==='string')
      ||typeof data.subject!=='string'||typeof data.body!=='string')
     throw new Error('Queued Flow email payload is invalid');
    message={from:data.from,recipients:data.recipients,subject:data.subject,body:data.body};
   }catch{
    await markFailed(errorCode);
    return true;
   }
   try{
    await this.sendTenantEmail(job.tenant_id,job.credential_id,message.from,
     message.recipients.join(','),message.subject,message.body);
   }catch{
    await markFailed('DELIVERY_OUTCOME_UNKNOWN');
    return true;
   }
   const {rowCount}=await this.db.query(`UPDATE md_flow_email_jobs SET status='completed',
    completed_at=now(),claimed_at=NULL WHERE tenant_id=$1 AND id=$2 AND status='sending'`,
    [job.tenant_id,job.id]);
   if(!rowCount)throw new Error('Flow email job state changed before completion');
   await this.db.query(`INSERT INTO md_security_events(tenant_id,actor_user_id,action,details)
    VALUES($1,$2,'flow.email.delivered',jsonb_build_object('flowId',$3,'jobId',$4))`,
    [job.tenant_id,job.user_id,job.flow_id,job.id]);
   return true;
  }finally{this.emailDispatching=false;}
 }

 async sendTenantEmail(tenantId:string,id:string,from:string,to:string,subject:string,body:string):Promise<void>{
  if(!/^[0-9a-f-]{36}$/i.test(id)||!from||!to||
    /[\r\n]/.test(from+to+subject)||subject.length>300||body.length>10000)
   throw new Error('Invalid recovery email');
  const {rows}=await this.db.query<{
   base_url:string;auth_type:string;secret_ciphertext:Buffer|null;
   configuration_ciphertext:Buffer|null;encryption_key_id:string;enabled:boolean
  }>(`SELECT base_url,auth_type,secret_ciphertext,configuration_ciphertext,encryption_key_id,enabled
      FROM md_named_credentials WHERE tenant_id=$1 AND id=$2 AND protocol='SMTP'`,[tenantId,id]);
  const row=rows[0];
  if(!row?.enabled||row.auth_type!=='Basic')throw new Error('SMTP credential unavailable');
  const endpoint=new URL(row.base_url);
  const port=endpoint.port|| (endpoint.protocol==='smtps:'?'465':'587');
  if(!['smtp:','smtps:'].includes(endpoint.protocol)||!['465','587'].includes(port)||
    endpoint.username||endpoint.password||endpoint.pathname!=='/'||endpoint.search||endpoint.hash||
    isIP(endpoint.hostname)||endpoint.hostname==='localhost'||endpoint.hostname.endsWith('.local'))
   throw new Error('Invalid SMTP destination');
  const addresses=await lookup(endpoint.hostname,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(a=>!publicIp(a.address)))
   throw new Error('SMTP destination resolves to restricted network');
  const key=this.keyFor(row.encryption_key_id);
  const decrypt=(encrypted:Buffer|null)=>{
   if(!key||!encrypted||encrypted.length<29)throw new Error('SMTP credential cannot be decrypted');
   const decipher=createDecipheriv('aes-256-gcm',key,encrypted.subarray(0,12));
   decipher.setAuthTag(encrypted.subarray(-16));
   return Buffer.concat([decipher.update(encrypted.subarray(12,-16)),decipher.final()]).toString('utf8');
  };
  const secret=decrypt(row.secret_ciphertext);
  let config:Record<string,unknown>;
  try {config=JSON.parse(decrypt(row.configuration_ciphertext)) as Record<string,unknown>;}
  catch{throw new Error('Invalid SMTP configuration');}
  const username=config.username;
  if(typeof username!=='string'||!username||username.length>254)
   throw new Error('SMTP username missing');
  const address=addresses[0];
  const transport=nodemailer.createTransport({
   host:address.address,port:Number(port),secure:port==='465',requireTLS:true,
   auth:{user:username,pass:secret},
   tls:{servername:endpoint.hostname,rejectUnauthorized:true,minVersion:'TLSv1.2'},
   connectionTimeout:15000,greetingTimeout:15000,socketTimeout:15000,
   pool:false
  });
  try {await transport.sendMail({from,to,subject,text:body});}
  finally{transport.close();}
 }

 /** One reusable, host-independent outbound HTTP transport. Credential secrets are never returned to a Flow. */
 async callout(tenantId:string,userId:string,config:Record<string,unknown>,
   variables:Record<string,string|number|boolean|null>,idempotencyKey:string,
   previouslyPrepared=false){
  await this.rbac.require(tenantId,userId,'NamedCredential','read');
  await this.rbac.require(tenantId,userId,'HTTPCallout','execute');
  config=await resolveFlowIntegrationCallout(this.db,this.rbac,tenantId,userId,config);
  // Durable jobs hold an encrypted, already-expanded snapshot. Never expand it twice.
  const prepared=previouslyPrepared?{
   path:String(config.path??''),body:typeof config.body==='string'&&config.body
    ?config.body:undefined
  }:prepareFlowHttpRequest(config,variables);
  if(typeof config.namedCredentialId!=='string'||!/^[0-9a-f-]{36}$/i.test(config.namedCredentialId))
    throw new Error('HTTP Callout requires a saved HTTPS Named Credential');
  const {rows}=await this.db.query<{
   protocol:string;base_url:string;auth_type:string;header_name:string;
   secret_ciphertext:Buffer|null;configuration_ciphertext:Buffer|null;encryption_key_id:string;enabled:boolean
  }>('SELECT protocol,base_url,auth_type,header_name,secret_ciphertext,configuration_ciphertext,encryption_key_id,enabled FROM md_named_credentials WHERE tenant_id=$1 AND id=$2',
    [tenantId,config.namedCredentialId]);
  const item=rows[0];
  if(!item||!item.enabled||item.protocol!=='HTTPS')throw new Error('HTTPS credential unavailable');
  const method=String(config.method??'GET').toUpperCase();
  if(!['GET','POST','PUT','PATCH','DELETE'].includes(method))throw new Error('Unsupported HTTP method');
  if(config.deliveryMode==='DURABLE_ASYNC')
   throw new Error('Durable HTTP Callouts must be queued through the SQL dispatcher');
  if(typeof config.path!=='string'||config.path.startsWith('/')||config.path.includes('\\')||config.path.length>2048)
    throw new Error('Invalid relative callout path');
  const substitute=(source:string)=>source.replace(/\{!([A-Za-z][A-Za-z0-9_.]*)\}/g,(_,key:string)=>{
   if(!Object.hasOwn(variables,key))throw new Error('Unknown HTTP Callout resource');
   return String(variables[key]??'');
  });
  const base=new URL(item.base_url);
  if(base.protocol!=='https:'||base.username||base.password||base.hash||base.port&&base.port!=='443')
    throw new Error('HTTP Callouts require a standard HTTPS origin');
  const destination=new URL(prepared.path,base.href.endsWith('/')?base.href:base.href+'/');
  if(destination.origin!==base.origin||destination.username||destination.password||destination.hash)
    throw new Error('HTTP Callout destination is outside Named Credential');
  if(isIP(destination.hostname)||destination.hostname==='localhost'||destination.hostname.endsWith('.local'))
    throw new Error('Direct IP and local network callouts are prohibited');
  const resolved=await lookup(destination.hostname,{all:true,verbatim:true});
  if(!resolved.length||resolved.some(x=>!publicIp(x.address)))
    throw new Error('HTTP Callout destination resolves to a restricted network');
  const header:Record<string,string>={'Accept':'application/json'};
  if(typeof config.headers==='string'&&config.headers.trim()){
   for(const line of config.headers.split(/\r?\n/)){
    const colon=line.indexOf(':');
    if(colon<1)throw new Error('Invalid HTTP header');
    const name=line.slice(0,colon).trim(),value=substitute(line.slice(colon+1).trim());
    if(!/^X-[a-z0-9-]+$/i.test(name)||/[\r\n]/.test(value))throw new Error('Restricted HTTP header');
    header[name]=value;
   }
  }
  let oauthClientSecret:string|undefined;
  if(item.auth_type==='OAuth Authorization Code'){
   header.Authorization='Bearer '+await new OAuthAuthorizationService(this.db,this.rbac,this)
    .bearerToken(tenantId,String(config.namedCredentialId));
  }else if(item.auth_type!=='None'){
   const encrypted=item.secret_ciphertext;
   const key=this.keyFor(item.encryption_key_id);
   if(!encrypted||!key||encrypted.length<29)throw new Error('Named Credential cannot be decrypted');
   const decipher=createDecipheriv('aes-256-gcm',key,encrypted.subarray(0,12));
   decipher.setAuthTag(encrypted.subarray(encrypted.length-16));
   const secret=Buffer.concat([decipher.update(encrypted.subarray(12,encrypted.length-16)),decipher.final()]).toString('utf8');
   if(item.auth_type==='Bearer')header.Authorization='Bearer '+secret;
   else if(item.auth_type==='Basic')header.Authorization='Basic '+Buffer.from(secret).toString('base64');
   else if(item.auth_type==='API Key'){
    if(!/^X-[a-z0-9-]+$/i.test(item.header_name))throw new Error('Credential header must be an X- header');
    header[item.header_name]=secret;
   }else if(item.auth_type==='OAuth Client Credentials')oauthClientSecret=secret;
   else throw new Error('OAuth Authorization Code requires an interactive authorization grant');
  }
  if(item.auth_type==='OAuth Client Credentials'){
   const cipher=item.configuration_ciphertext,key=this.keyFor(item.encryption_key_id);
   if(!cipher||!key||cipher.length<29||!oauthClientSecret)
    throw new Error('OAuth client configuration is unavailable');
   const decipher=createDecipheriv('aes-256-gcm',key,cipher.subarray(0,12));
   decipher.setAuthTag(cipher.subarray(-16));
   let settings:Record<string,unknown>;
   try {settings=JSON.parse(Buffer.concat([
    decipher.update(cipher.subarray(12,-16)),decipher.final()
   ]).toString('utf8')) as Record<string,unknown>;}
   catch{throw new Error('Invalid OAuth client configuration');}
   const clientId=settings.clientId,tokenPath=settings.tokenPath,scope=settings.scope;
   if(typeof clientId!=='string'||!clientId||clientId.length>512||
      typeof tokenPath!=='string'||!tokenPath||tokenPath.length>1024||
      tokenPath.startsWith('/')||tokenPath.includes('\\')||
      (scope!==undefined&&(typeof scope!=='string'||scope.length>1024)))
    throw new Error('Invalid OAuth client configuration');
   const tokenUrl=new URL(tokenPath,base.href.endsWith('/')?base.href:base.href+'/');
   if(tokenUrl.origin!==base.origin||tokenUrl.username||tokenUrl.password||tokenUrl.hash||
      tokenUrl.search)throw new Error('Invalid OAuth token endpoint');
   const form=new URLSearchParams({grant_type:'client_credentials'});
   if(scope)form.set('scope',scope as string);
   const payload=form.toString();
   const authorization='Basic '+Buffer.from(clientId+':'+oauthClientSecret).toString('base64');
   const tokenResponse=await new Promise<string>((resolve,reject)=>{
    const request=secureRequest(tokenUrl,{method:'POST',agent:false,
     lookup:(_host,_options,cb)=>cb(null,resolved[0].address,resolved[0].family),
     timeout:15000,headers:{Authorization:authorization,'Content-Type':'application/x-www-form-urlencoded',
       Accept:'application/json','Content-Length':Buffer.byteLength(payload)}},response=>{
      if((response.statusCode??0)<200||(response.statusCode??0)>=300){
       response.resume();reject(new Error('OAuth token endpoint rejected credentials'));return;
      }
      const chunks:Buffer[]=[];let length=0;
      response.on('data',(chunk:Buffer)=>{
       length+=chunk.length;
       if(length>8192){request.destroy(new Error('OAuth token response too large'));return;}
       chunks.push(chunk);
      });
      response.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
    });
    request.on('timeout',()=>request.destroy(new Error('OAuth token timeout')));
    request.on('error',reject);
    request.end(payload);
   });
   let token:unknown;
   try{token=JSON.parse(tokenResponse);}catch{throw new Error('Invalid OAuth token response');}
   const result=token as {access_token?:unknown;token_type?:unknown};
   if(typeof result.access_token!=='string'||!result.access_token||
      result.access_token.length>8192||result.token_type?.toString().toLowerCase()!=='bearer')
    throw new Error('Invalid OAuth token response');
   header.Authorization='Bearer '+result.access_token;
  }
  if(method!=='GET')header['Idempotency-Key']=idempotencyKey;
  const body=prepared.body;
  if(body&&Buffer.byteLength(body)>32768)throw new Error('HTTP Callout body too large');
  if(body)header['Content-Type']='application/json';
  const timeout=Math.min(30000,Math.max(1000,Number(config.timeoutMs)||15000));
  const address=resolved[0];
  const result=await new Promise<{status:number;body:string}>((resolve,reject)=>{
   const call=secureRequest(destination,{method,headers:header,timeout,
    agent:false,lookup:(_host,_options,cb)=>cb(null,address.address,address.family)},res=>{
      const status=res.statusCode??0;
      const chunks:Buffer[]=[];let length=0;
      res.on('data',(chunk:Buffer)=>{
       length+=chunk.length;
       if(length>65536){call.destroy(new Error('HTTP response exceeded limit'));return;}
       chunks.push(chunk);
      });
      res.on('end',()=>resolve({status,body:Buffer.concat(chunks).toString('utf8')}));
   });
   call.on('timeout',()=>call.destroy(new Error('HTTP Callout timeout')));
   call.on('error',reject);
   if(body)call.write(body);
   call.end();
  });
  if(result.status<200||result.status>=300)throw new Error('HTTP Callout failed with status '+result.status);
  return {status:result.status,body:result.body.slice(0,4096)};
 }

}
