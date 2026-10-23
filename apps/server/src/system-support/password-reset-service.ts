import {createHash,randomBytes} from 'node:crypto';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {AuthenticationService} from '../system-files/authentication.js';
import {checkPasswordHistory,retainPasswordHistory} from './password-policy-service.js';

const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const emailPattern=/^[^\s@]{1,64}@[^\s@]{1,189}$/;
const acknowledgement='If this account exists, recovery instructions have been sent.';

type Sender=(tenantId:string,credentialId:string,from:string,to:string,subject:string,body:string)=>Promise<void>;

/** Public, tenant-scoped password reset. Tokens never appear in SQL or HTTP responses. */
export class PasswordResetService {
 constructor(private readonly db:SqlPersistence,private readonly auth:AuthenticationService,private readonly send:Sender){}
 async request(tenantId:string,email:unknown){
  if(typeof email!=='string'||email.length>254||!emailPattern.test(email))
   throw new Error('Invalid recovery request');
  const {rows:settings}=await this.db.query<{policy:{method?:string;templates?:{email?:{subject?:string;body?:string}}}}>(
   'SELECT policy FROM md_password_recovery_settings WHERE tenant_id=$1',[tenantId]);
  const policy=settings[0]?.policy??{method:'OTP',templates:{email:{
   subject:'Password recovery',body:'Your verification code is {!Verification.Value}. Expires in {!Verification.ExpiryMinutes} minutes.'
  }}};
  const {rows:users}=await this.db.query<{id:string}>(
   'SELECT id FROM md_users WHERE tenant_id=$1 AND lower(email)=lower($2) AND enabled=true',[tenantId,email]);
  const userId=users[0]?.id;
  if(!userId)return {message:acknowledgement};
  const token=randomBytes(32).toString('base64url');
  const inserted=await this.db.transaction(async client=>{
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[tenantId+':reset:'+userId]);
   const {rows}=await client.query<{requests:string}>(
    "SELECT count(*)::text AS requests FROM md_password_reset_challenges WHERE tenant_id=$1 AND user_id=$2 AND created_at>now()-interval '1 hour'",
    [tenantId,userId]);
   if(Number(rows[0]?.requests??0)>=4)return false;
   await client.query('INSERT INTO md_password_reset_challenges(tenant_id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval \'15 minutes\')',
    [tenantId,userId,digest(token)]);
   return true;
  });
  if(!inserted)return {message:acknowledgement};
  const subject=policy.templates?.email?.subject||'Password recovery';
  const text=policy.templates?.email?.body||'Your verification code is {!Verification.Value}.';
  try{
   let verification=token;
   if(policy.method==='LINK'){
    const configured=process.env.METADRIVE_PASSWORD_RESET_ORIGIN;
    if(!configured)throw new Error('Password recovery link origin is not configured');
    const url=new URL(configured);
    if(url.protocol!=='https:'||url.username||url.password||url.hash)
     throw new Error('Invalid password recovery link origin');
    url.searchParams.set('resetEmail',email);
    url.searchParams.set('resetToken',token);
    verification=url.toString();
   }
   const rendered=(text.includes('{!Verification.Value}')?text:text+'\n{!Verification.Value}')
    .replaceAll('{!Verification.Value}',verification)
    .replaceAll('{!Verification.ExpiryMinutes}','15');
   await this.send(tenantId,'','',email,subject,rendered);
  }catch{
   await this.db.query('DELETE FROM md_password_reset_challenges WHERE tenant_id=$1 AND token_hash=$2',
    [tenantId,digest(token)]);
   // Keep account existence private when link configuration or platform SMTP fails.
   console.error('Password recovery delivery failed for tenant',tenantId);
   return {message:acknowledgement};
  }
  return {message:acknowledgement};
 }
 async confirm(tenantId:string,email:unknown,token:unknown,password:unknown){
  if(typeof email!=='string'||!emailPattern.test(email)||email.length>254||
    typeof token!=='string'||!/^[a-zA-Z0-9_-]{43}$/.test(token)||
    typeof password!=='string'||password.length<12||password.length>1024)
    throw new Error('Invalid or expired recovery token');
  const hash=await this.auth.hashPassword(password);
  await this.db.transaction(async client=>{
   // Match password-change lock order before consuming any of this user's challenges.
   await client.query('SELECT id FROM md_users WHERE tenant_id=$1 AND lower(email)=lower($2) AND enabled=true FOR UPDATE',[tenantId,email]);
   const {rows}=await client.query<{id:string;user_id:string;password_hash:string}>(
    `SELECT c.id,c.user_id,u.password_hash FROM md_password_reset_challenges c
     JOIN md_users u ON u.tenant_id=c.tenant_id AND u.id=c.user_id
     WHERE c.tenant_id=$1 AND c.token_hash=$2 AND lower(u.email)=lower($3)
       AND c.consumed_at IS NULL AND c.expires_at>now() AND u.enabled=true FOR UPDATE OF c,u`,
    [tenantId,digest(token),email]);
   const challenge=rows[0];
   if(!challenge)throw new Error('Invalid or expired recovery token');
   const policy=await checkPasswordHistory(client,tenantId,challenge.user_id,password,challenge.password_hash,this.auth.verifyPassword.bind(this.auth));
   await retainPasswordHistory(client,tenantId,challenge.user_id,challenge.password_hash,policy.history_count);
   await client.query('UPDATE md_users SET password_hash=$3,password_changed_at=now(),failed_login_attempts=0 WHERE tenant_id=$1 AND id=$2',
    [tenantId,challenge.user_id,hash]);
   for(const table of ['md_sessions','md_refresh_sessions'])
    await client.query('UPDATE '+table+' SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',
     [tenantId,challenge.user_id]);
   await client.query('UPDATE md_password_reset_challenges SET consumed_at=now() WHERE tenant_id=$1 AND user_id=$2 AND consumed_at IS NULL',
    [tenantId,challenge.user_id]);
   await client.query('UPDATE md_mfa_login_challenges SET consumed_at=now() WHERE tenant_id=$1 AND user_id=$2 AND consumed_at IS NULL',[tenantId,challenge.user_id]);
   await client.query('INSERT INTO md_security_events(tenant_id,actor_user_id,subject_user_id,action) VALUES($1,$2,$2,$3)',
    [tenantId,challenge.user_id,'PasswordResetCompleted']);
  });
  return {message:'Password changed. Sign in again.'};
 }
}
