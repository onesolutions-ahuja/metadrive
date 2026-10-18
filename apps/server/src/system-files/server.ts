import express, { type NextFunction, type Request, type Response } from 'express';
import { SqlPersistence } from './sql-persistence.js';
import {registerSqlCompatibilityRoutes} from './sql-compat-routes.js';
import {registerRouteAliasSqlRoutes} from './route-alias-sql-routes.js';
import {registerBuilderSqlRoutes} from './builder-sql-routes.js';
import {registerAuthSqlRoutes} from './auth-sql-routes.js';
import {registerAuthSecurityRoutes} from './auth-security-routes.js';
import {registerProtectedMfaRoutes} from './auth-mfa-routes.js';
import {registerTenantSettingsRoutes} from './tenant-settings-routes.js';
import {registerPasswordResetRoutes} from './password-reset-routes.js';
import {registerFlowManagementRoutes} from './flow-management-routes.js';
import {registerPageManagementRoutes} from './page-management-routes.js';
import {registerScreenInterviewRoutes,beginScreenInterview} from './screen-interview-routes.js';
import {applySystemMigrations} from './system-migrations.js';
import { AuthenticationService } from './authentication.js';
import {sessionMetadata} from './session-metadata.js';
import { ObjectDefinitionService } from './object-definition.js';
import { RbacEngine } from './rbac-engine.js';
import {NamedCredentialService} from './named-credential-service.js';
import {SystemDefinitionService,definitionKinds,type DefinitionKind} from './system-definition-service.js';
import { RecordEngine } from './record-engine.js';
import { ComponentRuntime } from './component-runtime.js';
import { PageRuntime } from './page-runtime.js';
import { FlowRuntime } from './flow-runtime.js';
import { AppRuntime } from './app-runtime.js';
import {loadTrustedAppSeed} from '../app-seeders/index.js';
import { TenantProvisioning } from './tenant-provisioning.js';
import {PlatformTenantService} from './platform-tenant-service.js';
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
  const records=new RecordEngine(db,rbac);
  const systemDefinitions=new SystemDefinitionService(db,rbac);
  const namedCredentials=new NamedCredentialService(db,rbac);
  const definitions=new ObjectDefinitionService(db);
  const components=new ComponentRuntime(db);
  const pages=new PageRuntime(db);
  const flows=new FlowRuntime(db,rbac,records);
  const apps=new AppRuntime(db,loadTrustedAppSeed);
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
      res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, If-Match, X-MetaDrive-Request-Source');
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
      if('mfa_required' in session){res.json(session);return;}
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
  app.post('/api/auth/mfa/verify',route(async(req,res)=>{
    const token=req.body?.challenge_token,code=req.body?.code;
    if(typeof token!=='string'||typeof code!=='string'){res.status(400).json({error:'MFA challenge and code required'});return;}
    try{
      const session=await auth.verifyMfaChallenge(token,code);
      res.setHeader('Set-Cookie',`${tokenCookie}=${session.refreshToken}; ${cookieOptions(req)}`);
      res.json({access_token:session.accessToken,expires_in:session.expiresIn});
    }catch(error){
      if(error instanceof Error&&['Invalid MFA code','Invalid MFA challenge'].includes(error.message))
        res.status(401).json({error:'Invalid MFA code'});
      else throw error;
    }
  }));
  registerPasswordResetRoutes(app,db,(req,slug)=>resolveTenant(db,req,slug));
  app.use('/api',authorize);
  app.get('/api/auth/me',route(async(req,res)=>{
    res.json(await sessionMetadata(db,req.actor!.tenant_id,req.actor!.user_id));
  }));
  app.post('/api/auth/logout',route(async(req,res)=>{
    await auth.signOut(req.get('authorization')!.slice(7),getCookie(req));
    res.setHeader('Set-Cookie',`${tokenCookie}=; HttpOnly; Path=/api/auth; Max-Age=0; SameSite=Lax`);
    res.status(204).end();
  }));
  app.get('/api/platform/tenants',route(async(req,res)=>{
    const actor=req.actor!;
    res.json(await platformTenants.list(actor.tenant_id,actor.user_id,req.query));
  }));
  app.get('/api/objects',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ObjectDefinition','read');
    res.json({objects:await definitions.list(actor.tenant_id)});
  }));
  // Metadata lookups use the same tenant-scoped SQL registry as list/create.
  app.get('/api/metadata/objects/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ObjectDefinition','read');
    await rbac.require(actor.tenant_id,actor.user_id,req.params.apiName,'read');
    res.json({object:await definitions.get(actor.tenant_id,req.params.apiName)});
  }));
  app.get('/api/apps/:appId/home-page',route(async(req,res)=>{
    const actor=req.actor!;
    const factor=String(req.query.formFactor??'desktop');
    if(!['desktop','tablet','phone'].includes(factor))throw new Error('Invalid form factor');
    await rbac.require(actor.tenant_id,actor.user_id,'App:'+req.params.appId,'read');
    res.json({page:await apps.homePage(actor.tenant_id,req.params.appId,factor)});
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
  app.post('/api/metadata/objects/:apiName/fields',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'FieldDefinition','create');
    const field=req.body?.field??req.body??{};
    const {apiName,dataType}=field;
    const relatedObject=field.relatedObject??field.relationship?.targetObject;
    if(typeof apiName!=='string'||typeof dataType!=='string'||
      (relatedObject!==undefined&&typeof relatedObject!=='string'))
      throw new Error('Invalid field definition');
    await definitions.addField(actor.tenant_id,req.params.apiName,apiName,dataType,relatedObject,typeof field.label==='string'?field.label:undefined);
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
    const live=await pages.list(actor.tenant_id);
    const drafts=await db.query<{api_name:string;definition:Record<string,unknown>}>(
      "SELECT api_name,definition FROM md_builder_drafts WHERE tenant_id=$1 AND kind='page'",[actor.tenant_id]);
    const map=new Map(live.map(p=>[p.apiName,p as Record<string,unknown>]));
    for(const p of drafts.rows)map.set(p.api_name,p.definition);
    res.json({pages:[...map.values()]});
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
  app.get('/api/metadata/flows',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'FlowDefinition','read');
    const live=await flows.list(actor.tenant_id);
    const drafts=await db.query<{api_name:string;definition:Record<string,unknown>}>(
      "SELECT api_name,definition FROM md_builder_drafts WHERE tenant_id=$1 AND kind='flow'",[actor.tenant_id]);
    const map=new Map(live.map(f=>[f.apiName,f as Record<string,unknown>]));
    for(const f of drafts.rows)map.set(f.api_name,f.definition);
    res.json({flows:[...map.values()]});
  }));
  app.get('/api/metadata/flows/list',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'FlowDefinition','read');
    const live=await flows.list(actor.tenant_id);
    const drafts=await db.query<{api_name:string;definition:Record<string,unknown>}>(
      "SELECT api_name,definition FROM md_builder_drafts WHERE tenant_id=$1 AND kind='flow'",[actor.tenant_id]);
    const map=new Map(live.map(f=>[f.apiName,f as Record<string,unknown>]));
    for(const f of drafts.rows)map.set(f.api_name,f.definition);
    res.json({flows:[...map.values()]});
  }));
  app.get('/api/metadata/components/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'ComponentDefinition','read');
    res.json({component:await components.resolve(actor.tenant_id,req.params.apiName)});
  }));
  app.get('/api/metadata/pages/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'PageDefinition','read');
    const draft=await db.query<{definition:Record<string,unknown>}>(
      "SELECT definition FROM md_builder_drafts WHERE tenant_id=$1 AND kind='page' AND api_name=$2",
      [actor.tenant_id,req.params.apiName]);
    if(draft.rows[0])res.json({page:draft.rows[0].definition});
    else res.json(await pages.load(actor.tenant_id,req.params.apiName));
  }));
  app.post('/api/flows/:apiName/execute',route(async(req,res)=>{
    const actor=req.actor!;
    const inputs=req.body?.inputs??req.body??{};
    if(!inputs||typeof inputs!=='object'||Array.isArray(inputs))throw new Error('Invalid Flow inputs');
    const active=await db.query<{flow_type:string}>(`
      SELECT flow_type FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2
      AND active=true ORDER BY version DESC LIMIT 1`,[actor.tenant_id,req.params.apiName]);
    if(active.rows[0]?.flow_type==='Screen Flow'){
      res.json(await beginScreenInterview(db,rbac,actor,req.params.apiName));
    }else res.json(await flows.execute(actor.tenant_id,req.params.apiName,actor.user_id,inputs));
  }));
  app.get('/api/metadata/flows/:apiName',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'FlowDefinition','read');
    const draft=await db.query<{definition:Record<string,unknown>}>(
      "SELECT definition FROM md_builder_drafts WHERE tenant_id=$1 AND kind='flow' AND api_name=$2",
      [actor.tenant_id,req.params.apiName]);
    if(draft.rows[0])res.json({flow:draft.rows[0].definition});
    else res.json({flow:await flows.loadActive(actor.tenant_id,req.params.apiName)});
  }));
  app.post('/api/apps/:apiName/install',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'AppExchange','manage');
    if(req.body?.pageSeed)await rbac.require(actor.tenant_id,actor.user_id,'PageDefinition','create');
    await apps.install(actor.tenant_id,req.params.apiName);
    res.status(204).end();
  }));
  app.post('/api/apps/:apiName/update',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'AppExchange','manage');
    await apps.update(actor.tenant_id,req.params.apiName);
    res.status(204).end();
  }));
  app.post('/api/apps/:apiName/uninstall',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'AppExchange','manage');
    await apps.uninstall(actor.tenant_id,req.params.apiName);
    res.status(204).end();
  }));
  app.get('/api/metadata/apps',route(async(req,res)=>{
    const actor=req.actor!;
    await rbac.require(actor.tenant_id,actor.user_id,'AppExchange','read');
    res.json({apps:await apps.listInstalled(actor.tenant_id)});
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
    res.status(201).json({id});
  }));
  app.patch('/api/records/:objectApi/:id',route(async(req,res)=>{
    const actor=req.actor!;
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)) throw new Error('Invalid record values');
    await records.update(actor.tenant_id,actor.user_id,req.params.objectApi,req.params.id,req.body);
    res.status(204).end();
  }));
  app.delete('/api/records/:objectApi/:id',route(async(req,res)=>{
    const actor=req.actor!;
    await records.remove(actor.tenant_id,actor.user_id,req.params.objectApi,req.params.id);
    res.status(204).end();
  }));
  registerSqlCompatibilityRoutes(app,db,rbac,definitions);
  registerRouteAliasSqlRoutes(app,db,rbac);
  registerBuilderSqlRoutes(app,db,rbac);
  registerAuthSqlRoutes(app,db,rbac);
  registerAuthSecurityRoutes(app,db,rbac);
  registerProtectedMfaRoutes(app,db,rbac);
  registerTenantSettingsRoutes(app,db,rbac);
  registerFlowManagementRoutes(app,db,rbac,flows);
  registerPageManagementRoutes(app,db,rbac);
  registerScreenInterviewRoutes(app,db,rbac);
  app.use('/api',(_req,res)=>{res.status(404).json({error:'API endpoint not implemented in SQL runtime'});});
  app.use((err:Error,_req:Request,res:Response,_next:NextFunction)=>{
    if(err.message==='Permission denied') res.status(403).json({error:'Permission denied'});
    else if(err.message==='Field already exists'||err.message==='Object already exists')res.status(409).json({error:err.message});
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
  try { await applySystemMigrations(db); await db.verifySchema(); await bootstrapFreshTenant(db); const status=await reconcileBootstrapPassword(db); if(status!=='disabled')console.info('First-install credential reconciliation:',status);
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
      if('mfa_required' in session)throw new Error('Bootstrap verification requires MFA');
      await auth.signOut(session.accessToken,session.refreshToken);
      console.info('New developer login verification: passed');
    } }
  catch(error) { await db.close(); throw error; }
  const port=Number(process.env.PORT??10000);
  if(!Number.isInteger(port)||port<1||port>65535) throw new Error('Invalid PORT');
  return createSystemServer(db).listen(port,'0.0.0.0');
}
