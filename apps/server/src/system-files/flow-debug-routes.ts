import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(f:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void f(req as Req,res).catch(next);};
const api=/^[A-Za-z][A-Za-z0-9_]*$/;
export function registerFlowDebugRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 app.post('/api/flows/:apiName/:endpoint',wrap(async(req,res)=>{
  const a=req.actor!,name=req.params.apiName,endpoint=req.params.endpoint;
  if(!api.test(name)||!['debug','debug-record'].includes(endpoint))
   throw Error('Unsupported Flow operation');
  await rbac.require(a.tenant_id,a.user_id,'FlowDefinition','manage');
  await rbac.require(a.tenant_id,a.user_id,'Flow:'+name,'execute');
  const result=await db.query<{id:string;flow_type:string;version:number}>(
   'SELECT id,flow_type,version FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2 AND active=true ORDER BY version DESC LIMIT 1',
   [a.tenant_id,name]);
  const flow=result.rows[0];if(!flow)throw Error('Active Flow not found');
  if(endpoint==='debug-record')throw Error('Record-triggered debug requires a published Record-Triggered Flow runtime');
  if(flow.flow_type!=='Autolaunched Flow')throw Error('This Flow type requires its interactive or triggered debug runtime');
  if(req.body?.inputs!==undefined&&(!req.body.inputs||typeof req.body.inputs!=='object'||
    Array.isArray(req.body.inputs)||Object.keys(req.body.inputs).length>100))
   throw Error('Invalid Flow debug inputs');
  const [nodeRows,edgeRows]=await Promise.all([
   db.query<{api_name:string;node_type:string}>(
    'SELECT api_name,node_type FROM md_flow_nodes WHERE tenant_id=$1 AND flow_id=$2 ORDER BY sort_order,id',
    [a.tenant_id,flow.id]),
   db.query<{source_api:string;target_api:string}>(
    'SELECT source_api,target_api FROM md_flow_edges WHERE tenant_id=$1 AND flow_id=$2',
    [a.tenant_id,flow.id])
  ]);
  // Simulation is intentionally side-effect-free. No SQL mutation and no external effects.
  // Complex nodes must be handled by the shared interpreter's dedicated debug implementation.
  if(nodeRows.rows.some(x=>!['Start','End'].includes(x.node_type)))
   throw Error('Dry-run debug of this element is unavailable; no actions executed');
  const starts=nodeRows.rows.filter(n=>n.node_type==='Start');
  if(starts.length!==1||nodeRows.rows.filter(n=>n.node_type==='End').length!==1)
   throw Error('Invalid debug Flow graph');
  const known=new Map(nodeRows.rows.map(n=>[n.api_name,n]));
  const visited=new Set<string>(),debugTrace:Array<{elementApiName:string;type:string;status:string}>=[];
  let current=starts[0].api_name;
  for(let i=0;i<200;i++){
   if(visited.has(current))throw Error('Flow debug graph contains a cycle');
   const node=known.get(current);if(!node)throw Error('Flow debug node missing');
   visited.add(current);debugTrace.push({elementApiName:current,type:node.node_type,status:'Completed'});
   if(node.node_type==='End'){
    if(visited.size!==nodeRows.rows.length)throw Error('Disconnected Flow graph');
    res.json({status:'completed',flowApiName:name,flowVersion:flow.version,
     outputs:{},debugTrace,dryRun:true});return;
   }
   const next=edgeRows.rows.filter(e=>e.source_api===current);
   if(next.length!==1)throw Error('Unsupported debug graph branching');
   current=next[0].target_api;
  }
  throw Error('Flow debug execution limit reached');
 }));
}
