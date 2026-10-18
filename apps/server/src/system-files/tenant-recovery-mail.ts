import {createDecipheriv} from 'node:crypto';
import nodemailer from 'nodemailer';
import type {SqlPersistence} from './sql-persistence.js';
const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Settings={smtp_credential_id:string|null;from_email:string;policy:Record<string,unknown>;
 base_url:string|null;secret_ciphertext:Buffer|null;configuration_ciphertext:Buffer|null;enabled:boolean|null};
function decrypt(buffer:Buffer|null):string|null{
 if(!buffer)return null;
 const raw=process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY;
 if(!raw)throw Error('Credential encryption is not configured');
 const key=Buffer.from(raw,'base64');
 if(key.length!==32||buffer.length<29)throw Error('Invalid credential encryption settings');
 const iv=buffer.subarray(0,12),tag=buffer.subarray(buffer.length-16);
 const dec=createDecipheriv('aes-256-gcm',key,iv);dec.setAuthTag(tag);
 return Buffer.concat([dec.update(buffer.subarray(12,buffer.length-16)),dec.final()]).toString('utf8');
}
export async function recoverySettings(db:SqlPersistence,tenantId:string){
 const {rows}=await db.query<Settings>(`
  SELECT s.smtp_credential_id,s.from_email,s.policy,c.base_url,c.secret_ciphertext,
   c.configuration_ciphertext,c.enabled
  FROM md_tenant_password_recovery_settings s
  LEFT JOIN md_named_credentials c ON c.tenant_id=s.tenant_id
   AND c.id=s.smtp_credential_id AND c.protocol='SMTP'
  WHERE s.tenant_id=$1`,[tenantId]);
 const s=rows[0];
 return s??{smtp_credential_id:null,from_email:'',policy:{method:'OTP'},base_url:null,
  secret_ciphertext:null,configuration_ciphertext:null,enabled:null};
}
export async function recoveryConfigured(db:SqlPersistence,tenantId:string){
 const s=await recoverySettings(db,tenantId);
 if(s.smtp_credential_id)return Boolean(s.enabled&&s.base_url&&s.from_email
  &&process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY&&process.env.METADRIVE_OTP_HMAC_KEY);
 return Boolean(process.env.METADRIVE_RESET_SMTP_URL&&process.env.METADRIVE_RESET_FROM_EMAIL
  &&process.env.METADRIVE_OTP_HMAC_KEY);
}
export async function sendRecoveryCode(db:SqlPersistence,tenantId:string,to:string,code:string){
 if(!email.test(to)||!/^[0-9]{6}$/.test(code))throw Error('Invalid password recovery delivery');
 const s=await recoverySettings(db,tenantId);
 let sender=process.env.METADRIVE_RESET_FROM_EMAIL??'';
 let transport:nodemailer.Transporter;
 if(s.smtp_credential_id){
  if(!s.enabled||!s.base_url||!s.from_email)throw Error('Tenant SMTP credential unavailable');
  const url=new URL(s.base_url);
  if(!['smtp:','smtps:'].includes(url.protocol)||!url.hostname||url.username||url.password)
   throw Error('Invalid tenant SMTP endpoint');
  const settings=decrypt(s.configuration_ciphertext);
  const config=settings?JSON.parse(settings) as Record<string,string>:{};
  const username=config.username??config.user;
  const password=decrypt(s.secret_ciphertext)??config.password;
  if(!username||!password)throw Error('Tenant SMTP authentication unavailable');
  transport=nodemailer.createTransport({
   host:url.hostname,port:url.port?Number(url.port):(url.protocol==='smtps:'?465:587),
   secure:url.protocol==='smtps:',requireTLS:url.protocol==='smtp:',
   auth:{user:username,pass:password}
  });
  sender=s.from_email;
 }else{
  const url=process.env.METADRIVE_RESET_SMTP_URL;
  if(!url)throw Error('Password recovery SMTP unavailable');
  transport=nodemailer.createTransport(url);
 }
 if(!email.test(sender))throw Error('Invalid password recovery sender');
 const tenant=await db.query<{name:string}>('SELECT name FROM md_tenants WHERE id=$1',[tenantId]);
 const tenantName=tenant.rows[0]?.name??'MetaDrive';
 const policy=s.policy??{};
 const templates=policy.templates as {email?:{subject?:string;body?:string}}|undefined;
 const substitution=(text:string)=>text
  .replaceAll('{!Tenant.Name}',tenantName)
  .replaceAll('{!Verification.Value}',code)
  .replaceAll('{!Verification.ExpiryMinutes}','15');
 const subject=substitution(templates?.email?.subject??'Your MetaDrive verification code')
  .replace(/[\r\n]/g,' ').slice(0,200);
 const body=substitution(templates?.email?.body??
  'Your verification code is {!Verification.Value}. Expires in {!Verification.ExpiryMinutes} minutes.');
 await transport.sendMail({from:sender,to,subject,text:body});
}
