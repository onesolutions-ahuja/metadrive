import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(fn:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req as Req,res).catch(next);};
const safe=/^[A-Za-z][A-Za-z0-9_]*$/;
/** Published pages must reference registered, enabled components. */
export function registerPageManagementRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 app.put('/api/metadata/pages/:apiName/components/:componentId/properties',wrap(async(req,res)=>{
  const a=req.actor!,page=req.params.apiName,id=req.params.componentId;
  await rbac.require(a.tenant_id,a.user_id,'PageDefinition','edit');
  if(!safe.test(page)||!(/^[0-9a-f-]{36}$/i).test(id))throw Error('Invalid Page component');
  const properties=req.body?.properties;
  if(!properties||typeof properties!=='object'||Array.isArray(properties))throw Error('Invalid properties');
  const {flattenAppProperties}=await import('./app-page-seeder.js');
  const values=flattenAppProperties(properties);
  await db.transaction(async client=>{
   const component=await client.query(
    'SELECT c.id FROM md_page_components c JOIN md_page_definitions p ON p.tenant_id=c.tenant_id AND p.id=c.page_id WHERE c.tenant_id=$1 AND p.api_name=$2 AND c.id=$3 FOR UPDATE',
    [a.tenant_id,page,id]);
   if(!component.rowCount)throw Error('Page component not found');
   await client.query('DELETE FROM md_page_component_properties WHERE tenant_id=$1 AND component_id=$2',[a.tenant_id,id]);
   for(const v of values)await client.query(
    'INSERT INTO md_page_component_properties(tenant_id,component_id,property_path,value_text,data_type,object_id,field_id,flow_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [a.tenant_id,id,v.path,v.text,v.type,v.objectId,v.fieldId,v.flowId]);
  });
  res.json({updated:true});
 }));
 app.post('/api/metadata/pages/:apiName/activate',wrap(async(req,res)=>{
  const a=req.actor!,name=req.params.apiName;
  await rbac.require(a.tenant_id,a.user_id,'PageDefinition','edit');
  if(!safe.test(name))throw Error('Invalid Page API name');
  await db.transaction(async client=>{
   const {rows}=await client.query<{id:string}>(
    'SELECT id FROM md_page_definitions WHERE tenant_id=$1 AND api_name=$2 FOR UPDATE',
    [a.tenant_id,name]);
   if(!rows[0])throw Error('Page not found');
   const unresolved=await client.query(`
    SELECT c.id FROM md_page_components c LEFT JOIN md_component_definitions d
    ON d.tenant_id=c.tenant_id AND d.api_name=c.component_api AND d.enabled=true
    WHERE c.tenant_id=$1 AND c.page_id=$2 AND d.id IS NULL LIMIT 1`,[a.tenant_id,rows[0].id]);
   if(unresolved.rowCount)throw Error('Page references missing or disabled components');
   const count=await client.query('SELECT id FROM md_page_components WHERE tenant_id=$1 AND page_id=$2 LIMIT 1',[a.tenant_id,rows[0].id]);
   if(!count.rowCount)throw Error('Cannot activate an empty Page');
   await client.query('UPDATE md_page_definitions SET enabled=true WHERE tenant_id=$1 AND id=$2',[a.tenant_id,rows[0].id]);
  });
  res.json({apiName:name,status:'Active'});
 }));
 app.post('/api/metadata/pages/:apiName/deactivate',wrap(async(req,res)=>{
  const a=req.actor!,name=req.params.apiName;await rbac.require(a.tenant_id,a.user_id,'PageDefinition','edit');
  const result=await db.query('UPDATE md_page_definitions SET enabled=false WHERE tenant_id=$1 AND api_name=$2 RETURNING id',[a.tenant_id,name]);
  if(!result.rowCount)throw Error('Page not found');
  res.json({apiName:name,status:'Draft'});
 }));
}
