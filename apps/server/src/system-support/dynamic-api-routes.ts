import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
import type {RecordEngine} from '../system-files/record-engine.js';
import type {FlowRuntime} from '../system-files/flow-runtime.js';
import {DurableJobService} from './durable-job-service.js';

type Actor={tenant_id:string;user_id:string};
type AuthenticatedRequest=Request<Record<string,string>>&{actor?:Actor};
const wrap=(fn:(req:AuthenticatedRequest,res:Response)=>Promise<void>)=>
  (req:Request,res:Response,next:NextFunction)=>{
    // These routes use named parameters only; Express wildcard parameters are not registered here.
    void fn(req as AuthenticatedRequest,res).catch(next);
  };
const api=/^[A-Za-z][A-Za-z0-9_]*$/;
function authenticated(req:AuthenticatedRequest):Actor{
  if(!req.actor?.tenant_id||!req.actor.user_id)throw new Error('Authenticated tenant required');
  return req.actor;
}

/** Only independent SQL metadata and the shared CRUD/permission engines; never app-specific code. */
export function registerDynamicApiRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine,records:RecordEngine,flows:FlowRuntime){
  const jobs=new DurableJobService(db);
  app.get('/api/jobs/:id',wrap(async(req,res)=>{
    const actor=authenticated(req);
    await rbac.require(actor.tenant_id,actor.user_id,'FlowDefinition','manage');
    if(!/^[0-9a-f-]{36}$/i.test(req.params.id))throw new Error('Invalid job ID');
    res.setHeader('Cache-Control','private, no-store');
    res.json({job:await jobs.inspect(actor.tenant_id,req.params.id)});
  }));
  app.post('/api/jobs/:id/cancel-failed',wrap(async(req,res)=>{
    const actor=authenticated(req);
    await rbac.require(actor.tenant_id,actor.user_id,'FlowDefinition','manage');
    if(!/^[0-9a-f-]{36}$/i.test(req.params.id))throw new Error('Invalid job ID');
    await jobs.cancelFailed(actor.tenant_id,req.params.id);
    res.json({cancelled:true});
  }));

  app.post('/api/jobs/:id/reconcile',wrap(async(req,res)=>{
    const actor=authenticated(req);
    await rbac.require(actor.tenant_id,actor.user_id,'FlowDefinition','manage');
    if(!/^[0-9a-f-]{36}$/i.test(req.params.id))throw new Error('Invalid job ID');
    const decision=req.body?.decision;
    if(decision!=='acknowledge'&&decision!=='retry')throw new Error('Invalid job reconciliation');
    // Explicit confirmation is mandatory because retry may duplicate irreversible effects.
    if(req.body?.reviewedExternalEffects!==true)throw new Error('Invalid reconciliation confirmation');
    await jobs.reconcileFailed(actor.tenant_id,req.params.id,actor.user_id,decision);
    res.setHeader('Cache-Control','private, no-store');
    res.json({resolved:true,decision});
  }));

  app.post('/api/flows/:apiName/schedule',wrap(async(req,res)=>{
    const actor=authenticated(req),flowName=req.params.apiName;
    if(!api.test(flowName))throw new Error('Invalid Flow name');
    await rbac.require(actor.tenant_id,actor.user_id,'Flow:'+flowName,'execute');
    const active=await flows.loadActive(actor.tenant_id,flowName);
    if(!active)throw new Error('Active flow not found');
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Invalid schedule');
    const at=body.runAt;
    if(typeof at!=='string'||!/Z$|[+-][0-9]{2}:[0-9]{2}$/.test(at))throw new Error('Invalid schedule time');
    const date=new Date(at);
    if(!Number.isFinite(date.getTime())||date.getTime()<Date.now()-1000)
      throw new Error('Invalid schedule time');
    const app=body.appApiName;
    if(app!==undefined){
      if(typeof app!=='string'||!api.test(app))throw new Error('Invalid app');
      const {rows}=await db.query(`
        SELECT 1 FROM md_apps a
        JOIN md_app_installations i ON i.tenant_id=$1 AND i.app_id=a.id
        JOIN md_app_entitlements e ON e.tenant_id=$1 AND e.app_id=a.id
        WHERE a.api_name=$2 AND a.enabled=true AND e.active=true
        AND (a.tenant_owner_id IS NULL OR a.tenant_owner_id=$1)`,
       [actor.tenant_id,app]);
      if(!rows.length)throw new Error('App not installed or entitled');
    }
    if(body.idempotencyKey!==undefined&&(typeof body.idempotencyKey!=='string'
      ||body.idempotencyKey.length>128))throw new Error('Invalid idempotency key');
    if(body.recurrenceSeconds!==undefined&&(!Number.isInteger(body.recurrenceSeconds)||
      body.recurrenceSeconds<60||body.recurrenceSeconds>31536000))
      throw new Error('Invalid recurring interval');
    const id=await jobs.enqueue(actor.tenant_id,'flow.execute',{
      actorUserId:actor.user_id,resourceId:flowName,resourceVersion:active.version,appApiName:app,
      scheduledAt:date,idempotencyKey:body.idempotencyKey,
      recurrenceSeconds:body.recurrenceSeconds
    });
    res.status(201).json({id,status:'queued'});
  }));

  app.get('/api/records/:objectApi/typed-aggregate/:fieldApi',wrap(async(req,res)=>{
    const actor=authenticated(req);
    const result=await records.aggregateNumeric(actor.tenant_id,actor.user_id,
      req.params.objectApi,req.params.fieldApi);
    res.setHeader('Cache-Control','private, no-store');
    res.json(result);
  }));
  app.get('/api/records/:objectApi/typed-filter/:fieldApi',wrap(async(req,res)=>{
    const actor=authenticated(req);
    const op=req.query.op;
    const value=req.query.value;
    if(typeof op!=='string'||!['eq','lt','lte','gt','gte'].includes(op)||
      typeof value!=='string'||value.length>128)
      throw new Error('Invalid typed filter');
    const size=req.query.limit===undefined?50:Number(req.query.limit);
    const ids=await records.filterTyped(actor.tenant_id,actor.user_id,req.params.objectApi,
      req.params.fieldApi,op as 'eq'|'lt'|'lte'|'gt'|'gte',value,size,
      req.query.direction==='desc'?'desc':'asc');
    res.setHeader('Cache-Control','private, no-store');
    res.json({ids});
  }));

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
