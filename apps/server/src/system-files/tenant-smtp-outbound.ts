import nodemailer from 'nodemailer';
import {decryptCredential} from './credential-crypto.js';
import {approvedCredentialEndpoint} from './credential-connection-test.js';
import type {SqlPersistence} from './sql-persistence.js';
const mail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Credential={id:string;protocol:string;base_url:string;enabled:boolean;secret_ciphertext:Buffer|null;
 secret_key_id:string;configuration_ciphertext:Buffer|null;configuration_key_id:string};
export async function sendTenantMail(db:SqlPersistence,tenantId:string,credentialId:string,
 from:string,to:string[],subject:string,body:string){
 if(!mail.test(from)||!to.length||to.length>100||to.some(x=>!mail.test(x))
  ||!subject||subject.length>200||/[\r\n]/.test(subject)||body.length>100000)
  throw Error('Invalid mail payload');
 const {rows}=await db.query<Credential>(`SELECT id,protocol,base_url,enabled,secret_ciphertext,secret_key_id,
 configuration_ciphertext,configuration_key_id FROM md_named_credentials
 WHERE tenant_id=$1 AND id=$2`,[tenantId,credentialId]);
 const c=rows[0];if(!c||!c.enabled||c.protocol!=='SMTP')throw Error('SMTP Named Credential unavailable');
 const endpoint=await approvedCredentialEndpoint(c.base_url,'SMTP');
 const cfg=c.configuration_ciphertext?
  JSON.parse(decryptCredential(c.configuration_ciphertext,c.configuration_key_id)) as Record<string,unknown>:{};
 if(!cfg||typeof cfg!=='object'||Array.isArray(cfg))throw Error('Invalid SMTP credential configuration');
 const user=cfg.username??cfg.user;
 const password=c.secret_ciphertext?decryptCredential(c.secret_ciphertext,c.secret_key_id):cfg.password;
 if(typeof user!=='string'||typeof password!=='string'||!user||!password)
  throw Error('SMTP authentication is not configured');
 const secure=endpoint.url.protocol==='smtps:';
 const transport=nodemailer.createTransport({
  host:endpoint.address,port:endpoint.port,secure,requireTLS:!secure,
  tls:{servername:endpoint.hostname,rejectUnauthorized:true},
  auth:{user,pass:password},
  connectionTimeout:10000,greetingTimeout:10000,socketTimeout:10000
 });
 try{
  const result=await transport.sendMail({from,to,subject,text:body});
  const rejected=result.rejected?.map(String)??[];
  if(rejected.length)throw Error('SMTP rejected one or more recipients');
 }finally{transport.close();}
}
