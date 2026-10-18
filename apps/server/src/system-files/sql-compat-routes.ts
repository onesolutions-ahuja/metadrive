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
 app.put('/api/metadata/permissions',wrap(async(req,res)=>{
  const a=req.actor!,body=req.body;
  await rbac.require(a.tenant_id,a.user_id,'PermissionSet','manage');
  if(!body||typeof body!=='object'||Array.isArray(body)||
   !Array.isArray(body.permissionSets)||!Array.isArray(body.users)||!Array.isArray(body.roles)||
   body.permissionSets.length>200||body.users.length>1000||body.roles.length>200)
   throw Error('Invalid OneEngine permissions metadata');
  // Unsupported administrative structures must not be silently accepted or discarded.
  for(const key of ['profiles','permissionSetGroups','publicGroups','queues','sharingRules']){
   if(!Array.isArray(body[key])||body[key].length)
    throw Error('Unsupported permission collection: '+key);
  }
  if(body.sharingSettings&&Object.keys(body.sharingSettings).length)
   throw Error('Sharing Settings require the separate server-side Record Policy engine');
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const safe=/^[A-Za-z][A-Za-z0-9_]*$/;
  const validFlags=['read','create','edit','delete','viewAll','modifyAll'];
  await db.transaction(async client=>{
   const sets=await client.query<{id:string;api_name:string}>(
    'SELECT id,api_name FROM md_permission_sets WHERE tenant_id=$1 FOR UPDATE',[a.tenant_id]);
   const setIds=new Set(sets.rows.map(x=>x.id));
   const objects=await client.query<{api_name:string}>(
    'SELECT api_name FROM md_object_definitions WHERE tenant_id=$1',[a.tenant_id]);
   const objectNames=new Set(objects.rows.map(x=>x.api_name));
   const fields=await client.query<{object_api:string;api_name:string}>(
    'SELECT object_api,api_name FROM md_field_definitions WHERE tenant_id=$1',[a.tenant_id]);
   const fieldNames=new Set(fields.rows.map(x=>x.object_api+'.'+x.api_name));
   const seenSets=new Set<string>();
   for(const set of body.permissionSets){
    if(!set||!uuid.test(set.id)||!setIds.has(set.id)||seenSets.has(set.id)||
      !set.objectPermissions||typeof set.objectPermissions!=='object'||Array.isArray(set.objectPermissions)||
      !set.fieldPermissions||typeof set.fieldPermissions!=='object'||Array.isArray(set.fieldPermissions))
     throw Error('Invalid or foreign permission set');
    seenSets.add(set.id);
    if((set.systemPermissions?.length??0)||(set.recordTypePermissions&&Object.keys(set.recordTypePermissions).length)||
      (set.appPermissions&&Object.keys(set.appPermissions).length)||
      (set.tabPermissions&&Object.keys(set.tabPermissions).length))
      throw Error('Permission collection not supported by OneEngine SQL runtime');
    const grants=[...Object.entries(set.objectPermissions).map(([k,v])=>[k,v,false] as const),
      ...Object.entries(set.fieldPermissions).map(([k,v])=>[k,v,true] as const)];
    if(grants.length>3000)throw Error('Too many permission updates');
    for(const [resource,flags,field] of grants){
     if(!field&&(!safe.test(resource)||!objectNames.has(resource))||
        field&&!fieldNames.has(resource)||!flags||typeof flags!=='object'||Array.isArray(flags))
      throw Error('Invalid permission resource');
     for(const [action,allow] of Object.entries(flags)){
      if(!validFlags.includes(action)||typeof allow!=='boolean')throw Error('Invalid permission action');
      if(field&&['viewAll','modifyAll'].includes(action))throw Error('Invalid Field permission action');
      await client.query(`INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,permission_set_id,resource,action)
       DO UPDATE SET effect=EXCLUDED.effect`,
       [a.tenant_id,set.id,resource,action,allow?'allow':'deny']);
     }
    }
   }
   for(const user of body.users){
    if(!user||!uuid.test(user.id)||!Array.isArray(user.permissionSetIds)||
      user.permissionSetIds.length>100||user.permissionSetIds.some((id:unknown)=>typeof id!=='string'||!setIds.has(id)))
     throw Error('Invalid permission assignment');
    const found=await client.query('SELECT id FROM md_users WHERE tenant_id=$1 AND id=$2',[a.tenant_id,user.id]);
    if(!found.rowCount)throw Error('User outside tenant');
    await client.query('DELETE FROM md_permission_assignments WHERE tenant_id=$1 AND user_id=$2',[a.tenant_id,user.id]);
    for(const id of new Set<string>(user.permissionSetIds))
     await client.query('INSERT INTO md_permission_assignments(tenant_id,user_id,permission_set_id) VALUES($1,$2,$3)',
      [a.tenant_id,user.id,id]);
   }
   await client.query('INSERT INTO md_tenant_security_events(tenant_id,actor_id,event_type) VALUES($1,$2,$3)',
    [a.tenant_id,a.user_id,'oneengine_permission_policy_updated']);
  });
  res.json({...body,tenantId:a.tenant_id});
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
