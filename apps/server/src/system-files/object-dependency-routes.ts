import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(f:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void f(req as Req,res).catch(next);};
const name=/^[A-Za-z][A-Za-z0-9_]*$/;
export function registerObjectDependencyRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 async function allowed(req:Req){
  const a=req.actor!,object=req.params.apiName;
  if(!name.test(object))throw Error('Invalid Object');
  await rbac.require(a.tenant_id,a.user_id,'ObjectDefinition','read');
  await rbac.require(a.tenant_id,a.user_id,object,'read');
  const {rows}=await db.query('SELECT id FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',[a.tenant_id,object]);
  if(!rows[0])throw Error('Object not found');
  return a;
 }
 app.get('/api/metadata/objects/:apiName/dependencies',wrap(async(req,res)=>{
  const a=await allowed(req),object=req.params.apiName;
  const links=await db.query<{object_api:string;api_name:string}>(
   'SELECT object_api,api_name FROM md_field_definitions WHERE tenant_id=$1 AND related_object=$2 ORDER BY object_api,api_name',
   [a.tenant_id,object]);
  const pages=await db.query<{api_name:string}>(
   `SELECT DISTINCT p.api_name FROM md_page_component_properties v
     JOIN md_page_components c ON c.tenant_id=v.tenant_id AND c.id=v.component_id
     JOIN md_page_definitions p ON p.tenant_id=c.tenant_id AND p.id=c.page_id
     JOIN md_object_definitions o ON o.tenant_id=v.tenant_id AND o.id=v.object_id
     WHERE v.tenant_id=$1 AND o.api_name=$2 ORDER BY p.api_name`,[a.tenant_id,object]);
  const dependencies=[...links.rows.map(x=>'Field:'+x.object_api+'.'+x.api_name),
    ...pages.rows.map(x=>'Page:'+x.api_name)];
  res.json({dependencies});
 }));
 app.get('/api/metadata/objects/:apiName/field-dependencies',wrap(async(req,res)=>{
  const a=await allowed(req),object=req.params.apiName;
  const {rows:fields}=await db.query<{id:string;api_name:string;related_object:string|null}>(
   'SELECT id,api_name,related_object FROM md_field_definitions WHERE tenant_id=$1 AND object_api=$2 ORDER BY api_name',
   [a.tenant_id,object]);
  const {rows:references}=await db.query<{field_id:string;page_api:string}>(
   `SELECT DISTINCT v.field_id,p.api_name AS page_api FROM md_page_component_properties v
    JOIN md_page_components c ON c.tenant_id=v.tenant_id AND c.id=v.component_id
    JOIN md_page_definitions p ON p.tenant_id=c.tenant_id AND p.id=c.page_id
    JOIN md_field_definitions f ON f.tenant_id=v.tenant_id AND f.id=v.field_id
    WHERE v.tenant_id=$1 AND f.object_api=$2 AND v.field_id IS NOT NULL ORDER BY v.field_id,p.api_name`,
    [a.tenant_id,object]);
  const byId=new Map<string,string[]>();
  for(const r of references)byId.set(r.field_id,[...(byId.get(r.field_id)??[]),'Page:'+r.page_api]);
  res.json({fields:fields.map(f=>({fieldApiName:f.api_name,dependencies:[
   ...(f.related_object?['Relationship:'+f.related_object]:[]),...(byId.get(f.id)??[])
  ]}))});
 }));
}
