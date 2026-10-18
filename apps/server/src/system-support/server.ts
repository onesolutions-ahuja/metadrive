import express, { type NextFunction, type Request, type Response } from 'express';
import { SqlPersistence } from '../system-files/sql-persistence.js';
import {applySystemMigrations} from './system-migrations.js';
import {seedCoreObjectsForExistingTenants} from '../app-seeders/fresh-core-objects.js';
import { AuthenticationService } from '../system-files/authentication.js';
import {PasswordRecoverySettingsService} from './password-recovery-settings-service.js';
import {sessionMetadata} from '../system-files/session-metadata.js';
import { ObjectDefinitionService } from '../system-files/object-definition.js';
import { RbacEngine } from '../system-files/rbac-engine.js';
import {NamedCredentialService} from './named-credential-service.js';
import {SystemDefinitionService,definitionKinds,type DefinitionKind} from '../system-files/system-definition-service.js';
import { RecordEngine } from '../system-files/record-engine.js';
import {SqlReportRuntime} from './sql-report-runtime.js';
import {RecordCollaborationService} from './record-collaboration-service.js';
import {registerDynamicApiRoutes} from './dynamic-api-routes.js';
import {registerTenantInspectionRoutes} from './tenant-inspection-routes.js';

import { ComponentRuntime } from '../system-files/component-runtime.js';
import { PageRuntime } from '../system-files/page-runtime.js';
import { FlowRuntime } from '../system-files/flow-runtime.js';
import { AppRuntime } from '../system-files/app-runtime.js';
import { TenantProvisioning } from '../system-files/tenant-provisioning.js';
import {PlatformTenantService} from '../system-files/platform-tenant-service.js';
import {rotateFirstLoginPassword} from './first-login-rotation.js';
import {reconcileBootstrapPassword} from './bootstrap-password-sync.js';

