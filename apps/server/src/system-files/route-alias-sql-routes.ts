import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
type Actor={tenant_id:string;user_id:string};
type Req=Request&{actor?:Actor};
const wrap=(f:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void f(req as Req,res).catch(next);};
const appName=/^[A-Za-z][A-Za-z0-9_]*$/;
const slug=/^[a-z0-9][a-z0-9-]{0,79}$/;
export function registerRouteAliasSqlRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine) {
 app.get('/api/metadata/route-aliases',wrap(async(req,res)=>{
  const a=req.actor!;await rbac.require(a.tenant_id,a.user_id,'PageDefinition','read');
  const {rows}=await db.query<{app_api:string;slug:string;kind:string;target_api:string;status:string;version:number}>(
   'SELECT app_api,slug,kind,target_api,status,version FROM md_route_aliases WHERE tenant_id=$1 ORDER BY app_api,slug',[a.tenant_id]);
  res.json({aliases:rows.map(x=>({appId:x.app_api,slug:x.slug,kind:x.kind,targetApiName:x.target_api,status:x.status,version:x.version}))});
 }));
 app.put('/api/metadata/route-aliases/:appId/:slug',wrap(async(req,res)=>{
  const a=req.actor!,appApi=req.params.appId,routeSlug=req.params.slug,body=req.body;
  await rbac.require(a.tenant_id,a.user_id,'PageDefinition','edit');
  if(!appName.test(appApi)||!slug.test(routeSlug)||!body||body.appId!==appApi||body.slug!==routeSlug||
    !['App Home','App Page','Record List'].includes(body.kind)||!appName.test(body.targetApiName??'')||
    !Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0||body.status!=='Active')throw Error('Invalid route alias');
  const alias=await db.transaction(async client=>{
   const appResult=await client.query<{id:string}>(
    'SELECT a.id FROM md_apps a JOIN md_app_installations i ON i.tenant_id=$1 AND i.app_id=a.id JOIN md_app_entitlements e ON e.tenant_id=$1 AND e.app_id=a.id WHERE a.api_name=$2 AND a.enabled=true AND e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())',
    [a.tenant_id,appApi]);
   if(!appResult.rows.length)throw Error('App not installed or licensed');
   const target=body.kind==='Record List'?
    await client.query('SELECT id FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',[a.tenant_id,body.targetApiName]):
    await client.query('SELECT id FROM md_page_definitions WHERE tenant_id=$1 AND api_name=$2 AND enabled=true',[a.tenant_id,body.targetApiName]);
   if(!target.rowCount)throw Error('Route target not available');
   const existing=await client.query<{version:number}>( 'SELECT version FROM md_route_aliases WHERE tenant_id=$1 AND app_api=$2 AND slug=$3 FOR UPDATE',[a.tenant_id,appApi,routeSlug]);
   if((existing.rows[0]?.version??0)!==body.expectedVersion)throw Error('Route alias version conflict');
   if(existing.rowCount)await client.query(
    'UPDATE md_route_aliases SET kind=$4,target_api=$5,status=\'Active\',version=version+1,updated_at=now() WHERE tenant_id=$1 AND app_api=$2 AND slug=$3',
    [a.tenant_id,appApi,routeSlug,body.kind,body.targetApiName]);
   else await client.query(
    'INSERT INTO md_route_aliases(tenant_id,app_api,slug,kind,target_api) VALUES($1,$2,$3,$4,$5)',
    [a.tenant_id,appApi,routeSlug,body.kind,body.targetApiName]);
   return {appId:appApi,slug:routeSlug,kind:body.kind,targetApiName:body.targetApiName,status:'Active',version:body.expectedVersion+1};
  });
  res.json({alias});
 }));
 app.delete('/api/metadata/route-aliases/:appId/:slug',wrap(async(req,res)=>{
  const a=req.actor!,appApi=req.params.appId,routeSlug=req.params.slug,v=req.body?.expectedVersion;
  await rbac.require(a.tenant_id,a.user_id,'PageDefinition','edit');
  if(!appName.test(appApi)||!slug.test(routeSlug)||!Number.isSafeInteger(v)||v<1)throw Error('Invalid route alias');
  const result=await db.query(
   "UPDATE md_route_aliases SET status='Disabled',version=version+1,updated_at=now() WHERE tenant_id=$1 AND app_api=$2 AND slug=$3 AND version=$4 RETURNING version",
   [a.tenant_id,appApi,routeSlug,v]);
  if(!result.rowCount)throw Error('Route alias version conflict');
  res.status(204).end();
 }));
}
