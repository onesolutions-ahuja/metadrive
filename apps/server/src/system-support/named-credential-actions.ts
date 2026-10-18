import {createDecipheriv} from 'node:crypto';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
import {encryptMfaSecret,decryptStoredCredential} from './mfa-crypto.js';
import {credentialConfig,credentialRow,openSmtpTransport} from './named-credential-transport.js';
import {probePublicHttps} from './secure-https-probe.js';
import {NamedCredentialService} from './named-credential-service.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function oldKeys(){
 const ring=process.env.METADRIVE_CREDENTIAL_KEYS;
 if(!ring||!process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID)
  throw new Error('Credential keyring is not configured');
 const parsed=JSON.parse(ring) as Record<string,string>;
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
  throw new Error('Invalid credential keyring');
 const keys=Object.entries(parsed).map(([id,raw])=>({id,key:Buffer.from(raw,'base64')}))
  .filter(k=>k.key.length===32);
 const legacy=process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY;
 if(legacy){
  const key=Buffer.from(legacy,'base64');
  if(key.length===32)keys.push({id:'legacy',key});
 }
 return keys;
}
function decryptWith(ciphertext:Buffer,key:Buffer){
 if(ciphertext.length<29)throw new Error('Invalid ciphertext');
 const decipher=createDecipheriv('aes-256-gcm',key,ciphertext.subarray(0,12));
 decipher.setAuthTag(ciphertext.subarray(-16));
 return Buffer.concat([decipher.update(ciphertext.subarray(12,-16)),decipher.final()]).toString('utf8');
}
function tryKeys(ciphertext:Buffer,keys:ReturnType<typeof oldKeys>){
 for(const item of keys){
  try{return {plain:decryptWith(ciphertext,item.key),keyId:item.id};}catch{}
 }
 throw new Error('Credential ciphertext cannot be decrypted with configured keys');
}
export class NamedCredentialActions {
 constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine){}
 async test(tenantId:string,userId:string,id:string){
  if(!uuid.test(id))throw new Error('Invalid credential ID');
  await this.rbac.require(tenantId,userId,'NamedCredential','manage');
  const row=await credentialRow(this.db,tenantId,id);
  if(row.protocol==='SMTP'){
   const transport=await openSmtpTransport(this.db,tenantId,id);
   try{await transport.verify();return {connected:true,message:'SMTP TLS connection and authentication verified'};}
   finally{transport.close();}
  }
  if(row.protocol!=='HTTPS')throw new Error('Unsupported credential protocol');
  const secret=row.secret_ciphertext?decryptStoredCredential(row.secret_ciphertext):'';
  const configuration=credentialConfig(row);
  const headers:Record<string,string>={};
  switch(row.auth_type){
   case 'None':break;
   case 'Bearer':
    if(!secret)throw new Error('Credential secret missing');
    headers.Authorization='Bearer '+secret;break;
   case 'Basic':
    if(!configuration.username||!secret)throw new Error('Credential authentication incomplete');
    headers.Authorization='Basic '+Buffer.from(configuration.username+':'+secret).toString('base64');break;
   case 'API Key':
    if(!secret||!/^[A-Za-z][A-Za-z0-9-]{0,70}$/.test(row.header_name))
     throw new Error('Invalid credential header');
    headers[row.header_name]=secret;break;
   default:throw new Error('Credential authentication requires an OAuth token');
  }
  return probePublicHttps(row.base_url,headers);
 }
 async rotate(tenantId:string,userId:string,id:string){
  if(!uuid.test(id))throw new Error('Invalid credential ID');
  await this.rbac.require(tenantId,userId,'NamedCredential','manage');
  await this.rbac.require(tenantId,userId,'NamedCredential','read');
  const keys=oldKeys(),activeId=process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID!;
  const {rows}=await this.db.query<{secret_ciphertext:Buffer|null;configuration_ciphertext:Buffer|null}>(
   'SELECT secret_ciphertext,configuration_ciphertext FROM md_named_credentials WHERE tenant_id=$1 AND id=$2 AND enabled=true',
   [tenantId,id]);
  if(!rows[0])throw new Error('Credential not found');
  const secret=rows[0].secret_ciphertext?tryKeys(rows[0].secret_ciphertext,keys):null;
  const config=rows[0].configuration_ciphertext?tryKeys(rows[0].configuration_ciphertext,keys):null;
  if(!secret&&!config)throw new Error('Credential contains no encrypted secret');
  if([secret,config].filter(Boolean).every(part=>part?.keyId===activeId))
   throw new Error('Credential already uses the active encryption key');
  const newSecret=secret?encryptMfaSecret(secret.plain).encrypted:null;
  const newConfig=config?encryptMfaSecret(config.plain).encrypted:null;
  await this.db.transaction(async client=>{
   await client.query(`
    UPDATE md_named_credentials SET secret_ciphertext=$3,configuration_ciphertext=$4,updated_at=now()
    WHERE tenant_id=$1 AND id=$2`,[tenantId,id,newSecret,newConfig]);
   await client.query("INSERT INTO md_security_events(tenant_id,actor_user_id,action,details) VALUES($1,$2,'credential.rotate',jsonb_build_object('credentialId',$3::text))",
    [tenantId,userId,id]);
  });
  const credential=(await new NamedCredentialService(this.db,this.rbac).list(tenantId,userId)).find(c=>c.id===id);
  if(!credential)throw new Error('Credential not found');
  return {credential};
 }
}
