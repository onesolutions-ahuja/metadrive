import {randomBytes} from 'node:crypto';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {AuthenticationService} from '../system-files/authentication.js';
import {secureRecoveryHash} from './mfa-crypto.js';
import {openSmtpTransport} from './named-credential-transport.js';
type Settings={smtp_credential_id:string|null;from_email:string;policy:{
 method:'OTP'|'LINK';templates?:{email?:{subject:string;body:string}}}};
 configuration_ciphertext:Buffer|null;protocol:string};
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const response={message:'If the account has password recovery enabled, verification instructions will be emailed.'};
function render(text:string,tenant:string,code:string){
 return text.replaceAll('{!Tenant.Name}',tenant).replaceAll('{!Verification.Value}',code)
  .replaceAll('{!Verification.ExpiryMinutes}','15');
}
export class PasswordResetService {
 constructor(private readonly db:SqlPersistence,private readonly auth:AuthenticationService){}
 private async settings(tenant:string){
  const {rows}=await this.db.query<Settings>(
   'SELECT smtp_credential_id,from_email,policy FROM md_password_recovery_settings WHERE tenant_id=$1',
   [tenant]);return rows[0];
 }
 private async send(tenantId:string,userEmail:string,code:string,settings:Settings,tenantName:string){
  if(!settings.smtp_credential_id||!settings.from_email)return false;
  const transport=await openSmtpTransport(this.db,tenantId,settings.smtp_credential_id);
  const template=settings.policy.templates?.email;
  const subject=render(template?.subject??'{!Tenant.Name} account recovery',tenantName,code);
  const body=render(template?.body??'Your recovery code is {!Verification.Value}. It expires in 15 minutes.',tenantName,code);
  if(subject.length>500||body.length>10000)throw new Error('Invalid recovery template');
  await transport.sendMail({from:settings.from_email,to:userEmail,subject,text:body});
  transport.close();
  return true;
 }
 async request(tenantId:string,email:unknown){
  if(typeof email!=='string'||email.length>254||!emailPattern.test(email))throw new Error('Invalid email');
  const canonical=email.trim().toLowerCase(),hash=secureRecoveryHash(tenantId+':'+canonical);
  const throttle=await this.db.query<{request_count:number}>(`
   INSERT INTO md_password_reset_throttle(tenant_id,email_hash,request_count,window_start)
   VALUES($1,$2,1,now())
   ON CONFLICT(tenant_id,email_hash) DO UPDATE
   SET request_count=CASE WHEN md_password_reset_throttle.window_start<now()-interval '1 hour'
     THEN 1 ELSE md_password_reset_throttle.request_count+1 END,
     window_start=CASE WHEN md_password_reset_throttle.window_start<now()-interval '1 hour'
     THEN now() ELSE md_password_reset_throttle.window_start END
   RETURNING request_count`,[tenantId,hash]);
  if(Number(throttle.rows[0]?.request_count)>5)return response;
  const {rows:users}=await this.db.query<{id:string;email:string}>(
   'SELECT id,email FROM md_users WHERE tenant_id=$1 AND lower(email)=lower($2) AND enabled=true AND (locked_until IS NULL OR locked_until<=now())',
   [tenantId,canonical]);
  const user=users[0],settings=await this.settings(tenantId);
  if(!user||!settings?.smtp_credential_id)return response;
  const {rows:tenants}=await this.db.query<{name:string}>('SELECT name FROM md_tenants WHERE id=$1 AND status=\'ACTIVE\'',[tenantId]);
  if(!tenants[0])return response;
  const method=settings.policy?.method==='LINK'?'LINK':'OTP';
  let code=method==='LINK'?randomBytes(32).toString('base64url'):String(randomBytes(4).readUInt32BE(0)%1_000_000).padStart(6,'0');
  if(method==='LINK'){
   const origin=process.env.METADRIVE_PASSWORD_RESET_ORIGIN;
   if(!origin)return response;
   const url=new URL(origin);
   if(url.protocol!=='https:'||url.username||url.password)return response;
   url.searchParams.set('resetEmail',user.email);
   url.searchParams.set('resetToken',code);
   code=url.toString();
  }
  const suppliedToken=method==='LINK'?(new URL(code)).searchParams.get('resetToken')!:code;
  const fingerprint=secureRecoveryHash(tenantId+':'+user.id+':'+suppliedToken);
  const {rows:existing}=await this.db.query<{requested_at:Date}>(
   'SELECT requested_at FROM md_password_reset_requests WHERE tenant_id=$1 AND user_id=$2',
   [tenantId,user.id]);
  if(existing[0]&&Date.now()-new Date(existing[0].requested_at).getTime()<60_000)return response;
  await this.db.query(`
   INSERT INTO md_password_reset_requests(tenant_id,user_id,token_hash,method,expires_at)
   VALUES($1,$2,$3,$4,now()+interval '15 minutes')
   ON CONFLICT(tenant_id,user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,
    method=EXCLUDED.method,expires_at=EXCLUDED.expires_at,
    requested_at=now(),attempts=0,delivered_at=NULL`,
   [tenantId,user.id,fingerprint,method]);
  try{
   if(await this.send(tenantId,user.email,code,settings,tenants[0].name))
    await this.db.query('UPDATE md_password_reset_requests SET delivered_at=now() WHERE tenant_id=$1 AND user_id=$2 AND token_hash=$3',
     [tenantId,user.id,fingerprint]);
  }catch(error){
   console.error('Password recovery delivery failed',{tenantId,error:error instanceof Error?error.message:'Unknown SMTP error'});
   await this.db.query('DELETE FROM md_password_reset_requests WHERE tenant_id=$1 AND user_id=$2 AND token_hash=$3',
    [tenantId,user.id,fingerprint]);
  }
  return response;
 }
 async confirm(tenantId:string,email:unknown,token:unknown,newPassword:unknown){
  if(typeof email!=='string'||!emailPattern.test(email)||email.length>254||
   typeof token!=='string'||!(/^[0-9]{6}$/.test(token)||/^[a-zA-Z0-9_-]{40,64}$/.test(token))||
   typeof newPassword!=='string'||newPassword.length<12||newPassword.length>1024)
   throw new Error('Invalid reset request');
  const {rows:users}=await this.db.query<{id:string}>(
   'SELECT id FROM md_users WHERE tenant_id=$1 AND lower(email)=lower($2) AND enabled=true',
   [tenantId,email.trim().toLowerCase()]);
  const userId=users[0]?.id;if(!userId)throw new Error('Invalid reset token');
  const fingerprint=secureRecoveryHash(tenantId+':'+userId+':'+token);
  const {rows:attempted}=await this.db.query<{token_hash:string;delivered_at:Date|null}>(`
   UPDATE md_password_reset_requests SET attempts=attempts+1
   WHERE tenant_id=$1 AND user_id=$2 AND attempts<5 AND expires_at>now()
   RETURNING token_hash,delivered_at`,[tenantId,userId]);
  if(!attempted[0]||!attempted[0].delivered_at||attempted[0].token_hash!==fingerprint)
   throw new Error('Invalid reset token');
  const hash=await this.auth.hashPassword(newPassword);
  await this.db.transaction(async client=>{
   const claim=await client.query('DELETE FROM md_password_reset_requests WHERE tenant_id=$1 AND user_id=$2 AND token_hash=$3 AND attempts<=5 AND expires_at>now() AND delivered_at IS NOT NULL RETURNING user_id',
    [tenantId,userId,fingerprint]);
   if(!claim.rowCount)throw new Error('Invalid reset token');
   await client.query('UPDATE md_users SET password_hash=$3 WHERE tenant_id=$1 AND id=$2',[tenantId,userId,hash]);
   await client.query('UPDATE md_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2',[tenantId,userId]);
   await client.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2',[tenantId,userId]);
   await client.query("INSERT INTO md_security_events(tenant_id,actor_user_id,action) VALUES($1,$2,'password.reset')",[tenantId,userId]);
  });
  return {message:'Password reset completed. Sign in again.'};
 }
}
