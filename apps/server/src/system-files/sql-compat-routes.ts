import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
import type {ObjectDefinitionService} from './object-definition.js';
type Actor={tenant_id:string;user_id:string};
type Req=Request&{actor?:Actor};
const name=/^[A-Za-z][A-Za-z0-9_]*$/;
const wrap=(fn:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req as Req,res).catch(next);};
/** Compatibility routes backed by the same SQL metadata and OneEngine engines. */
export function registerSqlCompatibilityRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine,objects:ObjectDefinitionService){
 app.get('/api/metadata/permissions',wrap(async(req,res)=>{
  const a=req.actor!;await rbac.require(a.tenant_id,a.user_id,'PermissionSet','read');
  const [sets,grants,roles,users]=await Promise.all([
   db.query<{id:string;api_name:string}>('SELECT id,api_name FROM md_permission_sets WHERE tenant_id=$1 ORDER BY api_name',[a.tenant_id]),
   db.query<{permission_set_id:string;resource:string;action:string;effect:string}>('SELECT permission_set_id,resource,action,effect FROM md_permission_rules WHERE tenant_id=$1',[a.tenant_id]),
   db.query<{id:string;api_name:string;label:string;parent_role_id:string|null}>('SELECT id,api_name,label,parent_role_id FROM md_roles WHERE tenant_id=$1',[a.tenant_id]),
   db.query<{id:string;email:string}>('SELECT id,email FROM md_users WHERE tenant_id=$1',[a.tenant_id])
  ]);
  const permissionSets=sets.rows.map(s=>{
   const rules=grants.rows.filter(r=>r.permission_set_id===s.id);
   const objectPermissions:Record<string,{read:boolean;create:boolean;edit:boolean;delete:boolean;viewAll:boolean;modifyAll:boolean}>={};
   const fieldPermissions:Record<string,{read:boolean;edit:boolean;create:boolean;delete:boolean}>={};
   for(const r of rules){
    const target=r.resource.includes('.')?fieldPermissions:objectPermissions;
    if(r.resource==='*'||r.resource.includes(':')||!['read','create','edit','delete'].includes(r.action))continue;
    const value=target[r.resource]??(r.resource.includes('.')
     ?{read:false,create:false,edit:false,delete:false}
     :{read:false,create:false,edit:false,delete:false,viewAll:false,modifyAll:false});
    (value as unknown as Record<string,boolean>)[r.action]=r.effect==='allow';
    (target as Record<string,typeof value>)[r.resource]=value;
   }
   return {id:s.id,apiName:s.api_name,label:s.api_name,license:'',description:'',systemPermissions:[],
    objectPermissions,fieldPermissions,recordTypePermissions:{}};
  });
  res.json({tenantId:a.tenant_id,profiles:[],permissionSets,permissionSetGroups:[],
   roles:roles.rows.map(r=>({id:r.id,apiName:r.api_name,name:r.label,parentRoleId:r.parent_role_id})),
   publicGroups:[],queues:[],sharingRules:[],
   users:users.rows.map(u=>({id:u.id,name:u.email,username:u.email,role:'',roleId:'',profileId:'',permissionSetIds:[],permissionSetGroupIds:[],timeZone:'UTC',locale:'en-GB'})),
   sharingSettings:{}});
 }));
 app.get('/api/connector-apps/catalog',wrap(async(req,res)=>{
  const a=req.actor!;await rbac.require(a.tenant_id,a.user_id,'AppExchange','read');
  const result=await db.query<{api_name:string;label:string;installed:boolean;licenced:boolean}>(
   `SELECT a.api_name,a.label,EXISTS(SELECT 1 FROM md_app_installations i
     WHERE i.tenant_id=$1 AND i.app_id=a.id) AS installed,
     EXISTS(SELECT 1 FROM md_app_entitlements e WHERE e.tenant_id=$1
       AND e.app_id=a.id AND e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())) AS licenced
     FROM md_apps a WHERE a.enabled=true ORDER BY a.label`,[a.tenant_id]);
  res.json({records:result.rows.map(a=>({apiName:a.api_name,name:a.label,label:a.label,installed:a.installed,licensed:a.licenced}))});
 }));
 app.put('/api/metadata/objects/:apiName',wrap(async(req,res)=>{
  const a=req.actor!,api=req.params.apiName;
  await rbac.require(a.tenant_id,a.user_id,'ObjectDefinition','edit');
  if(!name.test(api)||req.body?.apiName!==api||typeof req.body.label!=='string'||!req.body.label.trim()||Object.keys(req.body).some(k=>!['apiName','label','id'].includes(k)))throw Error('Unsupported object modification');
  const result=await db.query('UPDATE md_object_definitions SET label=$1 WHERE tenant_id=$2 AND api_name=$3 RETURNING id',[req.body.label.trim(),a.tenant_id,api]);
  if(!result.rowCount)throw Error('Object not found');
  res.json({object:await objects.get(a.tenant_id,api)});
 }));
 app.get('/api/metadata/objects/:apiName/fields',wrap(async(req,res)=>{
  const a=req.actor!;await rbac.require(a.tenant_id,a.user_id,req.params.apiName,'read');
  res.json({fields:(await objects.get(a.tenant_id,req.params.apiName)).fields});
 }));
 app.put('/api/metadata/objects/:apiName/fields/:fieldApi',wrap(async(req,res)=>{
  const a=req.actor!,o=req.params.apiName,f=req.params.fieldApi;
  await rbac.require(a.tenant_id,a.user_id,'FieldDefinition','edit');
  await rbac.require(a.tenant_id,a.user_id,o+'.'+f,'edit');
  if(!name.test(o)||!name.test(f)||!req.body||typeof req.body!=='object'||Array.isArray(req.body))throw Error('Invalid field');
  const permitted=['label'];const changes=Object.keys(req.body);
  if(typeof req.body.label!=='string'||!req.body.label.trim()||changes.some(x=>!['label','apiName','id'].includes(x))||('apiName' in req.body&&req.body.apiName!==f))throw Error('Unsupported field modification');
  const row=await db.query('UPDATE md_field_definitions SET label=$1 WHERE tenant_id=$2 AND object_api=$3 AND api_name=$4 RETURNING id',
   [req.body.label.trim(),a.tenant_id,o,f]);
  if(!row.rowCount)throw Error('Field not found');
  res.json({object:await objects.get(a.tenant_id,o)});
 }));
 app.delete('/api/metadata/objects/:apiName/fields/:fieldApi',wrap(async(req,res)=>{
  const a=req.actor!,o=req.params.apiName,f=req.params.fieldApi;
  await rbac.require(a.tenant_id,a.user_id,'FieldDefinition','delete');
  await rbac.require(a.tenant_id,a.user_id,o+'.'+f,'delete');
  if(!name.test(o)||!name.test(f))throw Error('Invalid field name');
  const records=await db.query('SELECT 1 FROM md_record_values WHERE tenant_id=$1 AND object_api=$2 AND field_api=$3 LIMIT 1',[a.tenant_id,o,f]);
  if(records.rowCount)throw Error('Cannot remove field containing records');
  const result=await db.query('DELETE FROM md_field_definitions WHERE tenant_id=$1 AND object_api=$2 AND api_name=$3 RETURNING id',[a.tenant_id,o,f]);
  if(!result.rowCount)throw Error('Field not found or dependency exists');
  res.json({object:await objects.get(a.tenant_id,o)});
 }));
}
