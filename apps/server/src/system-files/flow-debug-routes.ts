import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
import type {FlowRuntime} from './flow-runtime.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(fn:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req as Req,res).catch(next);};
const api=/^[A-Za-z][A-Za-z0-9_]*$/;
export function registerFlowDebugRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine,flows:FlowRuntime){
 app.post('/api/flows/:apiName/:endpoint',wrap(async(req,res)=>{
  const a=req.actor!,name=req.params.apiName,endpoint=req.params.endpoint;
  if(!api.test(name)||!['debug','debug-record'].includes(endpoint))
   throw Error('Unsupported Flow operation');
  await rbac.require(a.tenant_id,a.user_id,'FlowDefinition','manage');
  await rbac.require(a.tenant_id,a.user_id,'Flow:'+name,'execute');
  const {rows}=await db.query<{flow_type:string;version:number}>(`
   SELECT flow_type,version FROM md_flow_definitions
   WHERE tenant_id=$1 AND api_name=$2 AND active=true ORDER BY version DESC LIMIT 1`,[a.tenant_id,name]);
  const flow=rows[0];if(!flow)throw Error('Active Flow not found');
  if(endpoint==='debug-record')
   throw Error('Record-triggered debug requires a published Record-Triggered Flow runtime');
  if(flow.flow_type!=='Autolaunched Flow')
   throw Error('Use the Screen interview debugger for interactive Flows');
  const inputs=req.body?.inputs??req.body??{};
  if(!inputs||typeof inputs!=='object'||Array.isArray(inputs)||Object.keys(inputs).length>100)
   throw Error('Invalid Flow debug inputs');
  // Executes the same shared interpreter used in production in one rollback-only transaction.
  // Even SQL CreateRecord actions are rolled back before the debug result is delivered.
  const output=await flows.preview(a.tenant_id,name,a.user_id,inputs);
  res.json({...output,flowApiName:name,flowVersion:flow.version,dryRun:true});
 }));
}
