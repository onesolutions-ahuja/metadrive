import {createHmac,createHash,randomInt,timingSafeEqual} from 'node:crypto';
import type {Express,Request,Response,NextFunction} from 'express';
import {recoveryConfigured,sendRecoveryCode} from './tenant-recovery-mail.js';
import type {SqlPersistence} from './sql-persistence.js';
import {AuthenticationService} from './authentication.js';
const wrap=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req,res).catch(next);};
const generic='If the account exists, a verification code will be sent.';
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const codePattern=/^[0-9]{6}$/;
export function registerPasswordResetRoutes(app:Express,db:SqlPersistence,resolveTenant:(req:Request,slug?:unknown)=>Promise<string|undefined>){
 const auth=new AuthenticationService(db);
 const digest=(tenantId:string,userId:string,otp:string)=>{
  const secret=process.env.METADRIVE_OTP_HMAC_KEY;
  if(!secret||Buffer.byteLength(secret)<32)throw new Error('Password recovery is not configured');
  return createHmac('sha256',secret).update(tenantId+':'+userId+':'+otp).digest('hex');
 };
 app.post('/api/auth/password-reset/request',wrap(async(req,res)=>{
  const email=req.body?.email,slug=req.body?.tenantSlug;
  if(typeof email!=='string'||email.length>254||!emailPattern.test(email))throw Error('Invalid email');
  const secret=process.env.METADRIVE_OTP_HMAC_KEY;
  if(!secret||Buffer.byteLength(secret)<32)throw Error('Password recovery is not configured');
  const tenantId=await resolveTenant(req,slug);
  if(!tenantId){res.json({message:generic});return;}
  if(!(await recoveryConfigured(db,tenantId)))throw Error('Password recovery is not configured');
  const result=await db.query<{id:string}>(
   'SELECT id FROM md_users WHERE tenant_id=$1 AND lower(email)=lower($2) AND enabled=true',[tenantId,email]);
  const id=result.rows[0]?.id;
  if(id){
   const challenge=String(randomInt(0,1000000)).padStart(6,'0');
   const hash=digest(tenantId,id,challenge);
   const stored=await db.query<{user_id:string}>(`
    INSERT INTO md_password_reset_otps(tenant_id,user_id,otp_hash,attempts,expires_at)
    VALUES($1,$2,$3,0,now()+interval '15 minutes')
    ON CONFLICT(tenant_id,user_id) DO UPDATE SET
      otp_hash=EXCLUDED.otp_hash,attempts=0,expires_at=EXCLUDED.expires_at,created_at=now()
    WHERE md_password_reset_otps.created_at<=now()-interval '60 seconds'
    RETURNING user_id`,[tenantId,id,hash]);
   if(stored.rows[0]){
    try {
     await sendRecoveryCode(db,tenantId,email,challenge);
    }catch(error){
     await db.query('DELETE FROM md_password_reset_otps WHERE tenant_id=$1 AND user_id=$2 AND otp_hash=$3',[tenantId,id,hash]);
     throw error;
    }
   }
  }
  res.json({message:generic});
 }));
 app.post('/api/auth/password-reset/confirm',wrap(async(req,res)=>{
  const email=req.body?.email,code=req.body?.token,password=req.body?.newPassword;
  if(typeof email!=='string'||email.length>254||!emailPattern.test(email)
   ||typeof code!=='string'||!codePattern.test(code)||typeof password!=='string'||password.length<12||password.length>1024)
   throw Error('Invalid password recovery request');
  const tenantId=await resolveTenant(req,req.body?.tenantSlug);
  if(!tenantId)throw Error('Invalid or expired verification code');
  const hash=await auth.hashPassword(password);
  await db.transaction(async client=>{
   const row=await client.query<{id:string;otp_hash:string;attempts:number}>(`
    SELECT u.id,r.otp_hash,r.attempts FROM md_users u
    JOIN md_password_reset_otps r ON r.tenant_id=u.tenant_id AND r.user_id=u.id
    WHERE u.tenant_id=$1 AND lower(u.email)=lower($2) AND u.enabled=true
     AND r.expires_at>now() AND r.attempts<5 FOR UPDATE OF r`,[tenantId,email]);
   const item=row.rows[0];
   if(!item)throw Error('Invalid or expired verification code');
   await client.query('UPDATE md_password_reset_otps SET attempts=attempts+1 WHERE tenant_id=$1 AND user_id=$2',
    [tenantId,item.id]);
   const actual=Buffer.from(digest(tenantId,item.id,code),'hex'),expected=Buffer.from(item.otp_hash,'hex');
   if(expected.length!==actual.length||!timingSafeEqual(actual,expected)){
    // Failed attempt must persist; do not roll the transaction back.
    return false;
   }
   await client.query('UPDATE md_users SET password_hash=$3 WHERE tenant_id=$1 AND id=$2',[tenantId,item.id,hash]);
   const emailHash=createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
   await client.query('DELETE FROM md_login_attempt_counters WHERE tenant_id=$1 AND email_hash=$2',
    [tenantId,emailHash]);
   await client.query(`INSERT INTO md_auth_security_events(tenant_id,actor_user_id,action)
    VALUES($1,$2,'password_reset')`,[tenantId,item.id]);
   await client.query('DELETE FROM md_password_reset_otps WHERE tenant_id=$1 AND user_id=$2',[tenantId,item.id]);
   await client.query('UPDATE md_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[tenantId,item.id]);
   await client.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[tenantId,item.id]);
   return true;
  }).then(ok=>{if(!ok)throw Error('Invalid or expired verification code');});
  res.status(204).end();
 }));
}
