import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(f:(r:Req,s:Response)=>Promise<void>)=>(r:Request,s:Response,n:NextFunction)=>{void f(r as Req,s).catch(n);};
const api=/^[A-Za-z][A-Za-z0-9_]*$/,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedActions=['read','create','edit','delete'] as const;
type Flags=Record<string,unknown>;
type SetRow={id:string;api_name:string};
const restricted=new Set(['Admin','OneEngineDeveloper','PlatformDeveloper']);
export function registerSqlPermissionWrites(app:Express,db:SqlPersistence,rbac:RbacEngine){
 app.put('/api/metadata/permissions',wrap(async(req,res)=>{
  const a=req.actor!,body=req.body;
  await rbac.require(a.tenant_id,a.user_id,'PermissionSet','manage');
  if(!body||typeof body!=='object'||Array.isArray(body)||!Array.isArray(body.permissionSets)
    ||!Array.isArray(body.users)||!Array.isArray(body.roles)||body.permissionSets.length>300
    ||body.users.length>10000)throw Error('Invalid RBAC metadata');
  if(body.tenantId&&body.tenantId!==a.tenant_id)throw Error('Cross-tenant RBAC write rejected');
  // Do not silently claim to have persisted unsupported policy groups and sharing changes.
  for(const key of ['profiles','permissionSetGroups','publicGroups','queues','sharingRules'])
   if(Array.isArray(body[key])&&body[key].length)throw Error(key+' requires its SQL policy editor');
  if(body.sharingSettings&&Object.keys(body.sharingSettings).length)
   throw Error('Record sharing policies require their SQL editor');
  const {rows:validObjects}=await db.query<{api_name:string}>(
   'SELECT api_name FROM md_object_definitions WHERE tenant_id=$1',[a.tenant_id]);
  const objectNames=new Set(validObjects.map(o=>o.api_name));
  const {rows:validFields}=await db.query<{object_api:string;api_name:string}>(
   'SELECT object_api,api_name FROM md_field_definitions WHERE tenant_id=$1',[a.tenant_id]);
  const fieldNames=new Set(validFields.map(f=>f.object_api+'.'+f.api_name));
  const {rows:existing}=await db.query<SetRow>(
   'SELECT id,api_name FROM md_permission_sets WHERE tenant_id=$1',[a.tenant_id]);
  const byName=new Map(existing.map(s=>[s.api_name,s])),names=new Set<string>();
  type Desired={name:string;id?:string;grants:Array<{resource:string;action:string;effect:'allow'|'deny'}>};
  const changes:Desired[]=[];
  for(const item of body.permissionSets as Record<string,unknown>[]){
   if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.apiName!=='string'
    ||!api.test(item.apiName)||names.has(item.apiName))throw Error('Invalid Permission Set');
   names.add(item.apiName);
   const persisted=byName.get(item.apiName);
   if(item.id&&persisted&&item.id!==persisted.id)throw Error('Permission Set identifier mismatch');
   if(restricted.has(item.apiName)){
    // Core and platform policies remain owner-managed, never overwrite them from bulk UI metadata.
    continue;
   }
   if(Array.isArray(item.systemPermissions)&&item.systemPermissions.length)
    throw Error('System policy grants require explicit scoped editor');
   const grants:Desired['grants']=[];
   for(const [mapKey,known] of [['objectPermissions',objectNames],['fieldPermissions',fieldNames]] as const){
    const map=item[mapKey];
    if(!map||typeof map!=='object'||Array.isArray(map))throw Error('Invalid '+mapKey);
    for(const [resource,flags] of Object.entries(map as Record<string,Flags>)){
     if(!known.has(resource))throw Error('Unrecognised RBAC resource: '+resource);
     if(!flags||typeof flags!=='object'||Array.isArray(flags))throw Error('Invalid RBAC flags');
     if(Object.keys(flags).some(k=>!([...allowedActions,'viewAll','modifyAll'].includes(k))))
      throw Error('Unsupported RBAC permission');
     if(flags.viewAll===true||flags.modifyAll===true)
      throw Error('Record-level superpermissions require the record policy engine');
     for(const action of allowedActions)if(action in flags){
      if(typeof flags[action]!=='boolean')throw Error('Invalid RBAC action');
      // Explicit deny is distinct from missing allow, and persisted server-side.
      grants.push({resource,action,effect:flags[action]?'allow':'deny'});
     }
    }
   }
   if(grants.length>50000)throw Error('Too many permission rules');
   changes.push({name:item.apiName,id:persisted?.id,grants});
  }
  await db.transaction(async client=>{
   for(const change of changes){
    const {rows}=await client.query<{id:string}>(`
      INSERT INTO md_permission_sets(tenant_id,api_name) VALUES($1,$2)
      ON CONFLICT(tenant_id,api_name) DO UPDATE SET api_name=EXCLUDED.api_name RETURNING id`,
      [a.tenant_id,change.name]);
    const id=rows[0].id;
    await client.query(`DELETE FROM md_permission_rules WHERE tenant_id=$1 AND permission_set_id=$2
      AND resource NOT IN ('*','OneEnginePolicy','OneEngine:*','DeveloperApp','DeveloperApp:*','TenantApp','TenantApp:*')
      AND action IN ('read','create','edit','delete')`,[a.tenant_id,id]);
    for(const g of change.grants)
     await client.query(`INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(tenant_id,permission_set_id,resource,action)
       DO UPDATE SET effect=EXCLUDED.effect`,[a.tenant_id,id,g.resource,g.action,g.effect]);
   }
   // All assignments are independently checked against live tenant identities and protected policies.
   for(const u of body.users as Record<string,unknown>[]){
    if(!u||typeof u.id!=='string'||!uuid.test(u.id)||!Array.isArray(u.permissionSetIds))
     throw Error('Invalid User RBAC assignment');
    const exists=await client.query('SELECT id FROM md_users WHERE tenant_id=$1 AND id=$2',[a.tenant_id,u.id]);
    if(!exists.rowCount)throw Error('User not found');
    const desired=new Set<string>();
    for(const id of u.permissionSetIds){
     if(typeof id!=='string'||!uuid.test(id))throw Error('Invalid Permission Set ID');
     const entry=existing.find(s=>s.id===id);
     if(!entry)throw Error('Unknown tenant Permission Set');
     if(restricted.has(entry.api_name))continue;
     desired.add(id);
    }
    await client.query(`DELETE FROM md_permission_assignments a USING md_permission_sets p
     WHERE a.tenant_id=$1 AND a.user_id=$2 AND a.permission_set_id=p.id
     AND p.tenant_id=$1 AND p.api_name NOT IN ('Admin','OneEngineDeveloper','PlatformDeveloper')
     AND NOT(a.permission_set_id=ANY($3::uuid[]))`,[a.tenant_id,u.id,[...desired]]);
    for(const id of desired)
     await client.query(`INSERT INTO md_permission_assignments(tenant_id,user_id,permission_set_id)
       VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[a.tenant_id,u.id,id]);
   }
   await client.query(`INSERT INTO md_tenant_security_events(tenant_id,actor_id,event_type)
     VALUES($1,$2,'permission_set_metadata_updated')`,[a.tenant_id,a.user_id]);
  });
  res.json(body);
 }));
}