type Actor={tenant_id:string;user_id:string};
type AuthenticatedRequest=Request & {actor?:Actor};
type Handler=(req:AuthenticatedRequest,res:Response)=>Promise<unknown>;
const route=(handler:Handler)=>(req:Request,res:Response,next:NextFunction)=>{
  Promise.resolve(handler(req as AuthenticatedRequest,res)).catch(next);
};
const tokenCookie='md_refresh';
const getCookie=(req:Request):string|undefined=>{
  const encoded=(req.get('cookie')??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(tokenCookie+'='));
  return encoded?.slice(tokenCookie.length+1);
};
function cookieOptions(req:Request) {
  const origin=req.get('origin');
  const crossSite=Boolean(origin && new URL(origin).hostname !== req.hostname);
  return `HttpOnly; Path=/api/auth; Max-Age=2592000; SameSite=${crossSite?'None':'Lax'}${crossSite||process.env.NODE_ENV==='production'?'; Secure':''}`;
}
async function resolveTenant(db:SqlPersistence,req:Request,tenantSlug?:unknown) {
  // Explicit tenant selection must never override the tenant owning the browser origin.
  const source=req.get('origin');
  let originTenant:string|undefined;
  if(source) {
    const host=new URL(source).hostname.toLowerCase();
    const {rows}=await db.query<{tenant_id:string}>(
      'SELECT tenant_id FROM md_tenant_domains WHERE domain=$1',[host]);
    originTenant=rows[0]?.tenant_id;
    if(!originTenant) return undefined;
  }
  if(tenantSlug!==undefined) {
    if(typeof tenantSlug!=='string'|| !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug))
      throw new Error('Invalid tenant');
    const {rows}=await db.query<{id:string}>('SELECT id FROM md_tenants WHERE slug=$1',[tenantSlug]);
    if(originTenant && rows[0]?.id!==originTenant) return undefined;
    return rows[0]?.id;
  }
  return originTenant;
}
export function createSystemServer(db:SqlPersistence) {
  const app=express();
  app.disable('x-powered-by');
  app.use(express.json({limit:'64kb'}));
  const auth=new AuthenticationService(db);
  const rbac=new RbacEngine(db);
  const recoverySettings=new PasswordRecoverySettingsService(db,rbac);
  const records=new RecordEngine(db,rbac);
  const reportRuntime=new SqlReportRuntime(db,rbac,records);
  const collaboration=new RecordCollaborationService(db,rbac);
  const systemDefinitions=new SystemDefinitionService(db,rbac);
  const namedCredentials=new NamedCredentialService(db,rbac);
  const definitions=new ObjectDefinitionService(db);
  const components=new ComponentRuntime(db);
  const pages=new PageRuntime(db);
  const flows=new FlowRuntime(db,rbac,records);
  const apps=new AppRuntime(db);
  const platformTenants=new PlatformTenantService(db,rbac);

  // CORS is granted only to origins registered for a SQL tenant.
  app.use(async (req,res,next)=>{
    try {
    const origin=req.get('origin');
    if(origin) {
      let host:string;
      try { const parsed=new URL(origin); if(!['https:','http:'].includes(parsed.protocol)) throw Error(); host=parsed.hostname.toLowerCase(); }
      catch { res.status(403).json({error:'Unrecognised origin'});return; }
      const authorized=await db.query('SELECT tenant_id FROM md_tenant_domains WHERE domain=$1',[host]);
      if(!authorized.rows.length) { res.status(403).json({error:'Unregistered origin'});return; }
      res.setHeader('Access-Control-Allow-Origin',origin);
      res.setHeader('Access-Control-Allow-Credentials','true');
      res.setHeader('Vary','Origin');
      res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, X-MetaDrive-Request-Source');
      res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
    }
    if(req.method==='OPTIONS') {res.status(204).end();return;}
    next();
    } catch(error) {next(error);}
  });
  const authorize=async (req:AuthenticatedRequest,res:Response,next:NextFunction)=>{
    try {
      const bearer=req.get('authorization')??'';
      if(!/^Bearer [a-zA-Z0-9_-]+$/.test(bearer)) {res.status(401).json({error:'Bearer access token required'});return;}
      req.actor=await auth.authenticate(bearer.slice(7));
      next();
    } catch {res.status(401).json({error:'Invalid session'});}
  };

  app.get('/health',route(async(_req,res)=>{
    await db.query('SELECT 1 FROM md_tenants LIMIT 1');res.json({status:'ok',persistence:'sql'});
  }));
  app.get('/api/health',route(async(_req,res)=>{
    await db.query('SELECT 1 FROM md_tenants LIMIT 1');res.json({status:'ok',persistence:'sql'});
  }));
  app.post('/api/auth/login',route(async(req,res)=>{
    const {tenantSlug,email,password}=req.body??{};
    if(typeof email!=='string'||typeof password!=='string'||!email.trim()) {
      res.status(400).json({error:'Email and password required'});return;
    }
    const tenantId=await resolveTenant(db,req,tenantSlug);
    if(!tenantId) {res.status(401).json({error:'Invalid credentials or tenant domain'});return;}
    try {
      const session=await auth.signIn(tenantId,email,password);
      res.setHeader('Set-Cookie',`${tokenCookie}=${session.refreshToken}; ${cookieOptions(req)}`);
      res.json({access_token:session.accessToken,expires_in:session.expiresIn});
    } catch(error) {
      // Distinguish rejected credentials from SQL/session failures. A successful
      // password check followed by a failed database write must not become 401.
      if(error instanceof Error&&error.message==='Invalid credentials')
        res.status(401).json({error:'Invalid credentials'});
      else throw error;
    }
  }));
  app.post('/api/auth/refresh',route(async(req,res)=>{
    const token=getCookie(req);
    if(!token) {res.status(401).json({error:'Refresh token required'});return;}
    try {
      const session=await auth.refresh(token);
      res.setHeader('Set-Cookie',`${tokenCookie}=${session.refreshToken}; ${cookieOptions(req)}`);
      res.json({access_token:session.accessToken,expires_in:session.expiresIn});
    } catch {res.status(401).json({error:'Invalid refresh session'});}
  }));
  app.use('/api',authorize);
  // Durable notifications: only the addressed user can list or acknowledge them.
  const notificationView=(row:{id:string;recipient_id:string;title:string;body:string;flow_api_name:string;sent_by:string|null;created_at:Date;read_at:Date|null})=>({
    id:row.id,recipientId:row.recipient_id,title:row.title,body:row.body,
    flowApiName:row.flow_api_name,sentBy:row.sent_by??'',
    createdAt:new Date(row.created_at).toISOString(),
    readAt:row.read_at?new Date(row.read_at).toISOString():null
  });
  type ApprovalSqlRow={id:string;group_id:string;object_api:string;object_label:string;record_id:string;
    record_name:string;flow_api_name:string;submitted_by:string;approver_id:string;status:string;
    comments:string;decision_comments:string;created_at:Date;decided_at:Date|null;decided_by:string|null};
  const approvalView=(r:ApprovalSqlRow)=>({
    id:r.id,groupId:r.group_id,objectApiName:r.object_api,objectLabel:r.object_label,
    recordId:r.record_id,recordName:r.record_name,flowApiName:r.flow_api_name,
    submittedBy:r.submitted_by,submittedByName:r.submitted_by,
    approverId:r.approver_id,status:r.status,comments:r.comments,decisionComments:r.decision_comments,
    createdAt:new Date(r.created_at).toISOString(),
    decidedAt:r.decided_at?new Date(r.decided_at).toISOString():null,decidedBy:r.decided_by
  });
  app.get('/api/approvals/inbox',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ApprovalRequest','read');
    const {rows}=await db.query<ApprovalSqlRow>(
      "SELECT * FROM md_approval_requests WHERE tenant_id=$1 AND approver_id=$2 AND status='Pending' ORDER BY created_at DESC,id DESC LIMIT 100",
      [actor.tenant_id,actor.user_id]);
    res.json({requests:rows.map(approvalView)});
  }));
  app.post('/api/approvals/:id/decision',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ApprovalRequest','approve');
    const decision=req.body?.decision,comments=req.body?.comments??'';
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)||
       !['Approved','Rejected'].includes(decision)||typeof comments!=='string'||comments.length>4000)
      throw new Error('Invalid approval decision');
    const {rows}=await db.query<ApprovalSqlRow>(
      "UPDATE md_approval_requests SET status=$4,decision_comments=$5,decided_at=now(),decided_by=$2 WHERE tenant_id=$1 AND approver_id=$2 AND id=$3 AND status='Pending' RETURNING *",
      [actor.tenant_id,actor.user_id,req.params.id,decision,comments]);
    if(!rows[0]){res.status(404).json({error:'Pending approval not found'});return;}
    res.json({request:approvalView(rows[0])});
  }));
  app.get('/api/notifications',route(async(req,res)=>{
    const actor=req.actor!;
    const {rows}=await db.query<{
      id:string;recipient_id:string;title:string;body:string;flow_api_name:string;
      sent_by:string|null;created_at:Date;read_at:Date|null
    }>('SELECT id,recipient_id,title,body,flow_api_name,sent_by,created_at,read_at FROM md_notifications WHERE tenant_id=$1 AND recipient_id=$2 ORDER BY created_at DESC,id DESC LIMIT 100',[actor.tenant_id,actor.user_id]);
    const {rows:counts}=await db.query<{count:string}>(
      'SELECT count(*)::text AS count FROM md_notifications WHERE tenant_id=$1 AND recipient_id=$2 AND read_at IS NULL',[actor.tenant_id,actor.user_id]);
    res.json({notifications:rows.map(notificationView),unreadCount:Number(counts[0]?.count??0)});
  }));
  app.post('/api/notifications/:id/read',route(async(req,res)=>{
    const actor=req.actor!;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id))
      throw new Error('Invalid notification ID');
    const {rows}=await db.query<{
      id:string;recipient_id:string;title:string;body:string;flow_api_name:string;
      sent_by:string|null;created_at:Date;read_at:Date|null
    }>('UPDATE md_notifications SET read_at=COALESCE(read_at,now()) WHERE tenant_id=$1 AND recipient_id=$2 AND id=$3 RETURNING id,recipient_id,title,body,flow_api_name,sent_by,created_at,read_at',
      [actor.tenant_id,actor.user_id,req.params.id]);
    if(!rows[0]){res.status(404).json({error:'Notification not found'});return;}
    res.json({notification:notificationView(rows[0])});
  }));
  app.get('/api/auth/password-recovery/settings',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await recoverySettings.read(actor.tenant_id,actor.user_id));
  }));
  app.put('/api/auth/password-recovery/settings',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await recoverySettings.save(actor.tenant_id,actor.user_id,req.body));
  }));
  app.get('/api/auth/user-locks',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'Security','read');
    const {rows}=await db.query<{id:string;email:string;display_name:string;enabled:boolean;locked_until:Date|null}>(
      'SELECT id,email,display_name,enabled,locked_until FROM md_users WHERE tenant_id=$1 ORDER BY email LIMIT 500',[actor.tenant_id]);
    res.json({users:rows.map(r=>({id:r.id,name:r.display_name||r.email,email:r.email,active:r.enabled,
      lockedUntil:r.locked_until?new Date(r.locked_until).getTime():null}))});
  }));
  app.get('/api/auth/security-events',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'Security','read');
    const limit=Number(req.query.limit??50);
    if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('Invalid pagination');
    const {rows}=await db.query<{id:string;actor_user_id:string;action:string;details:Record<string,string>;created_at:Date}>(
      'SELECT id,actor_user_id,action,details,created_at FROM md_security_events WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2',[actor.tenant_id,limit]);
    res.json({events:rows.map(r=>({id:r.id,actorUserId:r.actor_user_id,at:new Date(r.created_at).toISOString(),action:r.action,details:r.details}))});
  }));
  app.post('/api/auth/users/:id/lock',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'Security','manage');
    const id=req.params.id,duration=req.body?.durationMinutes;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      ||!Number.isSafeInteger(duration)||duration<1||duration>1440||id===actor.user_id)
      throw new Error('Invalid account lock');
    await db.transaction(async client=>{
      const target=await client.query(
        "UPDATE md_users SET locked_until=now()+($3 * interval '1 minute') WHERE tenant_id=$1 AND id=$2 AND enabled=true RETURNING id",
        [actor.tenant_id,id,duration]);
      if(!target.rowCount)throw new Error('User not found');
      await client.query('UPDATE md_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[actor.tenant_id,id]);
      await client.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[actor.tenant_id,id]);
      await client.query("INSERT INTO md_security_events(tenant_id,actor_user_id,subject_user_id,action,details) VALUES($1,$2,$3,'user.lock',jsonb_build_object('durationMinutes',$4::integer))",
        [actor.tenant_id,actor.user_id,id,duration]);
    });
    res.status(204).end();
  }));
  app.post('/api/auth/users/:id/unlock',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'Security','manage');
    const id=req.params.id;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      throw new Error('Invalid user ID');
    await db.transaction(async client=>{
      const target=await client.query('UPDATE md_users SET locked_until=NULL WHERE tenant_id=$1 AND id=$2 RETURNING id',[actor.tenant_id,id]);
      if(!target.rowCount)throw new Error('User not found');
      await client.query("INSERT INTO md_security_events(tenant_id,actor_user_id,subject_user_id,action) VALUES($1,$2,$3,'user.unlock')",[actor.tenant_id,actor.user_id,id]);
    });
    res.status(204).end();
  }));
  app.get('/api/auth/me',route(async(req,res)=>{
    res.json(await sessionMetadata(db,req.actor!.tenant_id,req.actor!.user_id));
  }));
  app.post('/api/auth/logout',route(async(req,res)=>{
    await auth.signOut(req.get('authorization')!.slice(7),getCookie(req));
    res.setHeader('Set-Cookie',`${tokenCookie}=; HttpOnly; Path=/api/auth; Max-Age=0; SameSite=Lax`);
    res.status(204).end();
  }));
  app.post('/api/auth/change-password',route(async(req,res)=>{
    const actor=req.actor!;
    const {currentPassword,newPassword}=req.body??{};
    if(typeof currentPassword!=='string'||typeof newPassword!=='string')
      throw new Error('Invalid password change');
    try{
      await auth.changePassword(actor.tenant_id,actor.user_id,currentPassword,newPassword);
      res.status(204).end();
    }catch(error){
      if(error instanceof Error&&error.message==='Invalid credentials'){
        res.status(401).json({error:'Invalid credentials'});return;
      }
      throw error;
    }
  }));
  app.get('/api/auth/sessions',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await auth.activeSessions(actor.tenant_id,actor.user_id));
  }));
  app.post('/api/auth/sessions/revoke-all',route(async(req,res)=>{
    const actor=req.actor!;
    const currentPassword=req.body?.currentPassword;
    if(typeof currentPassword!=='string')throw new Error('Invalid credentials');
    try{
      await auth.revokeAllSessions(actor.tenant_id,actor.user_id,currentPassword);
      res.status(204).end();
    }catch(error){
      if(error instanceof Error&&error.message==='Invalid credentials'){
        res.status(401).json({error:'Invalid credentials'});return;
      }
      throw error;
    }
  }));
  app.get('/api/tenant/company-profile',route(async(req,res)=>{
    const actor=req.actor!;
    res.json({profile:await platformTenants.getSetting(actor.tenant_id,actor.user_id,'company-profile')});
  }));
  app.put('/api/tenant/company-profile',route(async(req,res)=>{
    const actor=req.actor!;
    res.json({profile:await platformTenants.saveSetting(actor.tenant_id,actor.user_id,'company-profile',req.body)});
  }));
  app.get('/api/metadata/currencies',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await platformTenants.getSetting(actor.tenant_id,actor.user_id,'currencies')??
      {corporateCurrency:'USD',standardVatRate:20,currencies:[{currencyIsoCode:'USD',conversionRate:1}]});
  }));
  app.put('/api/metadata/currencies',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await platformTenants.saveSetting(actor.tenant_id,actor.user_id,'currencies',req.body));
  }));
  app.get('/api/metadata/automation-settings',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await platformTenants.getSetting(actor.tenant_id,actor.user_id,'automation-settings')??
      {autoRetryFailedFlows:false,maxRetryAttempts:10,conversationIdleMinutes:15});
  }));
  app.put('/api/metadata/automation-settings',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await platformTenants.saveSetting(actor.tenant_id,actor.user_id,'automation-settings',req.body));
  }));
  app.get('/api/platform/tenants/:slug',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await platformTenants.get(actor.tenant_id,actor.user_id,req.params.slug));
  }));
  app.patch('/api/platform/tenants/:slug',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await platformTenants.updateDetails(actor.tenant_id,actor.user_id,req.params.slug,req.body));
  }));
  app.patch('/api/platform/tenants/:slug/retention',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await platformTenants.updateRetention(actor.tenant_id,actor.user_id,req.params.slug,req.body));
  }));
  for(const operation of ['suspend','reactivate','archive','restore'] as const) {
    app.post('/api/platform/tenants/:slug/'+operation,route(async(req,res)=>{
      const actor=req.actor!;
      res.json(await platformTenants.transition(actor.tenant_id,actor.user_id,req.params.slug,operation));
    }));
  }
  app.post('/api/platform/tenants',route(async(req,res)=>{
    const actor=req.actor!;
    const payload=await platformTenants.create(actor.tenant_id,actor.user_id,req.body,req.get('idempotency-key'));
    res.status(payload.replayed?200:201).json(payload);
  }));
  app.get('/api/platform/tenants',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await platformTenants.list(actor.tenant_id,actor.user_id,req.query));
  }));
  app.get('/api/metadata/permissions',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await rbac.describe(actor.tenant_id,actor.user_id));
  }));
  app.get('/api/objects',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ObjectDefinition','read');
    // Tenant metadata must never reuse an obsolete empty browser response.
    res.setHeader('Cache-Control','private, no-store');
    res.removeHeader('ETag');
    res.json({objects:await definitions.list(actor.tenant_id)});
  }));
  // Validate against the SQL-supported metadata model; never report unsupported
  // builder features as executable/publishable definitions.
  app.post('/api/metadata/objects/:apiName/validate',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ObjectDefinition','read');
    await rbac.require(actor.tenant_id,actor.user_id,req.params.apiName,'read');
    const saved=await definitions.get(actor.tenant_id,req.params.apiName);
    const draft=req.body;
    if(!draft||typeof draft!=='object'||Array.isArray(draft))throw new Error('Invalid object draft');
    const errors:string[]=[];
    if(draft.apiName!==req.params.apiName)errors.push('Object API name does not match');
    if(typeof draft.label!=='string'||!draft.label.trim())errors.push('Object label is required');
    if(!Array.isArray(draft.fields))errors.push('Object fields must be an array');
    else {
      const names=new Set<string>();
      for(const field of draft.fields){
        if(!field||typeof field!=='object'||Array.isArray(field)){
          errors.push('Invalid field');continue;
        }
        if(typeof field.apiName!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(field.apiName)){
          errors.push('Invalid field API name');continue;
        }
        const key=field.apiName.toLowerCase();
        if(names.has(key))errors.push('Duplicate field API name: '+field.apiName);
        names.add(key);
        const canonical=saved.fields.find(f=>f.apiName===field.apiName);
        if(!canonical)errors.push('Field is not stored in SQL: '+field.apiName);
        else if(field.dataType!==canonical.dataType)errors.push('Unsupported field datatype change: '+field.apiName);
      }
    }
    // Draft/publishing and layouts require dedicated versioned SQL metadata support.
    if(draft.validationRules?.length||draft.formulaFields?.length)
      errors.push('Advanced Object draft features are not supported by the current SQL runtime');
    res.json({valid:errors.length===0,errors});
  }));
  // Metadata lookups use the same tenant-scoped SQL registry as list/create.
  app.put('/api/metadata/objects/:apiName/fields/:fieldApi',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'FieldDefinition','manage');
    await rbac.require(actor.tenant_id,actor.user_id,req.params.apiName,'edit');
    const proposal=req.body;
    if(!proposal||typeof proposal!=='object'||Array.isArray(proposal))
      throw new Error('Invalid field update');
    res.json({object:await definitions.updateField(actor.tenant_id,req.params.apiName,req.params.fieldApi,proposal)});
  }));
  app.delete('/api/metadata/objects/:apiName/fields/:fieldApi',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'FieldDefinition','manage');
    await rbac.require(actor.tenant_id,actor.user_id,req.params.apiName,'edit');
    res.json({object:await definitions.deleteField(actor.tenant_id,req.params.apiName,req.params.fieldApi)});
  }));
  app.get('/api/metadata/objects/:apiName/dependencies',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ObjectDefinition','read');
    await rbac.require(actor.tenant_id,actor.user_id,req.params.apiName,'read');
    res.json(await definitions.dependencies(actor.tenant_id,req.params.apiName));
  }));
  app.get('/api/metadata/objects/:apiName/field-dependencies',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ObjectDefinition','read');
    await rbac.require(actor.tenant_id,actor.user_id,req.params.apiName,'read');
    res.json(await definitions.fieldDependencies(actor.tenant_id,req.params.apiName));
  }));
  app.get('/api/metadata/objects/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ObjectDefinition','read');
    await rbac.require(actor.tenant_id,actor.user_id,req.params.apiName,'read');
    res.json({object:await definitions.get(actor.tenant_id,req.params.apiName)});
  }));
  app.get('/api/apps/:appId/home-page',route(async(req,res)=>{
    const actor=req.actor!;
    const factor=String(req.query.formFactor??'Desktop');
    if(!['Desktop','Phone'].includes(factor))throw new Error('Invalid form factor');
    await rbac.require(actor.tenant_id,actor.user_id,'App:'+req.params.appId,'read');
    const session=await sessionMetadata(db,actor.tenant_id,actor.user_id);
    const assigned=await apps.homePage(actor.tenant_id,req.params.appId,factor.toLowerCase(),session.user.profileId);
    res.json({page:assigned?.apiName?(await pages.load(actor.tenant_id,assigned.apiName)).page:null});
  }));
  app.get('/api/apps/:appId/pages/:pageApiName',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'App:'+req.params.appId,'read');
    const factor=String(req.query.formFactor??'Desktop');
    const page=await pages.resolveAppPage(actor.tenant_id,req.params.appId,req.params.pageApiName,factor);
    if(!page)throw new Error('Page not found');
    res.json({page});
  }));
  app.get('/api/metadata/objects',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ObjectDefinition','read');
    res.json({objects:await definitions.list(actor.tenant_id)});
  }));
  app.post('/api/metadata/objects',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ObjectDefinition','create');
    const {apiName,label}=req.body??{};
    if(typeof apiName!=='string'||typeof label!=='string')throw new Error('Invalid object definition');
    const object=await definitions.create(actor.tenant_id,apiName,label,req.body?.fields??[]);
    res.status(201).json({object});
  }));
  app.put('/api/metadata/objects/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ObjectDefinition','manage');
    await rbac.require(actor.tenant_id,actor.user_id,req.params.apiName,'edit');
    const revisionHeader=req.get('if-match')??'';
    if(!/^"(0|[1-9][0-9]*)"$/.test(revisionHeader))throw new Error('Invalid page layout revision precondition');
    const draft=req.body;
    if(!draft||typeof draft!=='object'||Array.isArray(draft)||draft.apiName!==req.params.apiName)
      throw new Error('Invalid object draft');
    // Unsupported configuration must never appear successfully saved.
    if(draft.validationRules?.length||draft.formulaFields?.length
      ||draft.compactLayouts?.length||draft.fieldSets?.length||draft.description?.trim())
      throw new Error('Invalid unsupported object configuration');
    const object=await definitions.replaceLayouts(actor.tenant_id,req.params.apiName,draft,Number(revisionHeader.slice(1,-1)));
    res.json({object});
  }));
  app.post('/api/metadata/objects/:apiName/fields',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'FieldDefinition','create');
    const field=req.body?.field??req.body??{};
    const {apiName,dataType}=field;
    const relatedObject=field.relatedObject??field.relationship?.targetObject;
    if(typeof apiName!=='string'||typeof dataType!=='string'||
      (relatedObject!==undefined&&typeof relatedObject!=='string'))
      throw new Error('Invalid field definition');
    await definitions.addField(actor.tenant_id,req.params.apiName,apiName,dataType,relatedObject,typeof field.label==='string'?field.label:undefined,field);
    res.status(201).json({object:await definitions.get(actor.tenant_id,req.params.apiName)});
  }));
  app.get('/api/component-library',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ComponentDefinition','read');
    res.json({
      components:await components.list(actor.tenant_id),
      canManage:await rbac.allowed(actor.tenant_id,actor.user_id,'ComponentDefinition','create')
    });
  }));
  app.get('/api/metadata/components',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ComponentDefinition','read');
    res.json({components:await components.list(actor.tenant_id)});
  }));
  app.get('/api/metadata/pages',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'PageDefinition','read');
    res.json({pages:await pages.list(actor.tenant_id)});
  }));
  app.put('/api/metadata/pages/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'PageDefinition','manage');
    const page=await pages.save(actor.tenant_id,req.params.apiName,req.body);
    res.json({page});
  }));
  app.get('/api/named-credentials/readiness',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await namedCredentials.readiness(actor.tenant_id,actor.user_id));
  }));
  app.get('/api/named-credentials',route(async(req,res)=>{
    const actor=req.actor!;
    res.json({credentials:await namedCredentials.list(actor.tenant_id,actor.user_id)});
  }));
  app.post('/api/named-credentials',route(async(req,res)=>{
    const actor=req.actor!;
    const credential=await namedCredentials.create(actor.tenant_id,actor.user_id,req.body);
    res.status(201).json({credential});
  }));
  app.put('/api/named-credentials/:id',route(async(req,res)=>{
    const actor=req.actor!;
    res.json({credential:await namedCredentials.update(actor.tenant_id,actor.user_id,req.params.id,req.body)});
  }));
  app.patch('/api/named-credentials/:id/enabled',route(async(req,res)=>{
    const actor=req.actor!;
    const credential=await namedCredentials.setEnabled(actor.tenant_id,actor.user_id,req.params.id,req.body?.enabled);
    res.json({credential});
  }));
  app.delete('/api/named-credentials/:id',route(async(req,res)=>{
    const actor=req.actor!;
    await namedCredentials.remove(actor.tenant_id,actor.user_id,req.params.id);
    res.status(204).end();
  }));
  // Universal SQL-backed definition API. Names are compatibility routes, data is SQL.
  const definitionPaths:Record<string,DefinitionKind>={
    '/metadata/platform-events':'platform-events',
    '/metadata/email-alerts':'email-alerts',
    '/metadata/approval-processes':'approval-processes',
    '/metadata/dashboards':'dashboards',
    '/metadata/dashboard-folders':'dashboard-folders',
    '/metadata/dashboard-territories':'dashboard-territories',
    '/metadata/report-folders':'report-folders',
    '/metadata/reports':'reports',
    '/connector-providers':'connector-providers',
    '/integration-connections':'integration-connections'
  };
  for(const [path,kind] of Object.entries(definitionPaths)) {
    app.get('/api'+path,route(async(req,res)=>{
      const actor=req.actor!;
      const items=await systemDefinitions.list(actor.tenant_id,actor.user_id,kind);
      res.json({[definitionKinds[kind]]:items});
    }));
    app.post('/api'+path,route(async(req,res)=>{
      const actor=req.actor!;
      const definition=await systemDefinitions.save(actor.tenant_id,actor.user_id,kind,req.body);
      res.status(201).json({[kind==='email-alerts'?'emailAlert':kind==='approval-processes'?'approvalProcess':kind==='platform-events'?'platformEvent':'definition']:definition});
    }));
    app.put('/api'+path+'/:apiName',route(async(req,res)=>{
      const actor=req.actor!;
      if(req.params.apiName!==req.body?.apiName)throw new Error('Invalid definition identity');
      const definition=await systemDefinitions.save(actor.tenant_id,actor.user_id,kind,req.body);
      res.json({[kind==='email-alerts'?'emailAlert':kind==='approval-processes'?'approvalProcess':kind==='platform-events'?'platformEvent':'definition']:definition});
    }));
    app.delete('/api'+path+'/:apiName',route(async(req,res)=>{
      const actor=req.actor!;
      await systemDefinitions.remove(actor.tenant_id,actor.user_id,kind,req.params.apiName);
      res.status(204).end();
    }));
  }
  app.get('/api/connector-apps/capabilities',route(async(req,res)=>{
    const actor=req.actor!;
    const decisions=await rbac.allowedMany(actor.tenant_id,actor.user_id,[
      {resource:'AppExchange',action:'read'},
      {resource:'AppExchange',action:'manage'},
      {resource:'NamedCredential',action:'read'},
      {resource:'NamedCredential',action:'manage'},
      {resource:'AppExchange',action:'install'},
      {resource:'Licence',action:'manage'}
    ]);
    res.json({view:decisions[0],edit:decisions[1],secrets:decisions[2],
      test:decisions[3],install:decisions[4]||decisions[1],licence:decisions[5]});
  }));
  app.get('/api/connector-apps/catalog',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'AppExchange','read');
    res.json(await apps.marketplace(actor.tenant_id));
  }));
  app.get('/api/metadata/flow-logs',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await flows.failedLogs(actor.tenant_id,actor.user_id));
  }));
  app.delete('/api/metadata/flow-interviews/:id',route(async(req,res)=>{
    const actor=req.actor!;
    await flows.cancelInterview(actor.tenant_id,actor.user_id,req.params.id);
    res.status(204).end();
  }));
  app.get('/api/metadata/flow-interviews',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await flows.pendingInterviews(actor.tenant_id,actor.user_id));
  }));
  app.post('/api/metadata/flows/:apiName/validate',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await flows.validateDraft(actor.tenant_id,actor.user_id,req.params.apiName,req.body));
  }));
  app.post('/api/metadata/flows/:apiName/deactivate',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await flows.deactivate(actor.tenant_id,actor.user_id,req.params.apiName));
  }));
  app.get('/api/metadata/flows',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'FlowDefinition','read');
    res.json({flows:await flows.list(actor.tenant_id)});
  }));
  app.get('/api/metadata/flows/list',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'FlowDefinition','read');
    res.json(await flows.listPage(actor.tenant_id,req.query.page,req.query.search??''));
  }));
  app.get('/api/metadata/components/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ComponentDefinition','read');
    res.json({component:await components.resolve(actor.tenant_id,req.params.apiName)});
  }));
  app.get('/api/metadata/pages/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'PageDefinition','read');
    res.json(await pages.load(actor.tenant_id,req.params.apiName));
  }));
  app.post('/api/flows/:apiName/execute',route(async(req,res)=>{
    const actor=req.actor!;
    const inputs=req.body?.inputs??req.body??{};
    if(!inputs||typeof inputs!=='object'||Array.isArray(inputs))throw new Error('Invalid Flow inputs');
    res.json(await flows.execute(actor.tenant_id,req.params.apiName,actor.user_id,inputs));
  }));
  app.get('/api/metadata/flows/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'FlowDefinition','read');
    res.json({flow:await flows.loadEditor(actor.tenant_id,req.params.apiName)});
  }));
  app.put('/api/metadata/flows/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    res.json({flow:await flows.saveEditor(actor.tenant_id,actor.user_id,req.params.apiName,req.body)});
  }));
  app.delete('/api/metadata/flows/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    await flows.deleteEditor(actor.tenant_id,actor.user_id,req.params.apiName);
    res.status(204).end();
  }));
  app.post('/api/apps/:apiName/install',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'AppExchange','manage');
    if(req.body?.pageSeed)await rbac.require(actor.tenant_id,actor.user_id,'PageDefinition','create');
    await apps.install(actor.tenant_id,req.params.apiName,req.body?.pageSeed);
    res.status(204).end();
  }));
  app.delete('/api/metadata/apps/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'AppExchange','manage');
    await apps.uninstall(actor.tenant_id,req.params.apiName);
    res.status(204).end();
  }));
  app.get('/api/metadata/route-aliases',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'AppExchange','read');
    res.json(await apps.listAliases(actor.tenant_id));
  }));
  app.put('/api/metadata/route-aliases/:appId/:slug',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'AppExchange','manage');
    await rbac.require(actor.tenant_id,actor.user_id,'App:'+req.params.appId,'manage');
    res.json({alias:await apps.saveAlias(actor.tenant_id,req.params.appId,req.params.slug,req.body??{})});
  }));
  app.delete('/api/metadata/route-aliases/:appId/:slug',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'AppExchange','manage');
    await rbac.require(actor.tenant_id,actor.user_id,'App:'+req.params.appId,'manage');
    await apps.disableAlias(actor.tenant_id,req.params.appId,req.params.slug,req.body?.expectedVersion);
    res.status(204).end();
  }));
  app.get('/api/routes/resolve/:appId/:slug',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'App:'+req.params.appId,'read');
    const resolution=await apps.resolveAlias(actor.tenant_id,req.params.appId,req.params.slug);
    if(resolution.kind==='Record List')
      await rbac.require(actor.tenant_id,actor.user_id,resolution.targetApiName,'read');
    else if(resolution.kind==='App Page')
      await rbac.require(actor.tenant_id,actor.user_id,'PageDefinition','read');
    res.json({path:resolution.path});
  }));
  app.get('/api/metadata/apps',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'AppExchange','read');
    res.json({apps:await apps.listMetadata(actor.tenant_id)});
  }));
  app.post('/api/metadata/apps',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'AppExchange','manage');
    await rbac.require(actor.tenant_id,actor.user_id,'Licence','manage');
    const app=await apps.saveMetadata(actor.tenant_id,req.body?.apiName,req.body,false);
    res.status(201).json({app});
  }));
  app.put('/api/metadata/apps/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'AppExchange','manage');
    await rbac.require(actor.tenant_id,actor.user_id,'App:'+req.params.apiName,'manage');
    res.json({app:await apps.saveMetadata(actor.tenant_id,req.params.apiName,req.body,true)});
  }));

  // The User object is a secure view of md_users, never a second md_records copy.
  const userRecord=(row:{id:string;email:string;display_name:string;enabled:boolean})=>({
    Id:row.id,Name:row.display_name||row.email,Email:row.email,Username:row.email,
    IsActive:row.enabled
  });
  const userFields=(input:Record<string,unknown>,creating:boolean)=>{
    const allowed=new Set(['Name','Email','Username','IsActive','Password','UserRoleId']);
    for(const key of Object.keys(input))if(!allowed.has(key))throw new Error('Unknown field: '+key);
    const email=input.Email??input.Username;
    if(email!==undefined&&(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)))throw new Error('Invalid user email');
    if(input.Name!==undefined&&typeof input.Name!=='string')throw new Error('Invalid user name');
    if(input.IsActive!==undefined&&typeof input.IsActive!=='boolean')throw new Error('Invalid active flag');
    if(input.UserRoleId!==undefined&&input.UserRoleId!==null&&typeof input.UserRoleId!=='string')throw new Error('Invalid role');
    if(creating&&(!email||typeof input.Password!=='string'))throw new Error('Invalid user credentials');
    if(!creating&&input.Password!==undefined)throw new Error('Invalid password edit');
    return {email:email as string|undefined,name:input.Name as string|undefined,
      enabled:input.IsActive as boolean|undefined,password:input.Password as string|undefined,
      role:input.UserRoleId as string|undefined|null};
  };
  const readUser=async(tenantId:string,id:string)=>{
    const result=await db.query<{id:string;email:string;display_name:string;enabled:boolean}>(
      'SELECT id,email,display_name,enabled FROM md_users WHERE tenant_id=$1 AND id=$2',[tenantId,id]);
    if(!result.rows[0])throw new Error('Record not found');
    return userRecord(result.rows[0]);
  };
  app.get('/api/records/User',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'User','read');
    const limit=Number(req.query.limit??50),offset=Number(req.query.offset??0);
    if(!Number.isInteger(limit)||!Number.isInteger(offset)||limit<1||offset<0)throw new Error('Invalid pagination');
    const [users,count]=await Promise.all([
      db.query<{id:string;email:string;display_name:string;enabled:boolean}>(
        'SELECT id,email,display_name,enabled FROM md_users WHERE tenant_id=$1 ORDER BY email,id LIMIT $2 OFFSET $3',
        [actor.tenant_id,Math.min(limit,100),offset]),
      db.query<{total:string}>('SELECT count(*)::text AS total FROM md_users WHERE tenant_id=$1',[actor.tenant_id])
    ]);
    res.json({records:users.rows.map(userRecord),total:Number(count.rows[0]?.total??0)});
  }));
  app.get('/api/records/User/:id',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'User','read');
    res.json({record:await readUser(actor.tenant_id,req.params.id)});
  }));
  app.post('/api/records/User',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'User','create');
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))throw new Error('Invalid user');
    const values=userFields(req.body,true);
    const passwordHash=await auth.hashPassword(values.password!);
    const row=await db.transaction(async client=>{
      const result=await client.query<{id:string}>(
        'INSERT INTO md_users(tenant_id,email,display_name,password_hash,enabled) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [actor.tenant_id,values.email,values.name??'',passwordHash,values.enabled??true]);
      const profile=await client.query<{id:string}>(
        "SELECT id FROM md_profiles WHERE tenant_id=$1 AND api_name='Default'",[actor.tenant_id]);
      if(profile.rows[0])await client.query(
        'INSERT INTO md_user_profiles(tenant_id,user_id,profile_id) VALUES($1,$2,$3)',
        [actor.tenant_id,result.rows[0].id,profile.rows[0].id]);
      if(values.role){
        const role=await client.query('SELECT id FROM md_roles WHERE tenant_id=$1 AND id=$2',[actor.tenant_id,values.role]);
        if(!role.rowCount)throw new Error('Invalid role');
        await client.query('INSERT INTO md_user_roles(tenant_id,user_id,role_id) VALUES($1,$2,$3)',
          [actor.tenant_id,result.rows[0].id,values.role]);
      }
      return result.rows[0];
    });
    res.status(201).json({record:await readUser(actor.tenant_id,row.id)});
  }));
  const editUser=route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'User','edit');
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))throw new Error('Invalid user');
    const values=userFields(req.body,false);
    if(req.params.id===actor.user_id&&values.enabled===false)throw new Error('Invalid self deactivation');
    await db.transaction(async client=>{
      const updated=await client.query(
        'UPDATE md_users SET email=COALESCE($3,email),display_name=COALESCE($4,display_name),enabled=COALESCE($5,enabled) WHERE tenant_id=$1 AND id=$2 RETURNING id',
        [actor.tenant_id,req.params.id,values.email??null,values.name??null,values.enabled??null]);
      if(!updated.rowCount)throw new Error('Record not found');
      if(values.role!==undefined){
        if(values.role){
          const role=await client.query('SELECT id FROM md_roles WHERE tenant_id=$1 AND id=$2',[actor.tenant_id,values.role]);
          if(!role.rowCount)throw new Error('Invalid role');
        }
        await client.query('DELETE FROM md_user_roles WHERE tenant_id=$1 AND user_id=$2',[actor.tenant_id,req.params.id]);
        if(values.role)await client.query('INSERT INTO md_user_roles(tenant_id,user_id,role_id) VALUES($1,$2,$3)',
          [actor.tenant_id,req.params.id,values.role]);
      }
      if(values.enabled===false){
        await client.query('UPDATE md_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[actor.tenant_id,req.params.id]);
        await client.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[actor.tenant_id,req.params.id]);
      }
    });
    res.json({record:await readUser(actor.tenant_id,req.params.id)});
  });
  app.put('/api/records/User/:id',editUser);
  app.patch('/api/records/User/:id',editUser);
  app.delete('/api/records/User/:id',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'User','delete');
    if(req.params.id===actor.user_id)throw new Error('Invalid self deactivation');
    await db.transaction(async client=>{
      const result=await client.query('UPDATE md_users SET enabled=false WHERE tenant_id=$1 AND id=$2 RETURNING id',
        [actor.tenant_id,req.params.id]);
      if(!result.rowCount)throw new Error('Record not found');
      await client.query('UPDATE md_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[actor.tenant_id,req.params.id]);
      await client.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[actor.tenant_id,req.params.id]);
    });
    res.status(204).end();
  }));

  app.get('/api/records/:objectApi/:id/activities',route(async(req,res)=>{
    res.json(await collaboration.listActivities(req.actor!,req.params.objectApi,req.params.id));
  }));
  app.post('/api/records/:objectApi/:id/activities',route(async(req,res)=>{
    res.status(201).json(await collaboration.addActivity(req.actor!,req.params.objectApi,req.params.id,req.body));
  }));
  app.patch('/api/records/:objectApi/:id/activities/:activityId',route(async(req,res)=>{
    res.json(await collaboration.updateActivity(req.actor!,req.params.objectApi,req.params.id,req.params.activityId,req.body?.status));
  }));
  app.get('/api/records/:objectApi/:id/chatter',route(async(req,res)=>{
    res.json(await collaboration.listPosts(req.actor!,req.params.objectApi,req.params.id));
  }));
  app.post('/api/records/:objectApi/:id/chatter',route(async(req,res)=>{
    res.status(201).json(await collaboration.addPost(req.actor!,req.params.objectApi,req.params.id,req.body?.body));
  }));
  app.post('/api/records/:objectApi/:id/chatter/:postId/comments',route(async(req,res)=>{
    res.status(201).json(await collaboration.addComment(req.actor!,req.params.objectApi,req.params.id,req.params.postId,req.body?.body));
  }));
  app.post('/api/reports/preview',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await reportRuntime.run(actor,req.body?.report,req.body??{}));
  }));
  app.post('/api/reports/:apiName/run',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await reportRuntime.stored(actor,req.params.apiName,req.body??{}));
  }));
  app.get('/api/records/:objectApi/:id',route(async(req,res)=>{
    const actor=req.actor!;
    const record=await records.get(actor.tenant_id,actor.user_id,req.params.objectApi,req.params.id);
    const actorSession=await sessionMetadata(db,actor.tenant_id,actor.user_id);
    const device=String(req.query.formFactor??'Desktop');
    const page=await pages.resolveRecordPage(actor.tenant_id,req.params.objectApi,
      String(req.query.appId??'Records'),actorSession.user.profileId,String(record.RecordTypeId??''),device);
    res.json({record,lightningPage:page});
  
  }));
  app.get('/api/records/:objectApi/:id/history',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await records.history(actor.tenant_id,actor.user_id,req.params.objectApi,req.params.id));
  }));
  app.get('/api/records/:objectApi',route(async(req,res)=>{
    const actor=req.actor!;
    const limit=Number(req.query.limit??50),offset=Number(req.query.offset??0);
    if(!Number.isInteger(limit)||!Number.isInteger(offset)||limit<1||offset<0) throw new Error('Invalid pagination');
    res.json(await records.list(actor.tenant_id,actor.user_id,req.params.objectApi,limit,offset));
  }));
  app.post('/api/records/:objectApi',route(async(req,res)=>{
    const actor=req.actor!;
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)) throw new Error('Invalid record values');
    const id=await records.create(actor.tenant_id,actor.user_id,req.params.objectApi,req.body);
    res.status(201).json({id,record:{Id:id}});
  }));
  const updateRecord=route(async(req,res)=>{
    const actor=req.actor!;
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))throw new Error('Invalid record values');
    await records.update(actor.tenant_id,actor.user_id,req.params.objectApi,req.params.id,
      req.body,req.get('if-unmodified-since'));
    res.json({record:{Id:req.params.id}});
  });
  app.patch('/api/records/:objectApi/:id',updateRecord);
  app.put('/api/records/:objectApi/:id',updateRecord);
  app.put('/api/records/:objectApi/:id/owner',route(async(req,res)=>{
    const actor=req.actor!;
    if(typeof req.body?.ownerId!=='string')throw new Error('Invalid owner ID');
    const record=await records.transferOwner(actor.tenant_id,actor.user_id,req.params.objectApi,
      req.params.id,req.body.ownerId,req.get('if-unmodified-since'));
    res.json({record});
  }));
  app.delete('/api/records/:objectApi/:id',route(async(req,res)=>{
    const actor=req.actor!;
    await records.remove(actor.tenant_id,actor.user_id,req.params.objectApi,req.params.id);
    res.status(204).end();
  }));
  registerDynamicApiRoutes(app,db,rbac,records);
  registerTenantInspectionRoutes(app,db,rbac,platformTenants);
  app.use('/api',(_req,res)=>{res.status(404).json({error:'API endpoint not implemented in SQL runtime'});});
  app.use((err:Error,_req:Request,res:Response,_next:NextFunction)=>{
    if(err.message==='Permission denied') res.status(403).json({error:'Permission denied'});
    else if(err.message==='Field already exists'||err.message==='Object already exists'||err.message==='Page layout revision conflict'||err.message==='Page revision conflict'||err.message==='Record has changed since it was loaded')res.status(409).json({error:err.message});
    else if(err.message==='Record not found'||err.message.endsWith('not found')) res.status(404).json({error:err.message});
    else if(err.message.startsWith('Invalid ')||err.message.startsWith('Unknown field')) res.status(400).json({error:err.message});
    else {console.error('SQL system request failed',err);res.status(503).json({error:'SQL service unavailable'});}
  });
  return app;
}
/**
 * Explicit first-run bootstrap: tenant and credentials are supplied only via env.
 * Never modifies an existing tenant, even when the bootstrap flag remains set.
 */
