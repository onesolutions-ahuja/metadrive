import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
import type {RecordEngine} from '../system-files/record-engine.js';

type Actor={tenant_id:string;user_id:string};
type AuthenticatedRequest=Request&{actor?:Actor};
const wrap=(fn:(req:AuthenticatedRequest,res:Response)=>Promise<void>)=>
  (req:Request,res:Response,next:NextFunction)=>{void fn(req as AuthenticatedRequest,res).catch(next);};
const api=/^[A-Za-z][A-Za-z0-9_]*$/;
function authenticated(req:AuthenticatedRequest):Actor{
  if(!req.actor?.tenant_id||!req.actor.user_id)throw new Error('Authenticated tenant required');
  return req.actor;
}

/** Only independent SQL metadata and the shared CRUD/permission engines; never app-specific code. */
export function registerDynamicApiRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine,records:RecordEngine){
  app.get('/api/metadata/dashboards/:apiName/data/:objectApi',wrap(async(req,res)=>{
    const actor=authenticated(req),dashboard=req.params.apiName,object=req.params.objectApi;
    if(!api.test(dashboard)||!api.test(object))throw new Error('Invalid dashboard or object');
    await rbac.require(actor.tenant_id,actor.user_id,'SystemDefinition:dashboards','read');
    await rbac.require(actor.tenant_id,actor.user_id,object,'read');
    const {rows}=await db.query<{properties:Record<string,unknown>}>(`
      SELECT properties FROM md_system_definitions
      WHERE tenant_id=$1 AND kind='dashboards' AND api_name=$2 AND enabled=true`,
      [actor.tenant_id,dashboard]);
    const definition=rows[0]?.properties;
    if(!definition)throw new Error('Dashboard not found');
    if(definition.status!=='Deployed')throw new Error('Dashboard is not deployed');
    if(!Array.isArray(definition.components)||
      !definition.components.some(item=>item&&typeof item==='object'&&
        (item as {objectApiName?:unknown}).objectApiName===object))
      throw new Error('Object is not a dashboard data source');
    // The RecordEngine enforces Record, Object and Field rights and is the only CRUD path.
    const result=await records.list(actor.tenant_id,actor.user_id,object,100,0);
    res.setHeader('Cache-Control','private, no-store');
    res.json({records:result.records});
  }));

  app.delete('/api/metadata/pages/:apiName',wrap(async(req,res)=>{
    const actor=authenticated(req),name=req.params.apiName;
    if(!api.test(name))throw new Error('Invalid Page API name');
    await rbac.require(actor.tenant_id,actor.user_id,'PageDefinition','manage');
    await db.transaction(async client=>{
      const {rows}=await client.query<{id:string;enabled:boolean}>(`
        SELECT id,enabled FROM md_page_definitions
        WHERE tenant_id=$1 AND api_name=$2 FOR UPDATE`,[actor.tenant_id,name]);
      const page=rows[0];
      if(!page)throw new Error('Page not found');
      const appOwned=await client.query(`
        SELECT 1 FROM md_app_seed_pages WHERE tenant_id=$1 AND page_id=$2 LIMIT 1`,
        [actor.tenant_id,page.id]);
      if(appOwned.rowCount)throw new Error('App-owned Page must be managed through AppExchange');
      const appHome=await client.query(`
        SELECT 1 FROM md_app_home_pages WHERE tenant_id=$1 AND page_id=$2 LIMIT 1`,
        [actor.tenant_id,page.id]);
      if(appHome.rowCount)throw new Error('App Home Page must be reassigned before removal');
      // Soft-deactivate only; preserve layouts, history, component properties and business records.
      await client.query(`
        UPDATE md_page_definitions SET enabled=false WHERE tenant_id=$1 AND id=$2`,
        [actor.tenant_id,page.id]);
      await client.query(`
        UPDATE md_lightning_page_details SET status='Draft' WHERE tenant_id=$1 AND page_id=$2`,
        [actor.tenant_id,page.id]);
    });
    res.status(204).end();
  }));

  // A read-only visual graph debugger is useful without causing database writes,
  // integration calls or Flow actions. Unsupported elements fail closed.
  const debug=wrap(async(req,res)=>{
    const actor=authenticated(req),name=req.params.apiName;
    if(!api.test(name))throw new Error('Invalid Flow API name');
    await rbac.require(actor.tenant_id,actor.user_id,'FlowDefinition','read');
    await rbac.require(actor.tenant_id,actor.user_id,'Flow:'+name,'execute');
    if(req.path.endsWith('/debug-record')){
      throw new Error('Record-triggered Flow debug requires the event-aware Flow executor');
    }
    const {rows}=await db.query<{id:string;version:number;flow_type:string}>(`
      SELECT id,version,flow_type FROM md_flow_definitions
      WHERE tenant_id=$1 AND api_name=$2 AND active=true ORDER BY version DESC LIMIT 1`,
      [actor.tenant_id,name]);
    const flow=rows[0];
    if(!flow)throw new Error('Active Flow not found');
    if(flow.flow_type!=='Autolaunched Flow')
      throw new Error('This Flow type requires its specialised debug runtime');
    const [nodes,edges]=await Promise.all([
      db.query<{api_name:string;node_type:string}>(`
        SELECT api_name,node_type FROM md_flow_nodes
        WHERE tenant_id=$1 AND flow_id=$2 ORDER BY sort_order,id`,[actor.tenant_id,flow.id]),
      db.query<{source_api:string;target_api:string}>(`
        SELECT source_api,target_api FROM md_flow_edges
        WHERE tenant_id=$1 AND flow_id=$2`,[actor.tenant_id,flow.id])
    ]);
    if(nodes.rows.length<2||nodes.rows.length>200||
      nodes.rows.some(node=>!['Start','End'].includes(node.node_type)))
      throw new Error('Flow contains actions that cannot be safely simulated in a read-only debug');
    const byName=new Map(nodes.rows.map(node=>[node.api_name,node]));
    let current=nodes.rows.find(node=>node.node_type==='Start')?.api_name;
    const visited=new Set<string>();
    const trace:Array<{elementApiName:string;type:string;status:string}>=[];
    for(let i=0;current&&i<200;i++){
      if(visited.has(current))throw new Error('Flow debug cycle');
      const node=byName.get(current);
      if(!node)throw new Error('Invalid Flow graph');
      visited.add(current);
      trace.push({elementApiName:current,type:node.node_type,status:'Completed'});
      if(node.node_type==='End'){
        res.json({status:'completed',flowApiName:name,flowVersion:flow.version,
          outputs:{},debugTrace:trace,dryRun:true});return;
      }
      const next=edges.rows.filter(edge=>edge.source_api===current);
      if(next.length!==1)throw new Error('Unsupported Flow debug branch');
      current=next[0].target_api;
    }
    throw new Error('Flow debug graph is incomplete');
  });
  app.post('/api/flows/:apiName/debug',debug);
  app.post('/api/flows/:apiName/debug-record',debug);
}
