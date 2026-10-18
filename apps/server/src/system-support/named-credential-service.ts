import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request as secureRequest} from 'node:https';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';

/** Tenant-scoped encrypted named credentials. Never disclose stored secret material. */
export class NamedCredentialService {
 constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine){}
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
 async readiness(tenantId:string,userId:string){
  return {canManage:await this.rbac.allowed(tenantId,userId,'NamedCredential','manage'),
   encryptionReady:Boolean(this.key())};
 }
 async list(tenantId:string,userId:string){
  await this.rbac.require(tenantId,userId,'NamedCredential','read');
  const {rows}=await this.db.query<{
   id:string;name:string;label:string;protocol:string;base_url:string;auth_type:string;
   header_name:string;secret_ciphertext:Buffer|null;enabled:boolean;updated_at:Date
  }>('SELECT id,name,label,protocol,base_url,auth_type,header_name,secret_ciphertext,enabled,updated_at FROM md_named_credentials WHERE tenant_id=$1 ORDER BY label,name',[tenantId]);
  return rows.map(x=>({id:x.id,name:x.name,label:x.label,protocol:x.protocol,
   baseUrl:x.base_url,authType:x.auth_type,headerName:x.header_name,
   hasSecret:Boolean(x.secret_ciphertext),enabled:x.enabled,configuration:{},
   keyId:'server-managed',updatedAt:x.updated_at}));
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
  const config=x.configuration as Record<string,string>|undefined;
  if(config && Object.keys(config).length){
   if(!this.key())throw new Error('Credential encryption is not configured');
   const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key()!,iv);
   encryptedConfiguration=Buffer.concat([iv,cipher.update(JSON.stringify(config),'utf8'),cipher.final(),cipher.getAuthTag()]);
  }
  const {rows}=await this.db.query<{id:string}>(
   'INSERT INTO md_named_credentials(tenant_id,name,label,protocol,base_url,auth_type,header_name,secret_ciphertext,configuration_ciphertext,enabled) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
   [tenantId,x.name,x.label,x.protocol,x.baseUrl,x.authType,x.headerName,encrypted,encryptedConfiguration,x.enabled!==false]);
  return (await this.list(tenantId,userId)).find(item=>item.id===rows[0].id);
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
  const configuration=x.configuration as Record<string,string>|undefined;
  const encryptedConfig=configuration&&Object.keys(configuration).length
    ?encrypt(JSON.stringify(configuration)):null;
  const result=await this.db.query(
   `UPDATE md_named_credentials SET name=$3,label=$4,protocol=$5,base_url=$6,
     auth_type=$7,header_name=$8,
     secret_ciphertext=COALESCE($9,secret_ciphertext),
     configuration_ciphertext=COALESCE($10,configuration_ciphertext),
     updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id`,
   [tenantId,id,x.name,x.label,x.protocol,x.baseUrl,x.authType,x.headerName,encrypted,encryptedConfig]);
  if(!result.rowCount)throw new Error('Credential not found');
  return (await this.list(tenantId,userId)).find(c=>c.id===id);
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
   secret_ciphertext:Buffer|null;enabled:boolean
  }>('SELECT protocol,base_url,auth_type,header_name,secret_ciphertext,enabled FROM md_named_credentials WHERE tenant_id=$1 AND id=$2',
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
  if(item.auth_type!=='None'){
   const encrypted=item.secret_ciphertext;
   const key=this.key();
   if(!encrypted||!key||encrypted.length<29)throw new Error('Named Credential cannot be decrypted');
   const decipher=createDecipheriv('aes-256-gcm',key,encrypted.subarray(0,12));
   decipher.setAuthTag(encrypted.subarray(encrypted.length-16));
   const secret=Buffer.concat([decipher.update(encrypted.subarray(12,encrypted.length-16)),decipher.final()]).toString('utf8');
   if(item.auth_type==='Bearer')header.Authorization='Bearer '+secret;
   else if(item.auth_type==='Basic')header.Authorization='Basic '+Buffer.from(secret).toString('base64');
   else if(item.auth_type==='API Key'){
    if(!/^X-[a-z0-9-]+$/i.test(item.header_name))throw new Error('Credential header must be an X- header');
    header[item.header_name]=secret;
   }else throw new Error('OAuth token exchange is not configured for this credential');
  }
  if(method!=='GET')header['Idempotency-Key']=idempotencyKey;
  if(typeof config.queryParameters==='string'&&config.queryParameters.trim())
    throw new Error('Structured query parameters must be configured through supported mappings');
  const body=typeof config.body==='string'&&config.body.trim()?substitute(config.body):undefined;
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
