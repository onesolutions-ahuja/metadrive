import {createHash} from 'node:crypto';
import {ComponentLibraryService} from './component-library-service.js';
import {DashboardSnapshotService} from './dashboard-snapshot-service.js';
import {DashboardSubscriptionService} from './dashboard-subscription-service.js';
import express, { type NextFunction, type Request, type Response } from 'express';
import { SqlPersistence } from '../system-files/sql-persistence.js';
import {applySystemMigrations} from './system-migrations.js';
import {loadFlowCapabilityCatalog} from '../system-files/flow-capability-catalog.js';
import {finishFlowOrchestrationDecision} from '../system-files/flow-orchestration-runtime.js';
import {seedCoreObjectsForExistingTenants} from '../app-seeders/fresh-core-objects.js';
import {reconcileCoreObjectDefaults} from '../app-seeders/core-object-defaults.js';
import {seedBundledComponentsForExistingTenants} from '../app-seeders/bundled-components.js';
import {seedProductImageFieldForExistingTenants} from '../app-seeders/product-image-field.js';
import { AuthenticationService } from '../system-files/authentication.js';
import {PasswordRecoverySettingsService} from './password-recovery-settings-service.js';
import {PasswordResetService} from './password-reset-service.js';
import {PasswordPolicyService} from './password-policy-service.js';
import {MfaService} from './mfa-service.js';
import {MfaBackupService} from './mfa-backup-service.js';
import {WebAuthnService} from './webauthn-service.js';
import {FederationService} from './federation-service.js';
import {SessionPolicyService,browserSecurityHeaders,readSessionPolicy} from './session-policy-service.js';
import {registerFederationCallback,registerIdentityPublicRoutes,registerIdentityAdminRoutes} from './identity-routes.js';
import {configureTrustedProxy,registerSecurityWebHost} from './security-web-host.js';
import {TenantDeveloperService} from './tenant-developer-service.js';
import {TenantRecoveryContacts} from './tenant-recovery-contacts.js';
import {TenantRecoveryCases} from './tenant-recovery-cases.js';
import {sessionMetadata} from '../system-files/session-metadata.js';
import { ObjectDefinitionService } from '../system-files/object-definition.js';
import {fieldTypeConversionSupported} from '../system-files/field-type-migration.js';
import {ObjectManagerMetadataService} from '../system-files/object-manager-metadata.js';
import {ObjectMetadataHistory} from '../system-files/object-metadata-history.js';
import {CustomMetadataService} from '../system-files/custom-metadata-service.js';
import { RbacEngine } from '../system-files/rbac-engine.js';
import {permittedApps} from './rbac-navigation.js';
import {RbacAdministration} from './rbac-administration.js';
import {NamedCredentialService} from './named-credential-service.js';
import {DurableJobService} from './durable-job-service.js';
import {OAuthAuthorizationService} from './oauth-authorization-service.js';
import {GlobalValueSetService} from './global-value-set-service.js';
import {SystemDefinitionService,definitionKinds,type DefinitionKind} from '../system-files/system-definition-service.js';
import { RecordEngine } from '../system-files/record-engine.js';
import {ExternalIdUpsert} from '../system-files/external-id-upsert.js';
import {DuplicateMatchError} from '../system-files/record-matching.js';
import {registerMatchingRoutes} from './matching-rule-routes.js';
import {parseRecordCursor,parseRecordFilters} from '../system-files/record-query.js';
import {SqlReportRuntime} from './sql-report-runtime.js';
import {RecordCollaborationService} from './record-collaboration-service.js';
import {ObjectQuickActionRuntime} from './object-quick-action-runtime.js';
import {RecordRetentionService} from './record-retention-service.js';
import {RecordListViewService,type ViewInput} from './record-list-view-service.js';
import {RecordFileService} from '../system-files/record-file-service.js';
import {TenantMediaService} from '../system-files/tenant-media-service.js';
import {registerDynamicApiRoutes} from './dynamic-api-routes.js';
import {registerDeclarativeRuleRoutes} from './declarative-rule-routes.js';
import {DeclarativeRuleError} from '../system-files/declarative-rules.js';
import {registerVersionedApiRoutes} from './versioned-api-routes.js';
import {registerPlatformEventStreamRoutes} from './platform-event-stream-routes.js';
import {registerOutboundWebhookRoutes} from './outbound-webhook-service.js';
import {countTenantApiRequests,registerTenantInspectionRoutes} from './tenant-inspection-routes.js';
import {registerDurableJobAdminRoutes} from './durable-job-admin-routes.js';
import {assertMetadataPackageEditable,MetadataPackageService,registerMetadataPackageRoutes} from './metadata-package-service.js';
import {OpenApiExternalService,registerOpenApiExternalServiceRoutes} from './openapi-external-service.js';

import { ComponentRuntime } from '../system-files/component-runtime.js';
import { PageRuntime } from '../system-files/page-runtime.js';
import { FlowRuntime } from '../system-files/flow-runtime.js';
import {flowRunHistory} from '../system-files/flow-run-history.js';
import {FlowCustomError} from '../system-files/flow-error-runtime.js';
import {FlowRecordTriggers} from '../system-files/flow-record-triggers.js';
import {flowFormulaReferences} from '../system-files/flow-formula-runtime.js';
import { AppRuntime } from '../system-files/app-runtime.js';
import { TenantProvisioning } from '../system-files/tenant-provisioning.js';
import {PlatformTenantService} from '../system-files/platform-tenant-service.js';
import {rotateFirstLoginPassword} from './first-login-rotation.js';
import {reconcileBootstrapPassword} from './bootstrap-password-sync.js';

