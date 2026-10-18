import {createHash} from 'node:crypto';
import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(fn:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req as Req,res).catch(next);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function registerAuthSecurityRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 app.get('/api/auth/user-locks',wrap(async(req,res)=>{
  const a=req.actor!;await rbac.require(a.tenant_id,a.user_id,'User','read');
  const {rows}=await db.query<{id:string;email:string;enabled:boolean;locked_until:Date|null}>(`
   SELECT u.id,u.email,u.enabled,l.locked_until FROM md_users u
   LEFT JOIN md_user_security_locks l ON l.tenant_id=u.tenant_id
    AND l.user_id=u.id AND l.locked_until>now()
   WHERE u.tenant_id=$1 ORDER BY u.email LIMIT 500`,[a.tenant_id]);
  res.json({users:rows.map(u=>({id:u.id,name:u.email,email:u.email,active:u.enabled,
   lockedUntil:u.locked_until?new Date(u.locked_until).getTime():null}))});
 }));
 app.post('/api/auth/users/:id/lock',wrap(async(req,res)=>{
  const a=req.actor!,id=req.params.id,minutes=req.body?.durationMinutes??60;
  await rbac.require(a.tenant_id,a.user_id,'User','edit');
  if(!uuid.test(id)||id===a.user_id||!Number.isInteger(minutes)||minutes<1||minutes>1440)
   throw Error('Invalid user lock request');
  await db.transaction(async client=>{
   const found=await client.query('SELECT id FROM md_users WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[a.tenant_id,id]);
   if(!found.rowCount)throw Error('User not found');
   await client.query(`INSERT INTO md_user_security_locks(tenant_id,user_id,locked_until,created_by)
    VALUES($1,$2,now()+($3*interval '1 minute'),$4)
    ON CONFLICT(tenant_id,user_id) DO UPDATE SET
    locked_until=EXCLUDED.locked_until,created_by=EXCLUDED.created_by,locked_at=now()`,
    [a.tenant_id,id,minutes,a.user_id]);
   await client.query('UPDATE md_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[a.tenant_id,id]);
   await client.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[a.tenant_id,id]);
   await client.query('DELETE FROM md_mfa_login_challenges WHERE tenant_id=$1 AND user_id=$2',[a.tenant_id,id]);
   await client.query(`INSERT INTO md_auth_security_events(tenant_id,actor_user_id,action,details)
    VALUES($1,$2,'user_locked',$3::jsonb)`,[a.tenant_id,a.user_id,JSON.stringify({targetUserId:id,durationMinutes:minutes})]);
  });
  res.json({id,locked:true});
 }));
 app.post('/api/auth/users/:id/unlock',wrap(async(req,res)=>{
  const a=req.actor!,id=req.params.id;
  await rbac.require(a.tenant_id,a.user_id,'User','edit');
  if(!uuid.test(id))throw Error('Invalid user identifier');
  await db.transaction(async client=>{
   const {rows}=await client.query<{email:string}>(
    'SELECT email FROM md_users WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[a.tenant_id,id]);
   if(!rows[0])throw Error('User not found');
   await client.query('DELETE FROM md_user_security_locks WHERE tenant_id=$1 AND user_id=$2',[a.tenant_id,id]);
   const emailHash=createHash('sha256').update(rows[0].email.trim().toLowerCase()).digest('hex');
   await client.query('DELETE FROM md_login_attempt_counters WHERE tenant_id=$1 AND email_hash=$2',[a.tenant_id,emailHash]);
   await client.query(`INSERT INTO md_auth_security_events(tenant_id,actor_user_id,action,details)
    VALUES($1,$2,'user_unlocked',$3::jsonb)`,[a.tenant_id,a.user_id,JSON.stringify({targetUserId:id})]);
  });
  res.json({id,locked:false});
 }));
 app.get('/api/auth/security-events',wrap(async(req,res)=>{
  const a=req.actor!;
  await rbac.require(a.tenant_id,a.user_id,'Tenant','edit');
  const limit=Number(req.query.limit??50);
  if(!Number.isInteger(limit)||limit<1||limit>200)throw Error('Invalid security audit limit');
  const {rows}=await db.query<{id:string;created_at:Date;actor_user_id:string|null;action:string;details:Record<string,string>}>(`
    SELECT id,created_at,actor_user_id,action,details FROM md_auth_security_events
    WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2`,[a.tenant_id,limit]);
  res.json({events:rows.map(e=>({id:e.id,at:new Date(e.created_at).toISOString(),
   actorUserId:e.actor_user_id??'',action:e.action,details:e.details}))});
 }));
}
