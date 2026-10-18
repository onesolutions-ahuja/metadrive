import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
import type {FlowRuntime} from './flow-runtime.js';
import {publishSimpleFlow} from './flow-publisher.js';
type Actor={tenant_id:string;user_id:string};
type Req=Request&{actor?:Actor};
const wrap=(fn:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req as Req,res).catch(next);};
const safe=/^[A-Za-z][A-Za-z0-9_]*$/;
/** Shared runtime versioning, execution diagnostics and activation. Never activate invalid graphs. */
export function registerFlowManagementRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine,flows:FlowRuntime){
 app.post('/api/metadata/flows/:apiName/publish',wrap(async(req,res)=>{
  const a=req.actor!,name=req.params.apiName;
  await rbac.require(a.tenant_id,a.user_id,'FlowDefinition','edit');
  if(!safe.test(name))throw Error('Invalid Flow API name');
  const published=await db.transaction(async client=>{
   const body=req.body?.apiName===name?req.body:(
    await client.query<{definition:Record<string,unknown>}>(
     "SELECT definition FROM md_builder_drafts WHERE tenant_id=$1 AND kind='flow' AND api_name=$2 FOR UPDATE",
     [a.tenant_id,name])).rows[0]?.definition;
   const next=await publishSimpleFlow(client,a.tenant_id,name,body);
   await client.query(`INSERT INTO md_builder_drafts(tenant_id,kind,api_name,definition,published)
    VALUES($1,'flow',$2,$3::jsonb,true)
    ON CONFLICT(tenant_id,kind,api_name) DO UPDATE SET
    definition=EXCLUDED.definition,published=true,revision=md_builder_drafts.revision+1,updated_at=now()`,
    [a.tenant_id,name,JSON.stringify(next)]);
   return next;
  });
  res.json({flow:published});
 }));
 app.get('/api/metadata/flows/:apiName/versions',wrap(async(req,res)=>{
  const a=req.actor!,n=req.params.apiName;await rbac.require(a.tenant_id,a.user_id,'FlowDefinition','read');
  if(!safe.test(n))throw Error('Invalid Flow');
  const {rows}=await db.query('SELECT id,api_name,label,version,active,flow_type FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2 ORDER BY version DESC',[a.tenant_id,n]);
  res.json({versions:rows});
 }));
 app.get('/api/flows/:apiName/debug-runs',wrap(async(req,res)=>{
  const a=req.actor!,n=req.params.apiName;await rbac.require(a.tenant_id,a.user_id,'FlowDefinition','read');
  if(!safe.test(n))throw Error('Invalid Flow');
  const {rows}=await db.query(`SELECT r.id,r.status,r.started_at,r.finished_at,r.error_code,f.version
    FROM md_flow_runs r JOIN md_flow_definitions f ON f.tenant_id=r.tenant_id AND f.id=r.flow_id
    WHERE r.tenant_id=$1 AND f.api_name=$2 AND r.started_by=$3 ORDER BY r.started_at DESC LIMIT 50`,
    [a.tenant_id,n,a.user_id]);
  res.json({runs:rows});
 }));
 app.post('/api/metadata/flows/:apiName/activate',wrap(async(req,res)=>{
  const a=req.actor!,n=req.params.apiName,v=req.body?.version;
  await rbac.require(a.tenant_id,a.user_id,'FlowDefinition','edit');
  if(!safe.test(n)||!Number.isSafeInteger(v)||v<1)throw Error('Invalid Flow version');
  await db.transaction(async client=>{
   const {rows}=await client.query<{id:string}>(
    'SELECT id FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2 AND version=$3 FOR UPDATE',
    [a.tenant_id,n,v]);
   if(!rows[0])throw Error('Flow version not found');
   const flowId=rows[0].id;
   const {rows:nodes}=await client.query<{api_name:string;node_type:string}>(
    'SELECT api_name,node_type FROM md_flow_nodes WHERE tenant_id=$1 AND flow_id=$2',[a.tenant_id,flowId]);
   if(nodes.filter(x=>x.node_type==='Start').length!==1||!nodes.some(x=>x.node_type==='End'))
    throw Error('Flow must contain one Start and an End');
   const existing=new Set(nodes.map(x=>x.api_name));
   if(existing.size!==nodes.length)throw Error('Duplicate Flow nodes');
   const {rows:edges}=await client.query<{source_api:string;target_api:string}>(
    'SELECT source_api,target_api FROM md_flow_edges WHERE tenant_id=$1 AND flow_id=$2',[a.tenant_id,flowId]);
   if(edges.some(x=>!existing.has(x.source_api)||!existing.has(x.target_api)))
    throw Error('Flow has invalid connectors');
   const reachable=new Set<string>(nodes.filter(x=>x.node_type==='Start').map(x=>x.api_name));
   for(let i=0;i<nodes.length;i++)for(const e of edges)if(reachable.has(e.source_api))reachable.add(e.target_api);
   if(!nodes.some(x=>x.node_type==='End'&&reachable.has(x.api_name)))throw Error('Flow End is unreachable');
   await client.query('UPDATE md_flow_definitions SET active=false WHERE tenant_id=$1 AND api_name=$2 AND active=true',[a.tenant_id,n]);
   await client.query('UPDATE md_flow_definitions SET active=true WHERE tenant_id=$1 AND id=$2',[a.tenant_id,flowId]);
  });
  res.json({apiName:n,version:v,status:'Active'});
 }));
}
