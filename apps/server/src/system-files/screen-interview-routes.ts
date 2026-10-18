import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(fn:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req as Req,res).catch(next);};
const safe=/^[A-Za-z][A-Za-z0-9_]*$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
export function registerScreenInterviewRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 app.post('/api/flows/:apiName/screen/start',wrap(async(req,res)=>{
  const a=req.actor!,name=req.params.apiName;
  if(!safe.test(name))throw Error('Invalid Flow name');
  await rbac.require(a.tenant_id,a.user_id,'Flow:'+name,'execute');
  const flow=await db.query<{id:string}>("SELECT id FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2 AND active=true AND flow_type='Screen Flow' ORDER BY version DESC LIMIT 1",[a.tenant_id,name]);
  if(!flow.rows[0])throw Error('Active Screen Flow not found');
  const node=await db.query<{api_name:string}>(
   "SELECT api_name FROM md_flow_nodes WHERE tenant_id=$1 AND flow_id=$2 AND node_type='Screen' ORDER BY sort_order LIMIT 1",
   [a.tenant_id,flow.rows[0].id]);
  if(!node.rows[0])throw Error('Screen Flow has no Screen element');
  const result=await db.query<{id:string}>(
   "INSERT INTO md_screen_interviews(tenant_id,flow_id,user_id,node_api) VALUES($1,$2,$3,$4) RETURNING id",
   [a.tenant_id,flow.rows[0].id,a.user_id,node.rows[0].api_name]);
  res.status(201).json({interviewId:result.rows[0].id,screen:{apiName:node.rows[0].api_name}});
 }));
 app.post('/api/flow-interviews/:id/next',wrap(async(req,res)=>{
  const a=req.actor!,id=req.params.id;
  if(!uuid.test(id))throw Error('Invalid interview identifier');
  const values=req.body?.values??{};
  if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length>100||JSON.stringify(values).length>16384)throw Error('Invalid Screen inputs');
  for(const [k,v] of Object.entries(values))if(!safe.test(k)||!(v===null||['string','boolean','number'].includes(typeof v))||typeof v==='number'&&!Number.isFinite(v))throw Error('Invalid Screen input');
  const outcome=await db.transaction(async client=>{
   const result=await client.query<{flow_id:string;node_api:string;state:Record<string,unknown>;status:string;api_name:string}>(
    `SELECT i.flow_id,i.node_api,i.state,i.status,f.api_name FROM md_screen_interviews i
     JOIN md_flow_definitions f ON f.tenant_id=i.tenant_id AND f.id=i.flow_id
     WHERE i.tenant_id=$1 AND i.id=$2 AND i.user_id=$3 FOR UPDATE`,[a.tenant_id,id,a.user_id]);
   const current=result.rows[0];
   if(!current||current.status!=='waiting')throw Error('Screen interview unavailable');
   await rbac.require(a.tenant_id,a.user_id,'Flow:'+current.api_name,'execute');
   const edge=await client.query<{target_api:string;node_type:string}>(
    `SELECT e.target_api,n.node_type FROM md_flow_edges e JOIN md_flow_nodes n
     ON n.tenant_id=e.tenant_id AND n.flow_id=e.flow_id AND n.api_name=e.target_api
     WHERE e.tenant_id=$1 AND e.flow_id=$2 AND e.source_api=$3 AND e.outcome='default'`,
    [a.tenant_id,current.flow_id,current.node_api]);
   const next=edge.rows[0];
   if(!next||!['Screen','End'].includes(next.node_type))throw Error('Unsupported Screen Flow transition');
   const state={...current.state,...values};
   await client.query(
    'UPDATE md_screen_interviews SET node_api=$4,state=$5::jsonb,status=$6,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND user_id=$3',
    [a.tenant_id,id,a.user_id,next.target_api,JSON.stringify(state),next.node_type==='End'?'completed':'waiting']);
   return next.node_type==='End'?{completed:true,outputs:state}:{completed:false,interviewId:id,screen:{apiName:next.target_api},values:state};
  });
  res.json(outcome);
 }));
}