export async function bootstrapFreshTenant(db:SqlPersistence,env:NodeJS.ProcessEnv=process.env) {
  if(env.METADRIVE_FRESH_BOOTSTRAP!=='true')return false;
  const {rows}=await db.query<{count:string}>('SELECT count(*)::text AS count FROM md_tenants');
  if(Number(rows[0]?.count)!==0)return false;
  const requireEnv=(name:string)=>{const value=env[name]?.trim();if(!value)throw new Error('Missing fresh install setting: '+name);return value;};
  await new TenantProvisioning(db).provision({
    slug:requireEnv('METADRIVE_BOOTSTRAP_TENANT_ID'),
    name:requireEnv('METADRIVE_BOOTSTRAP_TENANT_NAME'),
    domain:requireEnv('METADRIVE_BOOTSTRAP_DOMAIN'),
    developerEmail:requireEnv('METADRIVE_BOOTSTRAP_ADMIN_EMAIL'),
    developerPassword:requireEnv('METADRIVE_BOOTSTRAP_ADMIN_PASSWORD')
  });
  return true;
}
export async function startSystemServer() {
  const db=new SqlPersistence(process.env.DATABASE_URL??'');
  try { await applySystemMigrations(db); await db.verifySchema();
    const seededTenants=await seedCoreObjectsForExistingTenants(db);
    console.info('Core metadata seeder: existing tenants backfilled:',seededTenants);
    await bootstrapFreshTenant(db); const status=await reconcileBootstrapPassword(db); if(status!=='disabled')console.info('First-install credential reconciliation:',status);
    const firstLogin=await rotateFirstLoginPassword(db);
    if(firstLogin!=='disabled')console.info('First-login credential rotation:',firstLogin);
    if(firstLogin==='rotated'){
      const {rows}=await db.query<{id:string}>(`SELECT t.id FROM md_tenants t JOIN md_tenant_domains d ON d.tenant_id=t.id WHERE d.domain=$1`,
        [process.env.METADRIVE_BOOTSTRAP_DOMAIN]);
      if(!rows[0])throw new Error('New login verification has no registered domain');
      const auth=new AuthenticationService(db);
      const session=await auth.signIn(rows[0].id,
        process.env.METADRIVE_BOOTSTRAP_ADMIN_EMAIL??'',
        process.env.METADRIVE_BOOTSTRAP_ADMIN_PASSWORD??'');
      await auth.signOut(session.accessToken,session.refreshToken);
      console.info('New developer login verification: passed');
    } }
  catch(error) { await db.close(); throw error; }
  const port=Number(process.env.PORT??10000);
  if(!Number.isInteger(port)||port<1||port>65535) throw new Error('Invalid PORT');
  return createSystemServer(db).listen(port,'0.0.0.0');
}
