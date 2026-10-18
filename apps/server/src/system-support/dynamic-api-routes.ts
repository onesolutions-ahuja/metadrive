import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
import type {RecordEngine} from '../system-files/record-engine.js';
import type {FlowRuntime} from '../system-files/flow-runtime.js';

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
export function registerDynamicApiRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine,records:RecordEngine,flows:FlowRuntime){
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

  const debug=wrap(async(req,res)=>{
    const actor=authenticated(req);
    if(!api.test(req.params.apiName))throw new Error('Invalid Flow name');
    const recordTriggered=req.path.endsWith('/debug-record');
    res.setHeader('Cache-Control','private, no-store');
    res.json(await flows.debugGraph(actor.tenant_id,actor.user_id,req.params.apiName,
      req.body?.inputs??req.body??{},recordTriggered));
  });
  app.post('/api/flows/:apiName/debug',debug);
  app.post('/api/flows/:apiName/debug-record',debug);
}
