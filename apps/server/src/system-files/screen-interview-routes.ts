import type {PoolClient} from 'pg';
import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
type Actor={tenant_id:string;user_id:string};
type Req=Request&{actor?:Actor};
type VisualElement={id:number;type:string;label:string;config:Record<string,unknown>};
const wrap=(fn:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req as Req,res).catch(next);};
const safe=/^[A-Za-z][A-Za-z0-9_]*$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const outcomes=[{name:'Default',label:'Next'}];
async function visualScreen(client:PoolClient,tenantId:string,flowId:string,nodeApi:string){
 const id=Number(nodeApi.startsWith('Node_')?nodeApi.slice(5):NaN);
 if(!Number.isSafeInteger(id)||id<0)throw Error('Invalid published Screen node');
 const {rows}=await client.query<{definition:{elements:VisualElement[]}}>(
  'SELECT definition FROM md_flow_publications WHERE tenant_id=$1 AND flow_id=$2',[tenantId,flowId]);
 const el=rows[0]?.definition?.elements?.find(x=>x.id===id&&x.type==='Screen');
 if(!el)throw Error('Published Screen metadata missing');
 return el;
}
export async function beginScreenInterview(db:SqlPersistence,rbac:RbacEngine,a:Actor,apiName:string){
 if(!safe.test(apiName))throw Error('Invalid Flow name');
 await rbac.require(a.tenant_id,a.user_id,'Flow:'+apiName,'execute');
 return db.transaction(async client=>{
  const flow=await client.query<{id:string}>(`
   SELECT id FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2
    AND active=true AND flow_type='Screen Flow' ORDER BY version DESC LIMIT 1`,
   [a.tenant_id,apiName]);
  if(!flow.rows[0])throw Error('Active Screen Flow not found');
  const flowId=flow.rows[0].id;
  const first=await client.query<{target_api:string;node_type:string}>(`
   SELECT e.target_api,n.node_type FROM md_flow_nodes start
    JOIN md_flow_edges e ON e.tenant_id=start.tenant_id AND e.flow_id=start.flow_id
      AND e.source_api=start.api_name AND e.outcome='default'
    JOIN md_flow_nodes n ON n.tenant_id=e.tenant_id AND n.flow_id=e.flow_id
      AND n.api_name=e.target_api
   WHERE start.tenant_id=$1 AND start.flow_id=$2 AND start.node_type='Start'`,
   [a.tenant_id,flowId]);
  if(first.rows.length!==1||first.rows[0].node_type!=='Screen')
   throw Error('Screen Flow must begin with a Screen');
  const screen=await visualScreen(client,a.tenant_id,flowId,first.rows[0].target_api);
  const interview=await client.query<{id:string}>(`
   INSERT INTO md_screen_interviews(tenant_id,flow_id,user_id,node_api)
    VALUES($1,$2,$3,$4) RETURNING id`,
   [a.tenant_id,flowId,a.user_id,first.rows[0].target_api]);
  return {interviewId:interview.rows[0].id,screen,outcomes,values:{},canGoBack:false};
 });
}
export function registerScreenInterviewRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 app.post('/api/flows/:apiName/screen/start',wrap(async(req,res)=>{
  res.status(201).json(await beginScreenInterview(db,rbac,req.actor!,req.params.apiName));
 }));
 app.post('/api/flow-interviews/:id/next',wrap(async(req,res)=>{
  const a=req.actor!,id=req.params.id;
  if(!uuid.test(id))throw Error('Invalid interview identifier');
  const goBack=req.body?.action==='back';
  const values=goBack?{}:(req.body?.values??{});
  if(!values||typeof values!=='object'||Array.isArray(values)
   ||Object.keys(values).length>100||JSON.stringify(values).length>16384)
   throw Error('Invalid Screen inputs');
  for(const [key,value] of Object.entries(values)){
   if(!safe.test(key)||['__proto__','prototype','constructor'].includes(key)||!['string','number','boolean'].includes(typeof value)&&value!==null
    ||typeof value==='string'&&value.length>4096
    ||typeof value==='number'&&!Number.isFinite(value))
    throw Error('Invalid Screen input');
  }
  if(!goBack&&req.body?.outcome!==undefined&&!['Default','default'].includes(req.body.outcome))
   throw Error('Unsupported Screen outcome');
  const result=await db.transaction(async client=>{
   const {rows}=await client.query<{
    flow_id:string;node_api:string;state:Record<string,unknown>;
    status:string;api_name:string;history:string[]
   }>(`SELECT i.flow_id,i.node_api,i.state,i.status,i.history,f.api_name
    FROM md_screen_interviews i JOIN md_flow_definitions f
     ON f.tenant_id=i.tenant_id AND f.id=i.flow_id AND f.active=true
    WHERE i.tenant_id=$1 AND i.id=$2 AND i.user_id=$3
     AND i.expires_at>now() FOR UPDATE OF i`,[a.tenant_id,id,a.user_id]);
   const current=rows[0];
   if(!current||current.status!=='waiting')throw Error('Screen interview unavailable');
   await rbac.require(a.tenant_id,a.user_id,'Flow:'+current.api_name,'execute');
   const history=Array.isArray(current.history)?current.history:[];
   let target:string,type:string,newHistory:string[];
   if(goBack){
    if(!history.length)throw Error('No previous Screen');
    target=history[history.length-1];type='Screen';newHistory=history.slice(0,-1);
   }else{
    const edge=await client.query<{target_api:string;node_type:string}>(`
     SELECT e.target_api,n.node_type FROM md_flow_edges e JOIN md_flow_nodes n
      ON n.tenant_id=e.tenant_id AND n.flow_id=e.flow_id AND n.api_name=e.target_api
     WHERE e.tenant_id=$1 AND e.flow_id=$2 AND e.source_api=$3 AND e.outcome='default'`,
     [a.tenant_id,current.flow_id,current.node_api]);
    if(edge.rows.length!==1||!['Screen','End'].includes(edge.rows[0].node_type))
     throw Error('Unsupported Screen Flow transition');
    target=edge.rows[0].target_api;type=edge.rows[0].node_type;
    newHistory=history.length<100?[...history,current.node_api]:history;
   }
   const state={...current.state,...values};
   await client.query(`UPDATE md_screen_interviews SET node_api=$4,state=$5::jsonb,
    status=$6,history=$7::jsonb,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND user_id=$3`,
    [a.tenant_id,id,a.user_id,target,JSON.stringify(state),
     type==='End'?'completed':'waiting',JSON.stringify(newHistory)]);
   if(type==='End')return {completed:true,outputs:state};
   const screen=await visualScreen(client,a.tenant_id,current.flow_id,target);
   return {completed:false,interviewId:id,screen,outcomes,canGoBack:newHistory.length>0,values:state};
  });
  res.json(result);
 }));
 app.post('/api/flow-interviews/:id/cancel',wrap(async(req,res)=>{
  const a=req.actor!,id=req.params.id;
  if(!uuid.test(id))throw Error('Invalid interview identifier');
  const result=await db.query(`UPDATE md_screen_interviews SET status='cancelled',updated_at=now()
   WHERE tenant_id=$1 AND id=$2 AND user_id=$3 AND status='waiting' RETURNING id`,
   [a.tenant_id,id,a.user_id]);
  if(!result.rowCount)throw Error('Screen interview unavailable');
  res.status(204).end();
 }));
}
