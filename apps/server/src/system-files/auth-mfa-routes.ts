import {createHash,randomBytes} from 'node:crypto';
import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
import {AuthenticationService} from './authentication.js';
import {base32Encode,encryptTotp,decryptTotp,matchingTotpStep,totpKey} from './totp-security.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(fn:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req as Req,res).catch(next);};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function registerProtectedMfaRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 const auth=new AuthenticationService(db);
 const mode=async(tenantId:string)=>{
  const {rows}=await db.query<{mode:string}>('SELECT mode FROM md_tenant_mfa_policy WHERE tenant_id=$1',[tenantId]);
  return rows[0]?.mode??'Disabled';
 };
 const verifyPassword=async(tenantId:string,userId:string,password:unknown)=>{
  if(typeof password!=='string')throw Error('Current password required');
  const {rows}=await db.query<{password_hash:string}>(
   'SELECT password_hash FROM md_users WHERE tenant_id=$1 AND id=$2 AND enabled=true',[tenantId,userId]);
  if(!rows[0]||!(await auth.verifyPassword(password,rows[0].password_hash)))throw Error('Invalid credentials');
 };
 app.get('/api/auth/mfa/status',wrap(async(req,res)=>{
  const a=req.actor!;
  const [setting,credential]=await Promise.all([
   mode(a.tenant_id),
   db.query<{pending:boolean}>('SELECT pending FROM md_user_totp WHERE tenant_id=$1 AND user_id=$2',
    [a.tenant_id,a.user_id])
  ]);
  res.json({mode:setting,enrolled:credential.rows[0]?.pending===false,available:Boolean(process.env.METADRIVE_MFA_ENCRYPTION_KEY)});
 }));
 app.get('/api/auth/mfa/policy',wrap(async(req,res)=>{
  const a=req.actor!;await rbac.require(a.tenant_id,a.user_id,'Tenant','edit');
  res.json({mode:await mode(a.tenant_id)});
 }));
 app.put('/api/auth/mfa/policy',wrap(async(req,res)=>{
  const a=req.actor!,next=req.body?.mode;
  await rbac.require(a.tenant_id,a.user_id,'Tenant','edit');
  if(!['Disabled','Optional','Required'].includes(next))throw Error('Invalid MFA policy');
  if(next!=='Disabled')totpKey();
  await db.transaction(async client=>{
   if(next==='Required'){
    const pending=await client.query(`
     SELECT 1 FROM md_users u WHERE u.tenant_id=$1 AND u.enabled=true
      AND NOT EXISTS(SELECT 1 FROM md_user_totp t WHERE t.tenant_id=u.tenant_id
       AND t.user_id=u.id AND t.pending=false) LIMIT 1`,[a.tenant_id]);
    if(pending.rowCount)throw Error('All active users must enroll before requiring MFA');
   }
   await client.query(`INSERT INTO md_tenant_mfa_policy(tenant_id,mode) VALUES($1,$2)
     ON CONFLICT(tenant_id) DO UPDATE SET mode=EXCLUDED.mode`,[a.tenant_id,next]);
   await client.query('UPDATE md_sessions SET revoked_at=now() WHERE tenant_id=$1 AND revoked_at IS NULL',[a.tenant_id]);
   await client.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE tenant_id=$1 AND revoked_at IS NULL',[a.tenant_id]);
  });
  res.json({mode:next});
 }));
 app.post('/api/auth/mfa/enroll',wrap(async(req,res)=>{
  const a=req.actor!;totpKey();
  await verifyPassword(a.tenant_id,a.user_id,req.body?.password);
  const existing=await db.query<{pending:boolean}>(
   'SELECT pending FROM md_user_totp WHERE tenant_id=$1 AND user_id=$2',[a.tenant_id,a.user_id]);
  if(existing.rows[0]?.pending===false)throw Error('MFA already enrolled');
  const secret=base32Encode(randomBytes(20)),token=randomBytes(32).toString('base64url');
  await db.query(`INSERT INTO md_user_totp
    (tenant_id,user_id,secret_ciphertext,pending,pending_token_hash,enrollment_expires_at,last_counter,enrollment_attempts)
    VALUES($1,$2,$3,true,$4,now()+interval '10 minutes',-1,0)
    ON CONFLICT(tenant_id,user_id) DO UPDATE SET
     secret_ciphertext=EXCLUDED.secret_ciphertext,pending=true,
     pending_token_hash=EXCLUDED.pending_token_hash,
     enrollment_expires_at=EXCLUDED.enrollment_expires_at,
     last_counter=-1,enrollment_attempts=0
     WHERE md_user_totp.pending=true`,
    [a.tenant_id,a.user_id,encryptTotp(secret),hash(token)]);
  res.json({enrollment_token:token,setup_secret:secret});
 }));
 app.post('/api/auth/mfa/enroll/confirm',wrap(async(req,res)=>{
  const a=req.actor!,token=req.body?.enrollment_token,code=req.body?.code;
  if(typeof token!=='string'||typeof code!=='string'||!/^[0-9]{6}$/.test(code))
   throw Error('Invalid MFA enrollment code');
  const accepted=await db.transaction(async client=>{
   const {rows}=await client.query<{secret_ciphertext:Buffer;last_counter:string}>(`
    SELECT secret_ciphertext,last_counter::text FROM md_user_totp
    WHERE tenant_id=$1 AND user_id=$2 AND pending=true AND pending_token_hash=$3
     AND enrollment_expires_at>now() AND enrollment_attempts<5 FOR UPDATE`,
    [a.tenant_id,a.user_id,hash(token)]);
   if(!rows[0])return false;
   await client.query('UPDATE md_user_totp SET enrollment_attempts=enrollment_attempts+1 WHERE tenant_id=$1 AND user_id=$2',
    [a.tenant_id,a.user_id]);
   const step=matchingTotpStep(decryptTotp(rows[0].secret_ciphertext),code);
   if(step===null)return false;
   await client.query(`UPDATE md_user_totp SET pending=false,pending_token_hash=NULL,
     enrollment_expires_at=NULL,last_counter=$3,enrollment_attempts=0 WHERE tenant_id=$1 AND user_id=$2`,
    [a.tenant_id,a.user_id,step]);
   await client.query('UPDATE md_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[a.tenant_id,a.user_id]);
   await client.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[a.tenant_id,a.user_id]);
   return true;
  });
  if(!accepted)throw Error('Invalid MFA enrollment code');
  res.json({enrolled:true});
 }));
 app.post('/api/auth/mfa/disable',wrap(async(req,res)=>{
  const a=req.actor!,code=req.body?.code;
  if(await mode(a.tenant_id)==='Required')throw Error('Required MFA cannot be disabled');
  await verifyPassword(a.tenant_id,a.user_id,req.body?.password);
  if(typeof code!=='string'||!/^[0-9]{6}$/.test(code))throw Error('Invalid MFA code');
  const removed=await db.transaction(async client=>{
   const {rows}=await client.query<{secret_ciphertext:Buffer;last_counter:string}>(`
    SELECT secret_ciphertext,last_counter::text FROM md_user_totp
    WHERE tenant_id=$1 AND user_id=$2 AND pending=false FOR UPDATE`,[a.tenant_id,a.user_id]);
   if(!rows[0])return false;
   const counter=matchingTotpStep(decryptTotp(rows[0].secret_ciphertext),code,Number(rows[0].last_counter));
   if(counter===null)return false;
   await client.query('DELETE FROM md_user_totp WHERE tenant_id=$1 AND user_id=$2',[a.tenant_id,a.user_id]);
   await client.query('DELETE FROM md_mfa_login_challenges WHERE tenant_id=$1 AND user_id=$2',[a.tenant_id,a.user_id]);
   await client.query('UPDATE md_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[a.tenant_id,a.user_id]);
   await client.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[a.tenant_id,a.user_id]);
   return true;
  });
  if(!removed)throw Error('Invalid MFA code');
  res.json({enrolled:false});
 }));
}
