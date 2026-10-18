import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import {AuthenticationService} from './authentication.js';
import {recoverySettings,recoveryConfigured} from './tenant-recovery-mail.js';
import type {RbacEngine} from './rbac-engine.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(fn:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req as Req,res).catch(next);};
/** SQL auth settings reflect actual capabilities. Never claim MFA/recovery is ready without a provider. */
export function registerAuthSqlRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 const auth=new AuthenticationService(db);
 app.get('/api/auth/sessions',wrap(async(req,res)=>{
  const a=req.actor!;
  const {rows}=await db.query<{id:string;expires_at:Date}>(
   'SELECT id,expires_at FROM md_refresh_sessions WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now() ORDER BY expires_at DESC LIMIT 100',
   [a.tenant_id,a.user_id]);
  res.json({sessions:rows.map(r=>({familyId:r.id,expiresAt:new Date(r.expires_at).getTime(),mfaVerified:false}))});
 }));
 app.post('/api/auth/sessions/revoke-all',wrap(async(req,res)=>{
  const a=req.actor!,pwd=req.body?.currentPassword;
  if(typeof pwd!=='string'||!pwd)throw Error('Current password required');
  const {rows}=await db.query<{password_hash:string}>(
   'SELECT password_hash FROM md_users WHERE tenant_id=$1 AND id=$2 AND enabled=true',[a.tenant_id,a.user_id]);
  if(!rows[0]||!(await auth.verifyPassword(pwd,rows[0].password_hash)))throw Error('Invalid credentials');
  await db.transaction(async client=>{
   await client.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[a.tenant_id,a.user_id]);
   await client.query('UPDATE md_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[a.tenant_id,a.user_id]);
  });
  res.status(204).end();
 }));
 app.get('/api/auth/users',wrap(async(req,res)=>{
  const a=req.actor!;
  await rbac.require(a.tenant_id,a.user_id,'User','read');
  const {rows}=await db.query<{id:string;email:string;enabled:boolean}>(
   'SELECT id,email,enabled FROM md_users WHERE tenant_id=$1 ORDER BY email LIMIT 200',[a.tenant_id]);
  res.json({users:rows.map(x=>({id:x.id,email:x.email,enabled:x.enabled}))});
 }));
 app.patch('/api/auth/users/:id/enabled',wrap(async(req,res)=>{
  const a=req.actor!;
  await rbac.require(a.tenant_id,a.user_id,'User','edit');
  if(typeof req.body?.enabled!=='boolean')throw Error('Invalid user status');
  if(req.params.id===a.user_id&&!req.body.enabled)throw Error('Cannot disable your own session');
  await db.transaction(async client=>{
   const updated=await client.query('UPDATE md_users SET enabled=$3 WHERE tenant_id=$1 AND id=$2 RETURNING id',
    [a.tenant_id,req.params.id,req.body.enabled]);
   if(!updated.rowCount)throw Error('User not found');
   if(!req.body.enabled){
    await client.query('UPDATE md_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[a.tenant_id,req.params.id]);
    await client.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[a.tenant_id,req.params.id]);
   }
  });
  res.json({id:req.params.id,enabled:req.body.enabled});
 }));
 app.get('/api/auth/password-recovery/settings',wrap(async(req,res)=>{
  const a=req.actor!;
  await rbac.require(a.tenant_id,a.user_id,'Tenant','read');
  const s=await recoverySettings(db,a.tenant_id),ready=await recoveryConfigured(db,a.tenant_id);
  res.json({smtpCredentialId:s.smtp_credential_id??'',
   fromEmail:s.smtp_credential_id?s.from_email:(process.env.METADRIVE_RESET_FROM_EMAIL??''),
   linkReady:ready,policy:s.policy,available:ready});
 }));
 app.put('/api/auth/password-recovery/settings',wrap(async(req,res)=>{
  const a=req.actor!,id=req.body?.smtpCredentialId??'',from=req.body?.fromEmail??'',
   policy=req.body?.policy??{method:'OTP'};
  await rbac.require(a.tenant_id,a.user_id,'Tenant','edit');
  if(typeof id!=='string'||id&& !/^[0-9a-f-]{36}$/i.test(id)
    ||typeof from!=='string'||from.length>254||(id&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from))
    ||!policy||typeof policy!=='object'||Array.isArray(policy)||policy.method!=='OTP'
    ||policy.defaultChannel!=='email'||!Array.isArray(policy.allowedChannels)
    ||policy.allowedChannels.some((x:unknown)=>x!=='email'))
   throw Error('Invalid OTP recovery settings');
  const templates=policy.templates?.email;
  if(templates && (typeof templates.subject!=='string'||templates.subject.length>200
    ||typeof templates.body!=='string'||templates.body.length>6000))
   throw Error('Invalid OTP email template');
  if(id){
   const {rows}=await db.query<{id:string}>(`SELECT id FROM md_named_credentials
    WHERE tenant_id=$1 AND id=$2 AND protocol='SMTP' AND enabled=true`,[a.tenant_id,id]);
   if(!rows[0])throw Error('Tenant SMTP credential unavailable');
  }
  await db.query(`INSERT INTO md_tenant_password_recovery_settings
    (tenant_id,smtp_credential_id,from_email,policy) VALUES($1,$2,$3,$4::jsonb)
    ON CONFLICT(tenant_id) DO UPDATE SET smtp_credential_id=EXCLUDED.smtp_credential_id,
      from_email=EXCLUDED.from_email,policy=EXCLUDED.policy`,
    [a.tenant_id,id||null,id?from:'',JSON.stringify(policy)]);
  res.json({smtpCredentialId:id,fromEmail:from,policy,
   linkReady:await recoveryConfigured(db,a.tenant_id)});
 }));
}