type Actor={tenant_id:string;user_id:string};
type AuthenticatedRequest=Request<Record<string,string>> & {actor?:Actor};
const authorizeFormulaReferences=async(rbac:RbacEngine,actor:Actor,expression:string)=>{
  for(const reference of flowFormulaReferences(expression)){
    const match=/^([A-Za-z][A-Za-z0-9_]*)\.([A-Za-z][A-Za-z0-9_]*)$/.exec(reference);
    if(!match)throw new Error('Formula references must use Object.Field names');
    await rbac.require(actor.tenant_id,actor.user_id,match[1],'read');
    await rbac.require(actor.tenant_id,actor.user_id,match[1]+'.'+match[2],'read');
  }
};
type Handler=(req:AuthenticatedRequest,res:Response)=>Promise<unknown>;
const route=(handler:Handler)=>(req:Request,res:Response,next:NextFunction)=>{
  // These routes use named parameters only; Express wildcard parameters are not registered here.
  Promise.resolve(handler(req as AuthenticatedRequest,res)).catch(next);
};
const stableMetadata=(value:unknown):string=>JSON.stringify(value,(_key,item)=>
  item&&typeof item==='object'&&!Array.isArray(item)
    ?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
async function assertChangedPackagePermissionSetsEditable(db:SqlPersistence,
  administration:RbacAdministration,tenant:string,user:string,raw:unknown){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return;
  const next=(raw as Record<string,unknown>).permissionSets;
  if(!Array.isArray(next))return;
  const current=await administration.describe(tenant,user);
  const currentByApi=new Map(current.permissionSets.map(item=>[item.apiName,item]));
  const nextByApi=new Map(next.filter((item):item is Record<string,unknown>=>
    Boolean(item)&&typeof item==='object'&&!Array.isArray(item))
    .map(item=>[String(item.apiName??''),item]));
  for(const [apiName,previous] of currentByApi){
    const updated=nextByApi.get(apiName);
    if(stableMetadata(previous)!==stableMetadata(updated))
      await assertMetadataPackageEditable(db,tenant,'permission-set',apiName);
  }
}
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
  configureTrustedProxy(app,process.env.METADRIVE_TRUST_PROXY_CIDRS);
  app.disable('x-powered-by');
  app.use('/api/media-assets',express.json({limit:'8mb'}));
  app.use(express.json({limit:'2mb'}));
  app.use(express.urlencoded({extended:false,limit:'1mb'}));
  app.use((_req,res,next)=>{res.set(browserSecurityHeaders({frame_policy:'DENY',csp_enabled:true}));next();});
  const auth=new AuthenticationService(db);
  const rbac=new RbacEngine(db);
  const rbacAdministration=new RbacAdministration(db,rbac);
  const namedCredentials=new NamedCredentialService(db,rbac);
  const flowJobs=new DurableJobService(db);
  const recordRetention=new RecordRetentionService(db,rbac);
  const recoverySettings=new PasswordRecoverySettingsService(db,rbac);
  const records=new RecordEngine(db,rbac,namedCredentials);
  const externalIdUpsert=new ExternalIdUpsert(db,rbac,records);
  const recordListViews=new RecordListViewService(db,rbac);
  const reportRuntime=new SqlReportRuntime(db,rbac,records);
  const collaboration=new RecordCollaborationService(db,rbac);
  const recordFiles=new RecordFileService(db,rbac);
  const tenantMedia=new TenantMediaService(db,rbac);
  records.setRichTextFilePruner((client,tenantId,objectApi,recordId,fieldApi,html)=>
    recordFiles.pruneUnreferenced(client,tenantId,objectApi,recordId,fieldApi,html));
  const systemDefinitions=new SystemDefinitionService(db,rbac);
  const dashboardSnapshots=new DashboardSnapshotService(db,rbac,records,systemDefinitions);
  const dashboardSubscriptions=new DashboardSubscriptionService(db,rbac,systemDefinitions,namedCredentials,dashboardSnapshots);
  const oauth=new OAuthAuthorizationService(db,rbac,namedCredentials);
  const mfa=new MfaService(db,rbac,auth,namedCredentials);
  const federation=new FederationService(db,rbac,namedCredentials);
  const passkeys=new WebAuthnService(db,auth);
  const backups=new MfaBackupService(db,auth,mfa,rbac);
  const sessionPolicies=new SessionPolicyService(db,rbac);
  // SAML POSTs originate at the IdP. State + browser cookie protect these callbacks;
  // they must precede the browser-origin CORS gate and never accept bearer identity.
  registerFederationCallback(app,federation);
  const tenantDeveloper=new TenantDeveloperService(db,rbac,auth,mfa);
  const passwordReset=new PasswordResetService(db,auth,(tenant,credential,from,to,subject,body)=>
    namedCredentials.sendRecoveryEmail(tenant,credential,from,to,subject,body));
  const definitions=new ObjectDefinitionService(db,{
    encryptedValueVault:namedCredentials,
    evaluateFormula:(client,tenantId,userId,objectApi,fieldApi,recordId)=>
      records.evaluateFormulaForMigration(client,tenantId,userId,objectApi,fieldApi,recordId),
    recalculateRollup:(client,tenantId,objectApi,fieldApi)=>
      records.recalculateRollupForMigration(client,tenantId,objectApi,fieldApi)
  });
  const objectManagerMetadata=new ObjectManagerMetadataService(db,rbac);
  const objectHistory=new ObjectMetadataHistory(db);
  const customMetadata=new CustomMetadataService(db,rbac);
  const globalValueSets=new GlobalValueSetService(db,rbac);
  const components=new ComponentRuntime(db);
  const library=new ComponentLibraryService(db,rbac);
  const pages=new PageRuntime(db);
  const externalServices=new OpenApiExternalService(db,rbac);
  const flows=new FlowRuntime(db,rbac,records,
    (tenantId,userId,config,variables,key,execution)=>execution
      ?namedCredentials.enqueueCallout(execution.client,tenantId,userId,execution.runId,
        execution.nodeId,config,variables).then(()=>({status:202,body:''}))
      :namedCredentials.callout(tenantId,userId,config,variables,key),
    (client,tenantId,userId,flowApi,version,runId,scheduledAt,step,appApiName)=>
      flowJobs.enqueue(tenantId,'flow.resume',{
        actorUserId:userId,resourceId:runId,resourceVersion:version,
        ...(appApiName?{appApiName}:{}),scheduledAt,idempotencyKey:runId+':'+step
      },client).then(()=>undefined),
    async(client,tenantId,userId,flowId,version,runId,nodeId,step,message)=>{
      await namedCredentials.enqueueFlowEmail(client,tenantId,userId,flowId,version,runId,nodeId,step,
        message.credentialId,message.from,message.recipients,message.subject,message.body);
    });
  const quickActions=new ObjectQuickActionRuntime(db,rbac,records,collaboration,flows);
  const metadataPackages=new MetadataPackageService(db,rbac,definitions,pages,library,
    objectManagerMetadata,flows,rbacAdministration);
  const flowRecordTriggers=new FlowRecordTriggers(rbac,flows,records,db,
    async(client,tenantId,userId,flowApi,version,runId,scheduledAt,step,appApiName)=>{
      await flowJobs.enqueue(tenantId,'flow.resume',{
        actorUserId:userId,resourceId:runId,resourceVersion:version,
        ...(appApiName?{appApiName}:{}),scheduledAt,idempotencyKey:runId+':'+step
      },client);
    });
  records.setRecordTriggerHandler((client,tenantId,userId,objectApi,operation,record,prior,phase,isClone)=>
    flowRecordTriggers.execute(client,tenantId,userId,objectApi,operation,record,prior,phase,isClone));
  const apps=new AppRuntime(db);
  const platformTenants=new PlatformTenantService(db,rbac);
  const recoveryContacts=new TenantRecoveryContacts(db,rbac,mfa,namedCredentials);
  const recoveryCases=new TenantRecoveryCases(db,rbac,platformTenants,mfa,recoveryContacts,namedCredentials);

  // CORS is granted only to origins registered for a SQL tenant.
  app.use(async (req,res,next)=>{
    try {
    const origin=req.get('origin');
    if(origin) {
      let host:string;
      try { const parsed=new URL(origin); if(!['https:','http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname!=='/' || parsed.search || parsed.hash) throw Error(); if(process.env.NODE_ENV==='production' && (parsed.protocol!=='https:' || (parsed.port && parsed.port!=='443')))throw Error(); host=parsed.hostname.toLowerCase(); }
      catch { res.status(403).json({error:'Unrecognised origin'});return; }
      const authorized=await db.query('SELECT tenant_id FROM md_tenant_domains WHERE domain=$1',[host]);
      if(!authorized.rows.length) { res.status(403).json({error:'Unregistered origin'});return; }
      res.setHeader('Access-Control-Allow-Origin',origin);
      res.setHeader('Access-Control-Allow-Credentials','true');
      res.setHeader('Vary','Origin');
      res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, If-Match, If-Unmodified-Since, X-MetaDrive-Request-Source, X-MetaDrive-Offline-Sync');
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
      req.actor=await auth.authenticate(bearer.slice(7),{ip:req.ip});
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
      const userId=await auth.verifyIdentity(tenantId,email,password,req.ip);
      const challenge=await mfa.createChallenge(tenantId,userId,{ip:req.ip});
      if(challenge){res.json(challenge);return;}
      const session=await auth.issuePasswordSession(tenantId,userId,{ip:req.ip});
      res.setHeader('Set-Cookie',`${tokenCookie}=${session.refreshToken}; ${cookieOptions(req)}`);
      res.json({access_token:session.accessToken,expires_in:session.expiresIn});
    } catch(error) {
      // Distinguish rejected credentials from SQL/session failures. A successful
      // password check followed by a failed database write must not become 401.
      if(error instanceof Error&&(error.message.startsWith('Invalid credentials')||error.message.startsWith('Password expired.')))
        res.status(401).json({error:error.message});
      else throw error;
    }
  }));
  app.post('/api/auth/refresh',route(async(req,res)=>{
    const token=getCookie(req);
    if(!token) {res.status(401).json({error:'Refresh token required'});return;}
    try {
      const session=await auth.refresh(token,{ip:req.ip});
      res.setHeader('Set-Cookie',`${tokenCookie}=${session.refreshToken}; ${cookieOptions(req)}`);
      res.json({access_token:session.accessToken,expires_in:session.expiresIn});
    } catch {res.status(401).json({error:'Invalid refresh session'});}
  }));
  app.post('/api/auth/password-reset/request',route(async(req,res)=>{
    const tenantId=await resolveTenant(db,req,req.body?.tenantSlug);
    if(!tenantId){res.status(400).json({error:'Tenant domain is required'});return;}
    res.status(202).json(await passwordReset.request(tenantId,req.body?.email));
  }));
  app.post('/api/auth/password-reset/confirm',route(async(req,res)=>{
    const tenantId=await resolveTenant(db,req,req.body?.tenantSlug);
    if(!tenantId){res.status(400).json({error:'Tenant domain is required'});return;}
    res.json(await passwordReset.confirm(tenantId,req.body?.email,req.body?.token,req.body?.newPassword));
  }));
  app.post('/api/auth/mfa/verify',route(async(req,res)=>{
    const session=await mfa.verifyChallenge(req.body?.challenge_token,req.body?.code,{ip:req.ip});
    res.setHeader('Set-Cookie',`${tokenCookie}=${session.refreshToken}; ${cookieOptions(req)}`);
    res.json({access_token:session.accessToken,expires_in:session.expiresIn});
  }));
  // Provider callback uses a one-time SQL state, never an unauthenticated tenant selector.
  app.get('/api/oauth/callback',route(async(req,res)=>{
    const redirect=await oauth.complete(req.query.state,req.query.code);
    res.setHeader('Cache-Control','no-store');
    res.redirect(303,redirect);
  }));
  // Public verification endpoints require high-entropy one-time tokens, not bearer identity.
  app.post('/api/recovery/contacts/verify',route(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.json(await recoveryContacts.verify(req.body));
  }));
  app.post('/api/recovery/cases/:id/confirm',route(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.json(await recoveryCases.proof(req.params.id,req.body,false));
  }));
  app.post('/api/recovery/cases/:id/dispute',route(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.json(await recoveryCases.proof(req.params.id,req.body,true));
  }));
  registerIdentityPublicRoutes(app,{federation,auth,mfa,passkeys,resolveTenant:req=>resolveTenant(db,req),
    setSession:(req,res,session)=>{
      const previous=res.getHeader('Set-Cookie');
      res.setHeader('Set-Cookie',[...(Array.isArray(previous)?previous:previous?[String(previous)]:[]),`${tokenCookie}=${session.refreshToken}; ${cookieOptions(req)}`]);
      res.json({access_token:session.accessToken,expires_in:session.expiresIn});
    }});
  app.use('/api',authorize);
  registerIdentityAdminRoutes(app,{sessions:sessionPolicies,federation,passkeys,backups});
  app.use('/api',countTenantApiRequests(db));
  app.use('/services/data',authorize);
  app.use('/services/data',countTenantApiRequests(db));
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
    const updated=await db.transaction(async client=>{
      // Serialize all decisions in a stage BEFORE locking individual approval rows.
      // Otherwise concurrent approvers can deadlock with outstanding-item cancellation.
      const {rows:pending}=await client.query<{group_id:string}>(`
        SELECT group_id FROM md_approval_requests
        WHERE tenant_id=$1 AND id=$2 AND approver_id=$3 AND status='Pending'
      `,[actor.tenant_id,req.params.id,actor.user_id]);
      if(!pending[0])return null;
      await client.query(`
        SELECT 1 FROM md_flow_approval_stages
        WHERE tenant_id=$1 AND group_id=$2 FOR UPDATE
      `,[actor.tenant_id,pending[0].group_id]);
      const {rows}=await client.query<ApprovalSqlRow>(
        "UPDATE md_approval_requests SET status=$4,decision_comments=$5,decided_at=now(),decided_by=$2 WHERE tenant_id=$1 AND approver_id=$2 AND id=$3 AND status='Pending' RETURNING *",
        [actor.tenant_id,actor.user_id,req.params.id,decision,comments]);
      if(!rows[0])return null;
      // A normal approval is unchanged. Only approvals tied to a durable
      // orchestration stage can schedule interview resumption.
      const resume=await finishFlowOrchestrationDecision(client,actor.tenant_id,rows[0].group_id);
      if(resume)await flowJobs.enqueue(actor.tenant_id,'flow.resume',{
        actorUserId:resume.actorUserId,resourceId:resume.runId,
        resourceVersion:resume.version,
        ...(resume.appApiName?{appApiName:resume.appApiName}:{}),
        idempotencyKey:resume.runId+':orchestration:'+rows[0].group_id
      },client);
      return rows[0];
    });
    if(!updated){res.status(404).json({error:'Pending approval not found'});return;}
    res.json({request:approvalView(updated)});
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
  app.get('/api/auth/mfa/status',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await mfa.status(actor.tenant_id,actor.user_id));
  }));
  app.get('/api/auth/mfa/policy',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await mfa.policy(actor.tenant_id,actor.user_id));
  }));
  app.put('/api/auth/mfa/policy',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await mfa.setPolicy(actor.tenant_id,actor.user_id,req.body?.mode));
  }));
  app.post('/api/auth/mfa/enroll',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await mfa.enroll(actor.tenant_id,actor.user_id,req.body?.password));
  }));
  app.post('/api/auth/mfa/enroll/confirm',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await mfa.confirmEnrollment(actor.tenant_id,actor.user_id,req.body?.enrollment_token,req.body?.code));
  }));
  app.post('/api/auth/mfa/disable',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await mfa.disable(actor.tenant_id,actor.user_id,req.body?.password,req.body?.code));
  }));
  app.get('/api/tenant/recovery/contacts',route(async(req,res)=>{
    const actor=req.actor!;
    res.setHeader('Cache-Control','no-store');
    res.json(await recoveryContacts.list(actor.tenant_id,actor.user_id));
  }));
  app.post('/api/tenant/recovery/contacts',route(async(req,res)=>{
    const actor=req.actor!;
    res.setHeader('Cache-Control','no-store');
    res.status(201).json(await recoveryContacts.enroll(actor.tenant_id,actor.user_id,req.body));
  }));
  app.post('/api/platform/recovery/cases',route(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.status(201).json(await recoveryCases.open(req.actor!,req.body));
  }));
  app.get('/api/platform/recovery/cases/:id',route(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.json(await recoveryCases.read(req.actor!,req.params.id));
  }));
  app.post('/api/platform/recovery/cases/:id/approve',route(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.json(await recoveryCases.approve(req.actor!,req.params.id,req.body));
  }));
  app.post('/api/platform/recovery/cases/:id/invite',route(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.json(await recoveryCases.invite(req.actor!,req.params.id,req.body));
  }));
  app.post('/api/tenant/recovery/cases/:id/redeem',route(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.json(await recoveryCases.redeem(req.actor!,req.params.id,req.body));
  }));
  app.post('/api/tenant/recovery/cases/:id/repair',route(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.json(await recoveryCases.repair(req.actor!,req.params.id,req.body));
  }));
  app.get('/api/tenant/developer-account',route(async(req,res)=>{
    const actor=req.actor!;
    res.setHeader('Cache-Control','no-store');
    res.json(await tenantDeveloper.status(actor.tenant_id,actor.user_id));
  }));
  app.post('/api/tenant/developer-account/activate',route(async(req,res)=>{
    const actor=req.actor!;
    res.setHeader('Cache-Control','no-store');
    res.json(await tenantDeveloper.activate(actor.tenant_id,actor.user_id,req.body));
  }));
  app.get('/api/auth/user-locks',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'Security','read');
    const {rows}=await db.query<{id:string;email:string;display_name:string;enabled:boolean;locked_until:Date|null}>(
      'SELECT id,email,display_name,enabled,locked_until FROM md_users WHERE tenant_id=$1 ORDER BY email LIMIT 500',[actor.tenant_id]);
    res.json({users:rows.map(r=>({id:r.id,name:r.display_name||r.email,email:r.email,active:r.enabled,
      lockedUntil:r.locked_until?new Date(r.locked_until).getTime():null}))});
  }));
  // Security administration: tenant-scoped account locks and session revocation.
  const setAccountLock=route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'Security','manage');
    const id=req.params.id;
    if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
      throw new Error('Invalid user ID');
    if(id===actor.user_id)throw new Error('Cannot alter own account lock');
    const locking=req.path.endsWith('/lock');
    const duration=req.body?.durationMinutes;
    if(locking && (!Number.isInteger(duration)||duration<1||duration>1440))
      throw new Error('Invalid account lock duration');
    await db.transaction(async client=>{
      const updated=await client.query(`UPDATE md_users SET failed_login_attempts=0,locked_until=${locking?"now() + ($3::integer * interval '1 minute')":"NULL"}
        WHERE tenant_id=$1 AND id=$2 RETURNING id`,locking
        ?[actor.tenant_id,id,duration]:[actor.tenant_id,id]);
      if(!updated.rowCount)throw new Error('User not found');
      if(locking)for(const table of ['md_sessions','md_refresh_sessions'])
        await client.query('UPDATE '+table+' SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[actor.tenant_id,id]);
      await client.query('INSERT INTO md_security_events(tenant_id,actor_user_id,action,subject_user_id) VALUES($1,$2,$3,$4)',
        [actor.tenant_id,actor.user_id,locking?'UserLocked':'UserUnlocked',id]);
    });
    res.json({success:true});
  });
  app.post('/api/auth/users/:id/lock',setAccountLock);
  app.post('/api/auth/users/:id/unlock',setAccountLock);
  const passwordPolicy=new PasswordPolicyService(db,rbac);
  app.get('/api/auth/password-policy',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await passwordPolicy.read(actor.tenant_id,actor.user_id));
  }));
  app.put('/api/auth/password-policy',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await passwordPolicy.save(actor.tenant_id,actor.user_id,req.body));
  }));
  app.get('/api/auth/security-events',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'Security','read');
    const limit=Number(req.query.limit??50);
    if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('Invalid pagination');
    const {rows}=await db.query<{id:string;actor_user_id:string|null;action:string;login_identifier:string|null;source_ip:string|null;details:Record<string,string>;created_at:Date}>(
      'SELECT id,actor_user_id,action,details,created_at,login_identifier,source_ip FROM md_security_events WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2',[actor.tenant_id,limit]);
    res.json({events:rows.map(r=>({id:r.id,actorUserId:r.actor_user_id,at:new Date(r.created_at).toISOString(),action:r.action,details:r.details,loginIdentifier:r.login_identifier,sourceIp:r.source_ip}))});
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
      const target=await client.query('UPDATE md_users SET failed_login_attempts=0,locked_until=NULL WHERE tenant_id=$1 AND id=$2 RETURNING id',[actor.tenant_id,id]);
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
  app.get('/api/tenant/business-calendar',route(async(req,res)=>{
    const actor=req.actor!;
    res.setHeader('Cache-Control','private, no-store');
    res.json({calendar:await platformTenants.getSetting(actor.tenant_id,actor.user_id,'business-calendar')});
  }));
  app.put('/api/tenant/business-calendar',route(async(req,res)=>{
    const actor=req.actor!;
    res.json({calendar:await platformTenants.saveSetting(actor.tenant_id,actor.user_id,'business-calendar',req.body)});
  }));
  app.get('/api/tenant/offline-briefcase',route(async(req,res)=>{
    const actor=req.actor!;
    res.setHeader('Cache-Control','private, no-store');
    res.json({briefcase:await platformTenants.getSetting(
      actor.tenant_id,actor.user_id,'offline-briefcase')??{selections:[]}});
  }));
  app.put('/api/tenant/offline-briefcase',route(async(req,res)=>{
    const actor=req.actor!;
    res.setHeader('Cache-Control','private, no-store');
    res.json({briefcase:await platformTenants.saveSetting(
      actor.tenant_id,actor.user_id,'offline-briefcase',req.body)});
  }));
  app.get('/api/tenant/offline-briefcase/data',route(async(req,res)=>{
    const actor=req.actor!;
    res.setHeader('Cache-Control','private, no-store');
    const configuration=await platformTenants.getSetting(
      actor.tenant_id,actor.user_id,'offline-briefcase') as {selections?:unknown}|null;
    if(!configuration)return res.json({
      tenantId:actor.tenant_id,userId:actor.user_id,syncedAt:new Date().toISOString(),selections:[]
    });
    if(!Array.isArray(configuration.selections))
      throw new Error('Invalid saved offline briefcase configuration');
    const selections=await Promise.all(configuration.selections.map(async(selection:unknown)=>{
      if(!selection||typeof selection!=='object'||Array.isArray(selection))
        throw new Error('Invalid saved offline briefcase selection');
      const item=selection as Record<string,unknown>;
      const objectApi=item.objectApi;
      const recordIds=item.recordIds;
      if(typeof objectApi!=='string'||!Array.isArray(recordIds)
        ||!recordIds.every((id):id is string=>typeof id==='string'))
        throw new Error('Invalid saved offline briefcase selection');
      return {objectApi,records:await Promise.all(recordIds.map(async recordId=>({
        recordId,record:await records.get(actor.tenant_id,actor.user_id,objectApi,recordId)
      })))};
    }));
    res.json({tenantId:actor.tenant_id,userId:actor.user_id,
      syncedAt:new Date().toISOString(),selections});
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
      {autoRetryFailedFlows:false,maxRetryAttempts:10,conversationIdleMinutes:15,flowServiceUserId:null});
  }));
  app.put('/api/metadata/automation-settings',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await platformTenants.saveSetting(actor.tenant_id,actor.user_id,'automation-settings',req.body));
  }));
  app.get('/api/metadata/automation-service-users',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'TenantSettings','manage');
    const {rows}=await db.query<{id:string;email:string;display_name:string;enabled:boolean}>(
      'SELECT id,email,display_name,enabled FROM md_users WHERE tenant_id=$1 ORDER BY email,id LIMIT 500',
      [actor.tenant_id]);
    res.json({users:rows.map(user=>({
      id:user.id,name:user.display_name||user.email,email:user.email,enabled:user.enabled
    }))});
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
  app.put('/api/metadata/permissions/sets',route(async(req,res)=>{
    const actor=req.actor!;
    await assertChangedPackagePermissionSetsEditable(db,rbacAdministration,actor.tenant_id,actor.user_id,req.body);
    res.json(await rbacAdministration.save(actor.tenant_id,actor.user_id,req.body));
  }));
  app.put('/api/metadata/permissions',route(async(req,res)=>{
    const actor=req.actor!;
    await assertChangedPackagePermissionSetsEditable(db,rbacAdministration,actor.tenant_id,actor.user_id,req.body);
    res.json(await rbacAdministration.save(actor.tenant_id,actor.user_id,req.body));
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
        else if(field.dataType!==canonical.dataType
          &&!fieldTypeConversionSupported(canonical.dataType,field.dataType))
          errors.push('Unsupported field datatype change: '+field.apiName);
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
    await assertMetadataPackageEditable(db,actor.tenant_id,'object',req.params.apiName);
    await rbac.require(actor.tenant_id,actor.user_id,'FieldDefinition','manage');
    await rbac.require(actor.tenant_id,actor.user_id,req.params.apiName,'edit');
    const proposal=req.body;
    if(!proposal||typeof proposal!=='object'||Array.isArray(proposal))
      throw new Error('Invalid field update');
    res.json({object:await definitions.updateField(actor.tenant_id,req.params.apiName,
      req.params.fieldApi,proposal,actor.user_id)});
  }));
  app.get('/api/metadata/objects/:apiName/fields/:fieldApi/migrations',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'FieldDefinition','read');
    await rbac.require(actor.tenant_id,actor.user_id,req.params.apiName,'read');
    res.json({migrations:await definitions.listFieldTypeMigrations(
      actor.tenant_id,req.params.apiName,req.params.fieldApi)});
  }));
  app.post('/api/metadata/objects/:apiName/fields/:fieldApi/migrations/:migrationId/rollback',route(async(req,res)=>{
    const actor=req.actor!;
    await assertMetadataPackageEditable(db,actor.tenant_id,'object',req.params.apiName);
    await rbac.require(actor.tenant_id,actor.user_id,'FieldDefinition','manage');
    await rbac.require(actor.tenant_id,actor.user_id,req.params.apiName,'edit');
    res.json({object:await definitions.rollbackFieldTypeMigration(
      actor.tenant_id,req.params.apiName,req.params.fieldApi,req.params.migrationId)});
  }));
  app.post('/api/metadata/objects/:apiName/formulas/validate',route(async(req,res)=>{
    const actor=req.actor!;
    const objectApi=req.params.apiName;
    if(typeof objectApi!=='string')throw new Error('Invalid object name');
    await rbac.require(actor.tenant_id,actor.user_id,'FieldDefinition','create');
    await rbac.require(actor.tenant_id,actor.user_id,objectApi,'read');
    const {expression,returnType}=req.body??{};
    if(typeof expression!=='string'||!expression.trim()||expression.length>4000
      ||!['Number','Currency','Percent','Text','Date','DateTime','Time','Checkbox'].includes(returnType))
      throw new Error('Invalid formula definition');
    await authorizeFormulaReferences(rbac,actor,expression);
    const validatedReferences=await definitions.validateFormula(
      actor.tenant_id,objectApi,expression,returnType);
    res.json({valid:true,references:validatedReferences});
  }));
  app.delete('/api/metadata/objects/:apiName/fields/:fieldApi',route(async(req,res)=>{
    const actor=req.actor!;
    await assertMetadataPackageEditable(db,actor.tenant_id,'object',req.params.apiName);
    await rbac.require(actor.tenant_id,actor.user_id,'FieldDefinition','manage');
    await rbac.require(actor.tenant_id,actor.user_id,req.params.apiName,'edit');
    res.json({object:await definitions.deleteField(actor.tenant_id,req.params.apiName,req.params.fieldApi)});
  }));
  app.get('/api/metadata/objects/:apiName/deleted-fields',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'FieldDefinition','read');
    await rbac.require(actor.tenant_id,actor.user_id,req.params.apiName,'read');
    res.json(await definitions.listDeletedFields(actor.tenant_id,req.params.apiName));
  }));
  app.post('/api/metadata/objects/:apiName/fields/:fieldApi/restore',route(async(req,res)=>{
    const actor=req.actor!;
    await assertMetadataPackageEditable(db,actor.tenant_id,'object',req.params.apiName);
    await rbac.require(actor.tenant_id,actor.user_id,'FieldDefinition','manage');
    await rbac.require(actor.tenant_id,actor.user_id,req.params.apiName,'edit');
    res.json({object:await definitions.restoreField(actor.tenant_id,req.params.apiName,req.params.fieldApi)});
  }));
  app.get('/api/metadata/global-value-sets',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await globalValueSets.list(actor));
  }));
  app.post('/api/metadata/global-value-sets',route(async(req,res)=>{
    const actor=req.actor!;
    res.status(201).json(await globalValueSets.create(actor,req.body));
  }));
  app.put('/api/metadata/global-value-sets/:id',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await globalValueSets.update(actor,req.params.id,req.body));
  }));
  app.delete('/api/metadata/global-value-sets/:id',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await globalValueSets.delete(actor,req.params.id));
  }));
  app.get('/api/metadata/custom-labels',route(async(req,res)=>{
    const actor=req.actor!;
    const language=typeof req.query.language==='string'?req.query.language:undefined;
    res.json({labels:await customMetadata.listCustomLabels(actor.tenant_id,actor.user_id,language)});
  }));
  app.get('/api/metadata/custom-labels/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    const language=typeof req.query.language==='string'?req.query.language:'en';
    res.json({label:await customMetadata.getCustomLabel(actor.tenant_id,actor.user_id,req.params.apiName,language)});
  }));
  app.put('/api/metadata/custom-labels/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    const input={...req.body,apiName:req.params.apiName};
    res.json({label:await customMetadata.saveCustomLabel(actor.tenant_id,actor.user_id,input)});
  }));
  app.delete('/api/metadata/custom-labels/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    const language=typeof req.query.language==='string'?req.query.language:'en';
    await customMetadata.deleteCustomLabel(actor.tenant_id,actor.user_id,req.params.apiName,language);
    res.status(204).end();
  }));
  app.get('/api/metadata/custom-metadata-types',route(async(req,res)=>{
    const actor=req.actor!;
    res.json({types:await customMetadata.listCustomMetadataTypes(actor.tenant_id,actor.user_id)});
  }));
  app.post('/api/metadata/custom-metadata-types',route(async(req,res)=>{
    const actor=req.actor!;
    res.status(201).json({type:await customMetadata.createCustomMetadataType(actor.tenant_id,actor.user_id,req.body)});
  }));
  app.get('/api/metadata/custom-metadata-types/:typeApi/records',route(async(req,res)=>{
    const actor=req.actor!;
    res.json({records:await customMetadata.listCustomMetadataRecords(actor.tenant_id,actor.user_id,req.params.typeApi)});
  }));
  app.get('/api/metadata/custom-metadata-types/:typeApi/records/:recordKey',route(async(req,res)=>{
    const actor=req.actor!;
    res.json({record:await customMetadata.getCustomMetadataRecord(
      actor.tenant_id,actor.user_id,req.params.typeApi,req.params.recordKey)});
  }));
  app.put('/api/metadata/custom-metadata-types/:typeApi/records/:recordKey',route(async(req,res)=>{
    const actor=req.actor!;
    const input={...req.body,recordKey:req.params.recordKey};
    res.json({record:await customMetadata.saveCustomMetadataRecord(
      actor.tenant_id,actor.user_id,req.params.typeApi,input)});
  }));
  app.delete('/api/metadata/custom-metadata-types/:typeApi/records/:recordKey',route(async(req,res)=>{
    const actor=req.actor!;
    await customMetadata.deleteCustomMetadataRecord(actor.tenant_id,actor.user_id,req.params.typeApi,req.params.recordKey);
    res.status(204).end();
  }));
  app.post('/api/metadata/custom-settings',route(async(req,res)=>{
    const actor=req.actor!;
    res.status(201).json({setting:await customMetadata.createCustomSetting(actor.tenant_id,actor.user_id,req.body)});
  }));
  app.get('/api/metadata/custom-settings',route(async(req,res)=>{
    const actor=req.actor!;
    res.json({settings:await customMetadata.listCustomSettings(actor.tenant_id,actor.user_id)});
  }));
  app.put('/api/metadata/custom-settings/:settingApi/values',route(async(req,res)=>{
    const actor=req.actor!;
    const {scope,ownerId,values}=req.body??{};
    res.json(await customMetadata.writeCustomSettingValues(
      actor.tenant_id,actor.user_id,req.params.settingApi,scope,values,ownerId));
  }));
  app.get('/api/metadata/custom-settings/:settingApi/values',route(async(req,res)=>{
    const actor=req.actor!;
    const targetUserId=typeof req.query.userId==='string'?req.query.userId:actor.user_id;
    res.json(await customMetadata.getCustomSettingValues(
      actor.tenant_id,actor.user_id,req.params.settingApi,targetUserId,
      typeof req.query.scope==='string'?req.query.scope as 'organization'|'profile'|'user':undefined,
      typeof req.query.ownerId==='string'?req.query.ownerId:undefined));
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
  app.get('/api/metadata/objects/:apiName/history',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ObjectDefinition','read');
    await rbac.require(actor.tenant_id,actor.user_id,req.params.apiName,'read');
    const limit=Number(req.query.limit??100);
    res.json({history:await objectHistory.list(actor.tenant_id,req.params.apiName,limit)});
  }));
  app.get('/api/metadata/objects/:apiName/history/:revision',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ObjectDefinition','read');
    await rbac.require(actor.tenant_id,actor.user_id,req.params.apiName,'read');
    if(!/^[1-9][0-9]*$/.test(req.params.revision))throw new Error('Invalid metadata revision');
    res.json({change:await objectHistory.revision(actor.tenant_id,req.params.apiName,Number(req.params.revision))});
  }));
  app.get('/api/metadata/objects/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ObjectDefinition','read');
    await rbac.require(actor.tenant_id,actor.user_id,req.params.apiName,'read');
    const object=await definitions.get(actor.tenant_id,req.params.apiName);
    const configuration=await objectManagerMetadata.load(actor.tenant_id,actor.user_id,req.params.apiName);
    res.json({object:{...object,...configuration}});
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
    const objects=await definitions.list(actor.tenant_id);
    const configurations=await objectManagerMetadata.loadForObjects(actor.tenant_id,
      objects.map(object=>object.apiName));
    res.json({objects:objects.map(object=>{
      const configuration=configurations.get(object.apiName);
      return {...object,...configuration};
    })});
  }));
  app.post('/api/metadata/objects',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ObjectDefinition','create');
    const {apiName,label}=req.body??{};
    if(typeof apiName!=='string'||typeof label!=='string')throw new Error('Invalid object definition');
    const payload=req.body??{};
    if(Array.isArray(payload.fields))for(const rawField of payload.fields){
      if(!rawField||typeof rawField!=='object'||Array.isArray(rawField))continue;
      const formula=(rawField as Record<string,unknown>).formula;
      if(!formula||typeof formula!=='object'||Array.isArray(formula))continue;
      const expression=(formula as Record<string,unknown>).expression;
      if(typeof expression==='string')await authorizeFormulaReferences(rbac,actor,expression);
    }
    const object=await definitions.create(actor.tenant_id,apiName,label,payload.fields??[],async client=>{
      await objectManagerMetadata.persistWithin(client,actor.tenant_id,apiName,{
        pluralLabel:payload.pluralLabel,description:payload.description??'',helpText:payload.helpText??'',
        settings:payload.settings??{},fieldSets:payload.fieldSets??[],actions:payload.actions??[],
        searchLayouts:payload.searchLayouts
      });
    });
    const configuration=await objectManagerMetadata.load(actor.tenant_id,actor.user_id,apiName);
    res.status(201).json({object:{...object,...configuration}});
  }));
  app.put('/api/metadata/objects/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    await assertMetadataPackageEditable(db,actor.tenant_id,'object',req.params.apiName);
    await assertMetadataPackageEditable(db,actor.tenant_id,'object-config',req.params.apiName);
    await rbac.require(actor.tenant_id,actor.user_id,'ObjectDefinition','manage');
    await rbac.require(actor.tenant_id,actor.user_id,req.params.apiName,'edit');
    const revisionHeader=req.get('if-match')??'';
    if(!/^"(0|[1-9][0-9]*)"$/.test(revisionHeader))throw new Error('Invalid page layout revision precondition');
    const draft=req.body;
    if(!draft||typeof draft!=='object'||Array.isArray(draft)||draft.apiName!==req.params.apiName)
      throw new Error('Invalid object draft');
    // Unsupported configuration must never appear successfully saved.
    if(draft.validationRules?.length||draft.formulaFields?.length||draft.compactLayouts?.length)
      throw new Error('Invalid unsupported object configuration');
    const object=await definitions.replaceLayouts(actor.tenant_id,req.params.apiName,draft,
      Number(revisionHeader.slice(1,-1)),actor.user_id,async client=>{
        await objectManagerMetadata.persistWithin(client,
          actor.tenant_id,req.params.apiName,{
          description:draft.description,helpText:draft.helpText,settings:draft.settings,
          fieldSets:draft.fieldSets,actions:draft.actions,searchLayouts:draft.searchLayouts
          });
      });
    const configuration=await objectManagerMetadata.load(actor.tenant_id,actor.user_id,req.params.apiName);
    res.json({object:{...object,...configuration}});
  }));
  app.post('/api/metadata/objects/:apiName/fields',route(async(req,res)=>{
    const actor=req.actor!;
    await assertMetadataPackageEditable(db,actor.tenant_id,'object',req.params.apiName);
    await rbac.require(actor.tenant_id,actor.user_id,'FieldDefinition','create');
    const field=req.body?.field??req.body??{};
    const {apiName,dataType}=field;
    const relatedObject=field.relatedObject??field.relationship?.targetObject;
    if(typeof apiName!=='string'||typeof dataType!=='string'||
      (relatedObject!==undefined&&typeof relatedObject!=='string'))
      throw new Error('Invalid field definition');
    const formula=field.formula;
    if(formula&&typeof formula==='object'&&!Array.isArray(formula)
      &&typeof formula.expression==='string')
      await authorizeFormulaReferences(rbac,actor,formula.expression);
    await definitions.addField(actor.tenant_id,req.params.apiName,apiName,dataType,relatedObject,typeof field.label==='string'?field.label:undefined,field);
    res.status(201).json({object:await definitions.get(actor.tenant_id,req.params.apiName)});
  }));
  app.get('/api/component-library',route(async(req,res)=>{
    const actor=req.actor!;
    const [components,registered,canManage]=await Promise.all([
      library.list(actor.tenant_id,actor.user_id),
      db.query<{api_name:string;renderer_key:string}>(`SELECT api_name,renderer_key
        FROM md_component_definitions
        WHERE tenant_id=$1 AND enabled=true AND renderer_key='one-bundled:' || api_name
        ORDER BY api_name`,[actor.tenant_id]),
      rbac.allowed(actor.tenant_id,actor.user_id,'ComponentDefinition','create')
    ]);
    res.json({components,registered:registered.rows.map(row=>({
      apiName:row.api_name,rendererKey:row.renderer_key
    })),canManage});
  }));
  app.post('/api/component-library',route(async(req,res)=>{
    const actor=req.actor!;
    res.status(201).json({component:await library.save(actor.tenant_id,actor.user_id,req.body)});
  }));
  app.put('/api/component-library/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    await assertMetadataPackageEditable(db,actor.tenant_id,'component',req.params.apiName);
    res.json({component:await library.save(actor.tenant_id,actor.user_id,req.body,req.params.apiName)});
  }));
  app.post('/api/component-library/:apiName/publish',route(async(req,res)=>{
    const actor=req.actor!;
    await assertMetadataPackageEditable(db,actor.tenant_id,'component',req.params.apiName);
    res.json({component:await library.publish(actor.tenant_id,actor.user_id,req.params.apiName)});
  }));
  app.post('/api/component-library/:apiName/rollback',route(async(req,res)=>{
    const actor=req.actor!;
    await assertMetadataPackageEditable(db,actor.tenant_id,'component',req.params.apiName);
    res.json({component:await library.publish(actor.tenant_id,actor.user_id,
      req.params.apiName,req.body?.version)});
  }));
  app.delete('/api/component-library/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    await assertMetadataPackageEditable(db,actor.tenant_id,'component',req.params.apiName);
    await library.remove(actor.tenant_id,actor.user_id,req.params.apiName);
    res.status(204).end();
  }));
  // Authenticated publication of display-only metadata. No cached record data or grants.
  app.get('/api/metadata/offline-publication',route(async(req,res)=>{
    const actor=req.actor!;
    await Promise.all(['ObjectDefinition','PageDefinition','ComponentDefinition'].map(
      resource=>rbac.require(actor.tenant_id,actor.user_id,resource,'read')));
    const [objects,publishedPages,availableApps,library]=await Promise.all([
      definitions.list(actor.tenant_id),
      pages.list(actor.tenant_id),
      apps.listMetadata(actor.tenant_id),
      components.list(actor.tenant_id)
    ]);
    const content={
      pages:publishedPages,
      apps:await permittedApps(rbac,actor.tenant_id,actor.user_id,availableApps),
      objects,components:library
    };
    const digest=createHash('sha256').update(JSON.stringify(content)).digest('hex');
    res.setHeader('Cache-Control','no-store');
    res.json({content,publication:{
      revision:{version:1,publishedAt:Date.now(),digest},
      verifiedDigest:digest,minimumVersion:1
    }});
  }));
  // Builder-only metadata is loaded on demand; never include it in tenant login bootstrap.
  app.get('/api/metadata/flow-capabilities',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'FlowDefinition','read');
    res.setHeader('Cache-Control','no-store');
    res.json(await loadFlowCapabilityCatalog(db,actor.tenant_id));
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
    await assertMetadataPackageEditable(db,actor.tenant_id,'page',req.params.apiName);
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
  app.post('/api/named-credentials/:id/oauth/start',route(async(req,res)=>{
    const actor=req.actor!;
    res.setHeader('Cache-Control','no-store');
    res.json(await oauth.start(actor.tenant_id,actor.user_id,req.params.id));
  }));
  app.post('/api/named-credentials/:id/test',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'NamedCredential','manage');
    const result=await namedCredentials.callout(
      actor.tenant_id,actor.user_id,
      {namedCredentialId:req.params.id,method:'GET',path:''},{},'credential-connectivity-test');
    res.json({success:true,status:result.status});
  }));
  app.post('/api/named-credentials/:id/rotate',route(async(req,res)=>{
    const actor=req.actor!;
    res.json({credential:await namedCredentials.rotate(actor.tenant_id,actor.user_id,req.params.id)});
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
  app.get('/api/metadata/dashboards/:apiName/snapshots',route(async(req,res)=>{
    res.json({snapshots:await dashboardSnapshots.list(req.actor!,req.params.apiName)});
  }));
  app.post('/api/metadata/dashboards/:apiName/snapshots',route(async(req,res)=>{
    res.status(201).json({snapshot:await dashboardSnapshots.create(req.actor!,req.params.apiName,req.body)});
  }));
  app.delete('/api/metadata/dashboards/:apiName/snapshots/:id',route(async(req,res)=>{
    await dashboardSnapshots.remove(req.actor!,req.params.apiName,req.params.id);
    res.status(204).end();
  }));
  app.get('/api/metadata/dashboards/:apiName/subscriptions',route(async(req,res)=>{
    res.json({subscriptions:await dashboardSubscriptions.list(req.actor!,req.params.apiName)});
  }));
  app.post('/api/metadata/dashboards/:apiName/subscriptions',route(async(req,res)=>{
    res.status(201).json({subscription:await dashboardSubscriptions.save(req.actor!,req.params.apiName,req.body)});
  }));
  app.put('/api/metadata/dashboards/:apiName/subscriptions/:id',route(async(req,res)=>{
    res.json({subscription:await dashboardSubscriptions.save(req.actor!,req.params.apiName,req.body,req.params.id)});
  }));
  app.delete('/api/metadata/dashboards/:apiName/subscriptions/:id',route(async(req,res)=>{
    await dashboardSubscriptions.remove(req.actor!,req.params.apiName,req.params.id);
    res.status(204).end();
  }));
  app.post('/api/metadata/dashboards/:apiName/subscriptions/:id/run',route(async(req,res)=>{
    res.json({subscription:await dashboardSubscriptions.run(req.actor!,req.params.apiName,req.params.id)});
  }));
  // Universal SQL-backed definition API. Names are compatibility routes, data is SQL.
  app.post('/api/integration-connections/:id/test',route(async(req,res)=>{
    const actor=req.actor!;
    const connection=await systemDefinitions.testConnection(
      actor.tenant_id,actor.user_id,req.params.id,
      (credentialId,path)=>namedCredentials.callout(actor.tenant_id,actor.user_id,
        {namedCredentialId:credentialId,method:'GET',path},{},'integration-connection-test'));
    res.json({connection});
  }));
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
  app.get('/api/metadata/flow-history',route(async(req,res)=>{
    const actor=req.actor!;
    res.setHeader('Cache-Control','private, no-store');
    res.json(await flowRunHistory(db,rbac,actor.tenant_id,actor.user_id,{
      status:req.query.status,limit:req.query.limit,cursor:req.query.cursor
    }));
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
  app.post('/api/flow-interviews/:id/next',route(async(req,res)=>{
    const actor=req.actor!;
    const result=await flows.advanceInterview(actor.tenant_id,actor.user_id,req.params.id,req.body??{});
    res.setHeader('Cache-Control','private, no-store');
    res.json(result);
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
    await assertMetadataPackageEditable(db,actor.tenant_id,'flow',req.params.apiName);
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
  app.get('/api/metadata/flows/:apiName/versions/:version',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'FlowDefinition','read');
    res.json({version:await flows.loadEditorVersion(actor.tenant_id,
      req.params.apiName,req.params.version)});
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
    await assertMetadataPackageEditable(db,actor.tenant_id,'flow',req.params.apiName);
    res.json({flow:await flows.saveEditor(actor.tenant_id,actor.user_id,req.params.apiName,req.body)});
  }));
  app.delete('/api/metadata/flows/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    await assertMetadataPackageEditable(db,actor.tenant_id,'flow',req.params.apiName);
    await flows.deleteEditor(actor.tenant_id,actor.user_id,req.params.apiName);
    res.status(204).end();
  }));
  // Explicit licence administration is separate from installation and activation.
  app.post('/api/connector-apps/:appKey/licence',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'Licence','manage');
    await rbac.require(actor.tenant_id,actor.user_id,'AppExchange','manage');
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(req.params.appKey))
      throw new Error('Invalid connector app');
    await db.transaction(async client=>{
      const found=await client.query<{id:string}>(
        'SELECT id FROM md_apps WHERE api_name=$1 AND enabled=true AND (tenant_owner_id IS NULL OR tenant_owner_id=$2)',
        [req.params.appKey,actor.tenant_id]);
      if(!found.rows[0])throw new Error('Connector application not found');
      await client.query(`INSERT INTO md_app_entitlements(tenant_id,app_id,active,expires_at)
        VALUES ($1,$2,true,NULL)
        ON CONFLICT(tenant_id,app_id) DO UPDATE SET active=true,expires_at=NULL`,
        [actor.tenant_id,found.rows[0].id]);
      await client.query(
        'INSERT INTO md_security_events(tenant_id,actor_user_id,action) VALUES($1,$2,$3)',
        [actor.tenant_id,actor.user_id,'ConnectorLicenceGranted']);
    });
    res.json({granted:true});
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
    if(resolution.kind==='Record List'){
      await rbac.require(actor.tenant_id,actor.user_id,'Tab:'+resolution.targetApiName,'read');
      await rbac.require(actor.tenant_id,actor.user_id,resolution.targetApiName,'read');
    }
    else if(resolution.kind==='App Page')
      await rbac.require(actor.tenant_id,actor.user_id,'PageDefinition','read');
    res.json({path:resolution.path});
  }));
  app.get('/api/metadata/apps',route(async(req,res)=>{
    const actor=req.actor!;
    res.json({apps:await permittedApps(rbac,actor.tenant_id,actor.user_id,await apps.listMetadata(actor.tenant_id))});
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
  const userRecord=async(row:{id:string;email:string;display_name:string;enabled:boolean},actor:Actor)=>{
    const fields={Name:row.display_name||row.email,Email:row.email,Username:row.email,IsActive:row.enabled};
    const checks=Object.keys(fields).map(field=>({resource:'User.'+field,action:'read'}));
    const allowed=await rbac.allowedMany(actor.tenant_id,actor.user_id,checks);
    return {Id:row.id,...Object.fromEntries(Object.entries(fields).filter((_,i)=>allowed[i]))};
  };
  const requireUserFields=async(actor:Actor,values:Record<string,unknown>,action:string)=>{
    for(const field of Object.keys(values))await rbac.require(actor.tenant_id,actor.user_id,'User.'+field,action);
  };
  const userFields=(input:Record<string,unknown>,creating:boolean)=>{
    const allowed=new Set(['Name','Email','Username','IsActive','Password']);
    for(const key of Object.keys(input))if(!allowed.has(key))throw new Error('Unknown field: '+key);
    const email=input.Email??input.Username;
    if(email!==undefined&&(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)))throw new Error('Invalid user email');
    if(input.Name!==undefined&&typeof input.Name!=='string')throw new Error('Invalid user name');
    if(input.IsActive!==undefined&&typeof input.IsActive!=='boolean')throw new Error('Invalid active flag');
    if(creating&&(!email||typeof input.Password!=='string'))throw new Error('Invalid user credentials');
    if(!creating&&input.Password!==undefined)throw new Error('Invalid password edit');
    return {email:email as string|undefined,name:input.Name as string|undefined,
      enabled:input.IsActive as boolean|undefined,password:input.Password as string|undefined,
      role:undefined};
  };
  const readUser=async(tenantId:string,userId:string,id:string)=>{
    const result=await db.query<{id:string;email:string;display_name:string;enabled:boolean}>(
      'SELECT id,email,display_name,enabled FROM md_users WHERE tenant_id=$1 AND id=$2',[tenantId,id]);
    if(!result.rows[0])throw new Error('Record not found');
    return userRecord(result.rows[0],{tenant_id:tenantId,user_id:userId});
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
    res.json({records:await Promise.all(users.rows.map(row=>userRecord(row,actor))),total:Number(count.rows[0]?.total??0)});
  }));
  app.get('/api/records/User/:id',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'User','read');
    res.json({record:await readUser(actor.tenant_id,actor.user_id,req.params.id)});
  }));
  app.post('/api/records/User',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'User','create');
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))throw new Error('Invalid user');
    await rbac.require(actor.tenant_id,actor.user_id,'Security','manage');
    await requireUserFields(actor,req.body,'create');
    const values=userFields(req.body,true);
    const passwordHash=await auth.hashPassword(values.password!,actor.tenant_id);
    const row=await db.transaction(async client=>{
      const result=await client.query<{id:string}>(
        'INSERT INTO md_users(tenant_id,email,display_name,password_hash,enabled) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [actor.tenant_id,values.email,values.name??'',passwordHash,values.enabled??true]);
      const profile=await client.query<{id:string}>(
        "SELECT id FROM md_profiles WHERE tenant_id=$1 AND api_name='Default'",[actor.tenant_id]);
      if(profile.rows[0])await client.query(
        'INSERT INTO md_user_profiles(tenant_id,user_id,profile_id) VALUES($1,$2,$3)',
        [actor.tenant_id,result.rows[0].id,profile.rows[0].id]);
      return result.rows[0];
    });
    res.status(201).json({record:await readUser(actor.tenant_id,actor.user_id,row.id)});
  }));
  const editUser=route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'User','edit');
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))throw new Error('Invalid user');
    await requireUserFields(actor,req.body,'edit');
    const values=userFields(req.body,false);
    if(req.params.id===actor.user_id&&values.enabled===false)throw new Error('Invalid self deactivation');
    await db.transaction(async client=>{
      const updated=await client.query(
        'UPDATE md_users SET email=COALESCE($3,email),display_name=COALESCE($4,display_name),enabled=COALESCE($5,enabled) WHERE tenant_id=$1 AND id=$2 RETURNING id',
        [actor.tenant_id,req.params.id,values.email??null,values.name??null,values.enabled??null]);
      if(!updated.rowCount)throw new Error('Record not found');
      if(values.enabled===false){
        await client.query('UPDATE md_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[actor.tenant_id,req.params.id]);
        await client.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[actor.tenant_id,req.params.id]);
      }
    });
    res.json({record:await readUser(actor.tenant_id,actor.user_id,req.params.id)});
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

  app.get('/api/records/:objectApi/list-view-groups',route(async(req,res)=>{
    const actor=req.actor!;
    res.json({groups:await recordListViews.groups(actor.tenant_id,actor.user_id,req.params.objectApi)});
  }));
  app.get('/api/records/:objectApi/list-views',route(async(req,res)=>{
    const actor=req.actor!;
    res.setHeader('Cache-Control','private, no-store');
    res.json({views:await recordListViews.list(actor.tenant_id,actor.user_id,req.params.objectApi)});
  }));
  app.post('/api/records/:objectApi/list-views',route(async(req,res)=>{
    const actor=req.actor!;
    res.status(201).json({view:await recordListViews.save(actor.tenant_id,actor.user_id,
      req.params.objectApi,req.body as ViewInput)});
  }));
  app.get('/api/records/:objectApi/list-views/:id',route(async(req,res)=>{
    const actor=req.actor!;
    res.json({view:await recordListViews.load(actor.tenant_id,actor.user_id,
      req.params.objectApi,req.params.id)});
  }));
  app.put('/api/records/:objectApi/list-views/:id',route(async(req,res)=>{
    const actor=req.actor!;
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))
      throw new Error('Invalid list view');
    res.json({view:await recordListViews.save(actor.tenant_id,actor.user_id,req.params.objectApi,
      {...req.body,id:req.params.id} as ViewInput)});
  }));
  app.delete('/api/records/:objectApi/list-views/:id',route(async(req,res)=>{
    const actor=req.actor!;
    await recordListViews.remove(actor.tenant_id,actor.user_id,req.params.objectApi,req.params.id);
    res.status(204).end();
  }));
  app.put('/api/records/:objectApi/list-views/:id/pin',route(async(req,res)=>{
    const actor=req.actor!;
    await recordListViews.pin(actor.tenant_id,actor.user_id,req.params.objectApi,req.params.id,req.body?.pinned);
    res.json({pinned:req.body?.pinned});
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
  // Retention is tenant-configured, defaults to no automatic permanent purge.
  app.get('/api/recycle-bin/retention',route(async(req,res)=>{
    const actor=req.actor!;res.setHeader('Cache-Control','private, no-store');
    res.json(await recordRetention.get(actor.tenant_id,actor.user_id));
  }));
  app.put('/api/recycle-bin/retention',route(async(req,res)=>{
    const actor=req.actor!;
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))
      throw new Error('Invalid retention configuration');
    res.setHeader('Cache-Control','private, no-store');
    res.json(await recordRetention.set(actor.tenant_id,actor.user_id,
      req.body.retentionDays,req.body.automaticPurgeEnabled));
  }));
  app.delete('/api/recycle-bin/records/:objectApi/:id/purge',route(async(req,res)=>{
    const actor=req.actor!;res.setHeader('Cache-Control','private, no-store');
    res.json(await recordRetention.purge(actor.tenant_id,actor.user_id,
      req.params.objectApi,req.params.id));
  }));
  // Shared, tenant-scoped record Recycle Bin. This is separate from field-definition recovery.
  app.get('/api/recycle-bin/records/:objectApi',route(async(req,res)=>{
    const actor=req.actor!;
    const limit=Number(req.query.limit??50),offset=Number(req.query.offset??0);
    res.setHeader('Cache-Control','private, no-store');
    res.json(await records.recycleBin(actor.tenant_id,actor.user_id,req.params.objectApi,limit,offset));
  }));
  app.post('/api/recycle-bin/records/:objectApi/:id/restore',route(async(req,res)=>{
    const actor=req.actor!;
    res.setHeader('Cache-Control','private, no-store');
    res.json(await records.restore(actor.tenant_id,actor.user_id,req.params.objectApi,req.params.id));
  }));

  // Shared import pipeline: tenant actor and OneEngine Object/Field/Record rights are
  // enforced inside the generic Record Engine for each row of one SQL transaction.
  app.post('/api/records/:objectApi/import',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await records.importRecords(actor.tenant_id,actor.user_id,
      req.params.objectApi,req.body?.records));
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
    const queryString=(name:string):string|undefined=>{
      const value=req.query[name];
      if(value===undefined)return undefined;
      if(typeof value!=='string')throw new Error('Invalid record list query');
      return value;
    };
    const sortDirection=queryString('sortDirection')?.toLowerCase();
    const filterField=queryString('filterField');
    const filterValue=queryString('filterValue');
    const filterOperator=queryString('filterOperator')??'Equals';
    const search=queryString('search');
    const filtersValue=queryString('filters');
    const filterLogic=queryString('filterLogic');
    const cursorValue=queryString('cursor');
    if(sortDirection!==undefined&&sortDirection!=='asc'&&sortDirection!=='desc')
      throw new Error('Invalid sort direction');
    if(!['Equals','Includes','Excludes'].includes(filterOperator))
      throw new Error('Invalid record list filter operator');
    if((filterField===undefined)!==(filterValue===undefined)
      ||(search!==undefined&&search.length>256)||(filterValue!==undefined&&filterValue.length>2000)
      ||(filtersValue!==undefined&&filtersValue.length>12000)
      ||(filterLogic!==undefined&&filterLogic.length>256)
      ||(cursorValue!==undefined&&cursorValue.length>2048))
      throw new Error('Invalid record list query');
    const filters=parseRecordFilters(filtersValue);
    if(filterLogic!==undefined&&!filters.length)throw new Error('Filter logic requires filters');
    const cursor=parseRecordCursor(cursorValue);
    const viewId=queryString('viewId');
    const view=viewId?await recordListViews.load(actor.tenant_id,actor.user_id,req.params.objectApi,viewId):undefined;
    const objectApi=req.params.objectApi;
    if(typeof objectApi!=='string')throw new Error('Invalid object name');
    res.json(await records.list(actor.tenant_id,actor.user_id,objectApi,limit,offset,{
      search,filterField,filterValue,filterOperator:filterOperator as 'Equals'|'Includes'|'Excludes',
      relatedField:queryString('relatedField'),relatedId:queryString('relatedId'),
      sortField:queryString('sortField')??view?.sort_field??undefined,
      sortDirection:(sortDirection as 'asc'|'desc'|undefined)??view?.sort_direction,
      filters:filters.length?filters:view?.filters,filterLogic:filterLogic??view?.filter_logic,
      scope:view?.scope,cursor
    }));
  }));
  app.patch('/api/records/:objectApi/external/:fieldApi/:externalValue',route(async(req,res)=>{
    const actor=req.actor!;
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))throw new Error('Invalid record values');
    const result=await externalIdUpsert.execute(actor.tenant_id,actor.user_id,req.params.objectApi,
      req.params.fieldApi,req.params.externalValue,req.body);
    res.status(result.created?201:200).json({id:result.id,created:result.created,record:{Id:result.id}});
  }));
  app.post('/api/records/:objectApi',route(async(req,res)=>{
    const actor=req.actor!;
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)) throw new Error('Invalid record values');
    const id=await records.create(actor.tenant_id,actor.user_id,req.params.objectApi,req.body);
    res.status(201).json({id,record:{Id:id}});
  }));
  app.get('/api/records/:objectApi/:id/actions',route(async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');
    res.json(await quickActions.available(req.actor!,req.params.objectApi,req.params.id));
  }));
  app.get('/api/records/:objectApi/:id/actions/:actionId/flow-launch',route(async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');
    res.json(await quickActions.authorizeFlow(req.actor!,req.params.objectApi,req.params.id,
      req.params.actionId));
  }));
  app.post('/api/records/:objectApi/:id/actions/:actionId/execute',route(async(req,res)=>{
    const actor=req.actor!;
    res.setHeader('Cache-Control','private, no-store');
    res.json(await quickActions.execute(actor,req.params.objectApi,req.params.id,
      req.params.actionId,req.body??{}));
  }));
  app.post('/api/records/:objectApi/:id/clone',route(async(req,res)=>{
    const actor=req.actor!;
    if(req.body!==undefined&&(!req.body||typeof req.body!=='object'||Array.isArray(req.body)
      ||Object.keys(req.body).length))
      throw new Error('Invalid record clone request');
    const id=await records.clone(actor.tenant_id,actor.user_id,req.params.objectApi,req.params.id);
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
  // Generic tenant-owned media library, subject to the existing Files permission.
  app.get('/api/media-assets',route(async(req,res)=>{
    const actor=req.actor!;
    res.setHeader('Cache-Control','private, no-store');
    res.json({assets:await tenantMedia.list(actor.tenant_id,actor.user_id)});
  }));
  app.post('/api/media-assets',route(async(req,res)=>{
    const actor=req.actor!;
    const asset=await tenantMedia.upload(actor.tenant_id,actor.user_id,req.body??{});
    res.status(201).json(asset);
  }));
  app.get('/api/media-assets/:id',route(async(req,res)=>{
    const actor=req.actor!;
    res.setHeader('Cache-Control','private, no-store');
    res.json(await tenantMedia.read(actor.tenant_id,actor.user_id,req.params.id));
  }));
  app.delete('/api/media-assets/:id',route(async(req,res)=>{
    const actor=req.actor!;
    await tenantMedia.remove(actor.tenant_id,actor.user_id,req.params.id);
    res.status(204).end();
  }));
  app.post('/api/files/inline-images',route(async(req,res)=>{
    const actor=req.actor!;
    const file=await recordFiles.upload(actor.tenant_id,actor.user_id,req.body??{});
    res.status(201).json(file);
  }));
  app.get('/api/files/:id/content',route(async(req,res)=>{
    const actor=req.actor!;
    const file=await recordFiles.read(actor.tenant_id,actor.user_id,req.params.id);
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
    res.setHeader('Content-Disposition','inline; filename="inline-image"');
    res.type(file.content_type).send(file.content);
  }));
  app.delete('/api/files/:id',route(async(req,res)=>{
    const actor=req.actor!;
    await recordFiles.remove(actor.tenant_id,actor.user_id,req.params.id);
    res.status(204).end();
  }));
  registerDynamicApiRoutes(app,db,rbac,records,flows);
  registerTenantInspectionRoutes(app,db,rbac,platformTenants);
  registerMetadataPackageRoutes(app,metadataPackages);
  registerOpenApiExternalServiceRoutes(app,externalServices);
  registerDurableJobAdminRoutes(app,db,rbac);
  registerDeclarativeRuleRoutes(app,db,rbac);
  registerMatchingRoutes(app,db,rbac);
  registerVersionedApiRoutes(app,records,definitions,rbac,db);
  registerPlatformEventStreamRoutes(app,db,rbac);
  registerOutboundWebhookRoutes(app,db,rbac);
  app.use('/api',(_req,res)=>{res.status(404).json({error:'API endpoint not implemented in SQL runtime'});});
  registerSecurityWebHost(app,db,process.env.METADRIVE_WEB_DIST);
  app.use((err:Error,_req:Request,res:Response,_next:NextFunction)=>{
    if(err instanceof DuplicateMatchError)res.status(409).json({error:err.message,ruleApi:err.ruleApi,code:'DUPLICATE_RULE_BLOCKED'});
    else if(err instanceof DeclarativeRuleError)res.status(400).json({
      error:err.message,ruleApi:err.ruleApi,
      errors:[{message:err.message,...(err.fieldApi?{fields:[err.fieldApi]}:{})}]
    });
    else if(err instanceof FlowCustomError)res.status(400).json({
      error:err.message,errors:[{message:err.message,...(err.fieldName?{fields:[err.fieldName]}:{})}]
    });
    else if(err.message==='Matching rule configuration changed; retry record save')res.status(409).json({error:err.message});
    else if(err.message.startsWith('Rule revision conflict'))res.status(409).json({error:err.message});
    else if(err.message==='Unsupported REST API version'||err.message==='Query locator is not available to this session')
      res.status(404).json({error:err.message});
    else if(err.message.startsWith('RBAC revision conflict'))res.status(409).json({error:err.message});
    else if(/^(Cannot alter own|Cannot escalate own|Standard profile|Reserved permission|Managed package metadata is read-only)/.test(err.message))res.status(403).json({error:err.message});
    else if(err.message==='Permission denied') res.status(403).json({error:'Permission denied'});
    else if(err.message==='App licence or entitlement unavailable')
      res.status(403).json({error:err.message});
    else if(/^(Install dependency first:|Uninstall dependent app first:|Missing app package resource:|Missing app navigation resource:|App package metadata conflict:|Unresolved app package Page Component reference:|App package Page Component dependency missing|App package Page Component property target unavailable or ambiguous|App downgrade is not allowed)/.test(err.message))
      res.status(409).json({error:err.message});
    else if(err.message==='File storage quota exceeded')res.status(413).json({error:err.message});
    else if(err.message==='Too many inline images for this field')res.status(409).json({error:err.message});
    else if(err.message.startsWith('Converted values conflict')||err.message.startsWith('Field type migrations must')
      ||err.message.startsWith('Field values were added')||err.message.startsWith('Field values changed')
      ||err.message.startsWith('Package cannot be installed')||err.message.startsWith('Package installation changed')
      ||err.message.startsWith('Package object is not owned')||err.message.startsWith('Package page is not owned')
      ||err.message.startsWith('Package component is not owned')
      ||err.message==='Field type migration is not active'
      ||err.message.startsWith('Field definition changed concurrently')
      ||err.message.startsWith('Field definition changed after migration')
      ||err.message.startsWith('Field type is used by'))
      res.status(409).json({error:err.message});
    else if(/^(Field datatype|Field datatype conversion|Existing value|Numeric value|Only ISO|Migration to Rich Text|Required field migration)/.test(err.message))
      res.status(400).json({error:err.message});
    else if(err.message==='Field already exists'||err.message==='Object already exists'||err.message==='Page layout revision conflict'||err.message==='Page revision conflict'||err.message==='Record has changed since it was loaded')res.status(409).json({error:err.message});
    else if(['23503','23505'].includes((err as Error&{code?:string}).code??''))res.status(409).json({error:'Policy dependency or duplicate identity conflict'});
    else if(err.message==='Record not found'||err.message.endsWith('not found')) res.status(404).json({error:err.message});
    else if(err.message.startsWith('Invalid ')||err.message.startsWith('Unsupported ')
      ||/^(Unknown |Duplicate |Cyclic |Stale |External |Queue |Active sharing|Restriction |Portal |Too many)/.test(err.message)) res.status(400).json({error:err.message});
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
    await bootstrapFreshTenant(db);
    const bundledTenants=await seedBundledComponentsForExistingTenants(db);
    console.info('Bundled component registrations checked for tenants:',bundledTenants);
    await reconcileCoreObjectDefaults(db); const status=await reconcileBootstrapPassword(db); if(status!=='disabled')console.info('First-install credential reconciliation:',status);
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
  const definitions=new ObjectDefinitionService(db);
  const retention=new RecordRetentionService(db,new RbacEngine(db));
  await definitions.purgeExpiredFields();
  await retention.purgeExpired();
  const purgeTimer=setInterval(()=>{
    void Promise.all([definitions.purgeExpiredFields(),retention.purgeExpired()]).catch(error=>{
      console.error('Expired metadata/record cleanup failed:',error);
    });
  },60*60*1000);
  purgeTimer.unref();
  const calloutDispatcher=new NamedCredentialService(db,new RbacEngine(db));
  const calloutTimer=setInterval(()=>{
    void Promise.all([calloutDispatcher.dispatchOne(),calloutDispatcher.dispatchOneFlowEmail()])
      .catch(error=>console.error('Durable outbound dispatch failed:',error));
  },1000);
  calloutTimer.unref();
  const server=createSystemServer(db).listen(port,'0.0.0.0');
  server.once('close',()=>{clearInterval(purgeTimer);clearInterval(calloutTimer);});
  return server;
}
