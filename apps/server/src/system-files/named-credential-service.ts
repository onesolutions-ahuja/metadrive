import {createCipheriv,randomBytes} from 'node:crypto';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';

/** Tenant-scoped encrypted named credentials. Never disclose stored secret material. */
export class NamedCredentialService {
 constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine){}
 private key() {
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
  if(x.configuration && Object.keys(x.configuration as object).length)throw new Error('Credential configuration requires encrypted field mapping');
  const secret=x.secret;
  if(secret!==undefined && typeof secret!=='string')throw new Error('Invalid credential secret');
  const key=secret?this.key():null;
  if(secret&&!key)throw new Error('Credential encryption is not configured');
  let encrypted:Buffer|null=null;
  if(secret&&key) {
   const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
   encrypted=Buffer.concat([iv,cipher.update(secret,'utf8'),cipher.final(),cipher.getAuthTag()]);
  }
  const {rows}=await this.db.query<{id:string}>(
   'INSERT INTO md_named_credentials(tenant_id,name,label,protocol,base_url,auth_type,header_name,secret_ciphertext,enabled) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
   [tenantId,x.name,x.label,x.protocol,x.baseUrl,x.authType,x.headerName,encrypted,x.enabled!==false]);
  return {id:rows[0].id,name:x.name};
 }
}
