import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const route=(fn:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req as Req,res).catch(next);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function registerFlowAdministrationRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 app.get('/api/metadata/flow-logs',route(async(req,res)=>{
  const a=req.actor!;await rbac.require(a.tenant_id,a.user_id,'FlowDefinition','read');
  const {rows}=await db.query(`SELECT r.id,r.status,r.started_at,r.finished_at,r.error_code,
    f.api_name AS flow_api_name,f.version AS flow_version
    FROM md_flow_runs r JOIN md_flow_definitions f ON f.tenant_id=r.tenant_id AND f.id=r.flow_id
    WHERE r.tenant_id=$1 AND (r.started_by=$2 OR EXISTS(
      SELECT 1 FROM md_permission_rules p JOIN md_permission_assignments pa
      ON pa.tenant_id=p.tenant_id AND pa.permission_set_id=p.permission_set_id
      WHERE pa.tenant_id=$1 AND pa.user_id=$2 AND p.resource='FlowDefinition' AND p.action='manage' AND p.effect='allow'
    )) ORDER BY r.started_at DESC LIMIT 100`,[a.tenant_id,a.user_id]);
  res.json({logs:rows});
 }));
 app.get('/api/metadata/flow-interviews',route(async(req,res)=>{
  const a=req.actor!;await rbac.require(a.tenant_id,a.user_id,'FlowDefinition','read');
  const {rows}=await db.query(`SELECT i.id,i.status,i.node_api,i.updated_at,f.api_name AS flow_api_name
    FROM md_screen_interviews i JOIN md_flow_definitions f
    ON f.tenant_id=i.tenant_id AND f.id=i.flow_id
    WHERE i.tenant_id=$1 AND i.user_id=$2 ORDER BY i.updated_at DESC LIMIT 100`,
    [a.tenant_id,a.user_id]);
  res.json({interviews:rows});
 }));
 app.delete('/api/metadata/flow-interviews/:id',route(async(req,res)=>{
  const a=req.actor!,id=req.params.id;
  if(!uuid.test(id))throw Error('Invalid Flow interview ID');
  const result=await db.query(`UPDATE md_screen_interviews SET status='cancelled',updated_at=now()
    WHERE tenant_id=$1 AND user_id=$2 AND id=$3 AND status='waiting' RETURNING id`,
   [a.tenant_id,a.user_id,id]);
  if(!result.rowCount)throw Error('Active Flow interview not found');
  res.status(204).end();
 }));
 app.get('/api/connector-apps/capabilities',route(async(req,res)=>{
  const a=req.actor!;await rbac.require(a.tenant_id,a.user_id,'AppExchange','read');
  const {rows}=await db.query(`SELECT app.api_name,app.label FROM md_apps app
    JOIN md_app_installations i ON i.app_id=app.id AND i.tenant_id=$1
    JOIN md_app_entitlements e ON e.tenant_id=i.tenant_id AND e.app_id=app.id
    WHERE app.enabled=true AND e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())
    ORDER BY app.label`,[a.tenant_id]);
  res.json({apps:rows.map(x=>({apiName:x.api_name,label:x.label,installed:true}))});
 }));
}
