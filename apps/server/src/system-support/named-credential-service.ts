import {OAuthAuthorizationService} from './oauth-authorization-service.js';
import nodemailer from 'nodemailer';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request as secureRequest} from 'node:https';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';

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
  const keyring=process.env.METADRIVE_CREDENTIAL_KEYS;
  const activeId=process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID;
  if(keyring || activeId){
   if(!keyring || !activeId)return null;
   let keys:unknown;
   try { keys=JSON.parse(keyring); } catch { return null; }
   if(!keys || typeof keys!=='object' || Array.isArray(keys))return null;
   const raw=(keys as Record<string,unknown>)[activeId];
   if(typeof raw!=='string')return null;
   const key=Buffer.from(raw,'base64');
   return key.length===32?key:null;
  }
  const raw=process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY;
  if(!raw)return null;
  const key=Buffer.from(raw,'base64');
  return key.length===32?key:null;
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
   header_name:string;secret_ciphertext:Buffer|null;encryption_key_id:string;enabled:boolean;updated_at:Date
  }>('SELECT id,name,label,protocol,base_url,auth_type,header_name,secret_ciphertext,encryption_key_id,enabled,updated_at FROM md_named_credentials WHERE tenant_id=$1 ORDER BY label,name',[tenantId]);
  return rows.map(x=>({id:x.id,name:x.name,label:x.label,protocol:x.protocol,
   baseUrl:x.base_url,authType:x.auth_type,headerName:x.header_name,
   hasSecret:Boolean(x.secret_ciphertext),enabled:x.enabled,configuration:{},
   keyId:x.encryption_key_id,updatedAt:x.updated_at}));
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
   variables:Record<string,string|number|boolean|null>,idempotencyKey:string){
  await this.rbac.require(tenantId,userId,'NamedCredential','read');
  await this.rbac.require(tenantId,userId,'HTTPCallout','execute');
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
  if(config.deliveryMode==='DURABLE_ASYNC')throw new Error('Durable async HTTP Callout requires the SQL job dispatcher');
  if(typeof config.path!=='string'||config.path.startsWith('/')||config.path.includes('\\')||config.path.length>2048)
    throw new Error('Invalid relative callout path');
  const substitute=(source:string)=>source.replace(/\{!([A-Za-z][A-Za-z0-9_.]*)\}/g,(_,key:string)=>{
   if(!Object.hasOwn(variables,key))throw new Error('Unknown HTTP Callout resource');
   return String(variables[key]??'');
  });
  const base=new URL(item.base_url);
  if(base.protocol!=='https:'||base.username||base.password||base.hash||base.port&&base.port!=='443')
    throw new Error('HTTP Callouts require a standard HTTPS origin');
  const destination=new URL(substitute(config.path),base.href.endsWith('/')?base.href:base.href+'/');
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
  if(typeof config.queryParameters==='string'&&config.queryParameters.trim())
    throw new Error('Structured query parameters must be configured through supported mappings');
  const body=typeof config.body==='string'&&config.body.trim()?substitute(config.body):undefined;
  if(body&&Buffer.byteLength(body)>32768)throw new Error('HTTP Callout body too large');
  if(body)header['Content-Type']='application/json';
  const timeout=Math.min(30000,Math.max(1000,Number(config.timeoutMs)||15000));
  const address=resolved[0];
  // Reserve the key before sending any state-changing request. A pending key
  // surviving a crash means an unknown provider outcome, not permission to resend.
  let reservationId:string|undefined;
  if(method!=='GET'){
   if(typeof idempotencyKey!=='string'||!/^[A-Za-z0-9_.:-]{1,256}$/.test(idempotencyKey))
    throw new Error('Invalid outbound execution key');
   const {rows:reserved}=await this.db.query<{id:string}>(`
    INSERT INTO md_outbound_execution_receipts
      (tenant_id,execution_key,credential_id,request_method)
    VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,execution_key) DO NOTHING RETURNING id
   `,[tenantId,idempotencyKey,config.namedCredentialId,method]);
   if(!reserved[0])throw new Error('Outbound execution requires reconciliation before retry');
   reservationId=reserved[0].id;
  }
  try {
  const result=await new Promise<{status:number;body:string;providerReceipt?:string}>((resolve,reject)=>{
   const call=secureRequest(destination,{method,headers:header,timeout,
    agent:false,lookup:(_host,_options,cb)=>cb(null,address.address,address.family)},res=>{
      const status=res.statusCode??0;
      const chunks:Buffer[]=[];let length=0;
      res.on('data',(chunk:Buffer)=>{
       length+=chunk.length;
       if(length>65536){call.destroy(new Error('HTTP response exceeded limit'));return;}
       chunks.push(chunk);
      });
      res.on('end',()=>{
       const raw=res.headers['x-request-id'];
       const requestId=typeof raw==='string'&&/^[A-Za-z0-9_.:-]{1,256}$/.test(raw)?raw:undefined;
       resolve({status,body:Buffer.concat(chunks).toString('utf8'),providerReceipt:requestId});
      });
   });
   call.on('timeout',()=>call.destroy(new Error('HTTP Callout timeout')));
   call.on('error',reject);
   if(body)call.write(body);
   call.end();
  });
  if(result.status<200||result.status>=300)throw new Error('HTTP Callout failed with status '+result.status);
  if(reservationId)await this.db.query(`
   UPDATE md_outbound_execution_receipts
   SET state='completed',response_status=$3,provider_receipt=$4,updated_at=now()
   WHERE tenant_id=$1 AND id=$2 AND state='pending'
  `,[tenantId,reservationId,result.status,result.providerReceipt??null]);
  return {status:result.status,body:result.body.slice(0,4096)};
  }catch(error){
   if(reservationId){
    try{await this.db.query(`
     UPDATE md_outbound_execution_receipts SET state='uncertain',updated_at=now()
     WHERE tenant_id=$1 AND id=$2 AND state='pending'
    `,[tenantId,reservationId]);}catch{/* Pending is equally non-replayable. */}
   }
   throw error;
  }
 }

}
