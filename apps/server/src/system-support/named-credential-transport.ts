import nodemailer from 'nodemailer';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import {decryptStoredCredential} from './mfa-crypto.js';
import {publicConnectionAddress} from './public-connection-address.js';
export type EncryptedNamedCredential={id:string;base_url:string;auth_type:string;secret_ciphertext:Buffer|null;
 configuration_ciphertext:Buffer|null;protocol:string;header_name:string};
export async function credentialRow(db:SqlPersistence,tenantId:string,id:string){
 const {rows}=await db.query<EncryptedNamedCredential>(
  'SELECT id,base_url,auth_type,secret_ciphertext,configuration_ciphertext,protocol,header_name FROM md_named_credentials WHERE tenant_id=$1 AND id=$2 AND enabled=true',
  [tenantId,id]);
 if(!rows[0])throw new Error('Credential not found');
 return rows[0];
}
export function credentialConfig(row:EncryptedNamedCredential){
 if(!row.configuration_ciphertext)return {} as Record<string,string>;
 const decoded=JSON.parse(decryptStoredCredential(row.configuration_ciphertext)) as unknown;
 if(!decoded||typeof decoded!=='object'||Array.isArray(decoded)||
    Object.values(decoded).some(v=>typeof v!=='string'))throw new Error('Invalid credential configuration');
 return decoded as Record<string,string>;
}
export async function openSmtpTransport(db:SqlPersistence,tenantId:string,id:string){
 const credential=await credentialRow(db,tenantId,id);
 if(credential.protocol!=='SMTP')throw new Error('Invalid SMTP credential');
 const url=new URL(credential.base_url);
 if(!['smtp:','smtps:'].includes(url.protocol)||!url.hostname||url.username||url.password)
  throw new Error('Invalid SMTP credential');
 const port=url.port?Number(url.port):url.protocol==='smtps:'?465:587;
 if(![465,587].includes(port))throw new Error('Invalid SMTP security settings');
 const ip=await publicConnectionAddress(url.hostname);
 const config=credentialConfig(credential);
 const user=config.username??config.user;
 const password=credential.secret_ciphertext?decryptStoredCredential(credential.secret_ciphertext):'';
 if(credential.auth_type!=='None'&&(!user||!password))throw new Error('SMTP authentication incomplete');
 return nodemailer.createTransport({
  host:ip.address,port,secure:port===465,requireTLS:port===587,
  tls:{servername:url.hostname,rejectUnauthorized:true},
  connectionTimeout:8000,greetingTimeout:8000,socketTimeout:12000,
  ...(credential.auth_type==='None'?{}:{auth:{user,pass:password}})
 });
}
