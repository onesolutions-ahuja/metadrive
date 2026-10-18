import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import {AuthenticationService} from './authentication.js';
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
  const updated=await db.query('UPDATE md_users SET enabled=$3 WHERE tenant_id=$1 AND id=$2 RETURNING id',
   [a.tenant_id,req.params.id,req.body.enabled]);
  if(!updated.rowCount)throw Error('User not found');
  if(!req.body.enabled)await db.transaction(async client=>{
   await client.query('UPDATE md_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[a.tenant_id,req.params.id]);
   await client.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[a.tenant_id,req.params.id]);
  });
  res.json({id:req.params.id,enabled:req.body.enabled});
 }));
 app.get('/api/auth/mfa/status',wrap(async(_req,res)=>{
  res.json({mode:'Disabled',enrolled:false,available:false});
 }));
 app.get('/api/auth/password-recovery/settings',wrap(async(_req,res)=>{
  res.json({smtpCredentialId:'',fromEmail:'',linkReady:false,policy:{method:'OTP'},available:false});
 }));
}
