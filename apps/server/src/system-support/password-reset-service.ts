import {createHash,randomBytes} from 'node:crypto';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {AuthenticationService} from '../system-files/authentication.js';

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
  const {rows:settings}=await this.db.query<{smtp_credential_id:string|null;from_email:string;policy:{method?:string;templates?:{email?:{subject?:string;body?:string}}}}>(
   'SELECT smtp_credential_id,from_email,policy FROM md_password_recovery_settings WHERE tenant_id=$1',[tenantId]);
  const setting=settings[0];
  if(!setting?.smtp_credential_id||!emailPattern.test(setting.from_email))
   throw new Error('Password recovery delivery is not configured');
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
  const subject=setting.policy?.templates?.email?.subject||'Password recovery';
  const text=setting.policy?.templates?.email?.body||'Your verification code is {!Verification.Value}.';
  let verification=token;
  if(setting.policy?.method==='LINK'){
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
  try {await this.send(tenantId,setting.smtp_credential_id,setting.from_email,email,
    subject,rendered);}
  catch(error){
   await this.db.query('DELETE FROM md_password_reset_challenges WHERE tenant_id=$1 AND token_hash=$2',
    [tenantId,digest(token)]);
   throw new Error('Recovery email delivery failed');
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
   const {rows}=await client.query<{id:string;user_id:string}>(
    `SELECT c.id,c.user_id FROM md_password_reset_challenges c
     JOIN md_users u ON u.tenant_id=c.tenant_id AND u.id=c.user_id
     WHERE c.tenant_id=$1 AND c.token_hash=$2 AND lower(u.email)=lower($3)
       AND c.consumed_at IS NULL AND c.expires_at>now() AND u.enabled=true FOR UPDATE OF c`,
    [tenantId,digest(token),email]);
   const challenge=rows[0];
   if(!challenge)throw new Error('Invalid or expired recovery token');
   await client.query('UPDATE md_users SET password_hash=$3 WHERE tenant_id=$1 AND id=$2',
    [tenantId,challenge.user_id,hash]);
   for(const table of ['md_sessions','md_refresh_sessions'])
    await client.query('UPDATE '+table+' SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',
     [tenantId,challenge.user_id]);
   await client.query('UPDATE md_password_reset_challenges SET consumed_at=now() WHERE tenant_id=$1 AND id=$2',
    [tenantId,challenge.id]);
   await client.query('INSERT INTO md_security_events(tenant_id,actor_user_id,subject_user_id,action) VALUES($1,$2,$2,$3)',
    [tenantId,challenge.user_id,'PasswordResetCompleted']);
  });
  return {message:'Password changed. Sign in again.'};
 }
}
