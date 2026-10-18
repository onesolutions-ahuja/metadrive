import {activeCredentialKey,encryptCredential,decryptCredential} from './credential-crypto.js';
import {testHttpsCredential,testSmtpCredential} from './credential-connection-test.js';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';

/** Tenant-scoped encrypted named credentials. Never disclose stored secret material. */
export class NamedCredentialService {
 constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine){}
 private key(){try{return activeCredentialKey().key;}catch{return null;}}
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
  const encrypted=secret?encryptCredential(secret):null;
  const config=x.configuration as Record<string,string>|undefined;
  const encryptedConfiguration=config&&Object.keys(config).length?
   encryptCredential(JSON.stringify(config)):null;
  const {rows}=await this.db.query<{id:string}>(
   'INSERT INTO md_named_credentials(tenant_id,name,label,protocol,base_url,auth_type,header_name,secret_ciphertext,configuration_ciphertext,enabled,secret_key_id,configuration_key_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',
   [tenantId,x.name,x.label,x.protocol,x.baseUrl,x.authType,x.headerName,encrypted?.ciphertext??null,encryptedConfiguration?.ciphertext??null,x.enabled!==false,encrypted?.keyId??'legacy',encryptedConfiguration?.keyId??'legacy']);
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
  const encrypted=x.secret?encryptCredential(x.secret as string):null;
  const configuration=x.configuration as Record<string,string>|undefined;
  const encryptedConfig=configuration&&Object.keys(configuration).length?
   encryptCredential(JSON.stringify(configuration)):null;
  const result=await this.db.query(
   `UPDATE md_named_credentials SET name=$3,label=$4,protocol=$5,base_url=$6,
     auth_type=$7,header_name=$8,
     secret_ciphertext=COALESCE($9,secret_ciphertext),
     configuration_ciphertext=COALESCE($10,configuration_ciphertext),
     secret_key_id=CASE WHEN $9::bytea IS NULL THEN secret_key_id ELSE $11 END,
     configuration_key_id=CASE WHEN $10::bytea IS NULL THEN configuration_key_id ELSE $12 END,
     updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id`,
   [tenantId,id,x.name,x.label,x.protocol,x.baseUrl,x.authType,x.headerName,encrypted?.ciphertext??null,encryptedConfig?.ciphertext??null,encrypted?.keyId??'legacy',encryptedConfig?.keyId??'legacy']);
  if(!result.rowCount)throw new Error('Credential not found');
  return (await this.list(tenantId,userId)).find(c=>c.id===id);
 }

 async rotate(tenantId:string,userId:string,id:string){
  await this.rbac.require(tenantId,userId,'NamedCredential','manage');
  if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('Invalid credential ID');
  activeCredentialKey();
  await this.db.transaction(async client=>{
   const {rows}=await client.query<{
    secret_ciphertext:Buffer|null;configuration_ciphertext:Buffer|null;
    secret_key_id:string;configuration_key_id:string
   }>('SELECT secret_ciphertext,configuration_ciphertext,secret_key_id,configuration_key_id FROM md_named_credentials WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
   const current=rows[0];
   if(!current)throw Error('Credential not found');
   if(!current.secret_ciphertext&&!current.configuration_ciphertext)throw Error('Credential contains no encrypted data');
   const secret=current.secret_ciphertext?encryptCredential(decryptCredential(current.secret_ciphertext,current.secret_key_id)):null;
   const config=current.configuration_ciphertext?encryptCredential(decryptCredential(current.configuration_ciphertext,current.configuration_key_id)):null;
   if((!secret||secret.keyId===current.secret_key_id)&&(!config||config.keyId===current.configuration_key_id))
    throw Error('Credential already encrypted with active key');
   await client.query(`UPDATE md_named_credentials
    SET secret_ciphertext=$3,configuration_ciphertext=$4,
     secret_key_id=$5,configuration_key_id=$6,updated_at=now()
    WHERE tenant_id=$1 AND id=$2`,
    [tenantId,id,secret?.ciphertext??null,config?.ciphertext??null,
     secret?.keyId??current.secret_key_id,config?.keyId??current.configuration_key_id]);
   await client.query('INSERT INTO md_tenant_security_events(tenant_id,actor_id,event_type) VALUES($1,$2,$3)',
    [tenantId,userId,'named_credential_key_rotated']);
  });
  const credential=(await this.list(tenantId,userId)).find(x=>x.id===id);
  if(!credential)throw Error('Credential not found');
  return credential;
 }

 async test(tenantId:string,userId:string,id:string){
  await this.rbac.require(tenantId,userId,'NamedCredential','manage');
  if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('Invalid credential ID');
  const {rows}=await this.db.query<{
   protocol:string;base_url:string;auth_type:string;header_name:string;enabled:boolean;
   secret_ciphertext:Buffer|null;configuration_ciphertext:Buffer|null;
   secret_key_id:string;configuration_key_id:string
  }>(`SELECT protocol,base_url,auth_type,header_name,enabled,secret_ciphertext,
      configuration_ciphertext,secret_key_id,configuration_key_id
      FROM md_named_credentials WHERE tenant_id=$1 AND id=$2`,[tenantId,id]);
  const current=rows[0];if(!current)throw Error('Credential not found');
  if(!current.enabled)throw Error('Credential disabled');
  const secret=current.secret_ciphertext?
   decryptCredential(current.secret_ciphertext,current.secret_key_id):null;
  const configuration=current.configuration_ciphertext?
   JSON.parse(decryptCredential(current.configuration_ciphertext,current.configuration_key_id)) as Record<string,string>:{};
  if(!configuration||typeof configuration!=='object'||Array.isArray(configuration))
   throw Error('Credential configuration unavailable');
  try{
   if(current.protocol==='HTTPS')return await testHttpsCredential(current.base_url,current.auth_type,secret,current.header_name);
   if(current.protocol==='SMTP')return await testSmtpCredential(current.base_url,configuration,secret);
   throw Error('Unsupported protocol');
  }catch(error){
   const message=error instanceof Error&&/^(?:Unsafe credential endpoint|Credential host must be approved|Credential DNS resolves|OAuth credentials require)/.test(error.message)
    ?error.message:'Credential connection test failed';
   return {connected:false,message};
  }
 }

}
