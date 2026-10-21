import type {SqlPersistence} from './sql-persistence.js';
import {RbacEngine, type PermissionCheck} from './rbac-engine.js';

/** Session capabilities are derived exclusively from the shared OneEngine RBAC evaluator. */
const capabilities:readonly (PermissionCheck&{capability:string})[]=[
  {resource:'ObjectDefinition',action:'read',capability:'metadata:read'},
  {resource:'ObjectDefinition',action:'create',capability:'metadata:write'},
  {resource:'Security',action:'read',capability:'security:read'},
  {resource:'Security',action:'manage',capability:'security:manage'},
  {resource:'Tenant',action:'manage',capability:'platform:tenants:manage'},
  {resource:'Flow',action:'execute',capability:'flows:run'},
  {resource:'FlowDefinition',action:'manage',capability:'flows:manage'},
  {resource:'FlowDefinition',action:'system-context',capability:'flows:system-context'},
  {resource:'Licence',action:'manage',capability:'licence:manage'}
];
export async function sessionMetadata(db:SqlPersistence,tenantId:string,userId:string) {
  const rbac=new RbacEngine(db);
  const [profile,fields,types,landing]=await Promise.all([
    db.query<{profile_id:string}>(`SELECT profile_id FROM md_user_profiles
      WHERE tenant_id=$1 AND user_id=$2`,[tenantId,userId]),
    db.query<{object_api:string;api_name:string}>(`SELECT object_api,api_name
      FROM md_field_definitions WHERE tenant_id=$1 ORDER BY object_api,api_name`,[tenantId]),
    db.query<{object_api:string;record_type_id:string;active:boolean}>(`SELECT object_api,record_type_id,active
      FROM md_object_record_types WHERE tenant_id=$1`,[tenantId]),
    db.query<{landing_app_api:string}>('SELECT landing_app_api FROM md_users WHERE tenant_id=$1 AND id=$2',[tenantId,userId])
  ]);
  const checks:PermissionCheck[]=[
    ...capabilities,
    ...fields.rows.flatMap(f=>[
      {resource:f.object_api+'.'+f.api_name,action:'read'},
      {resource:f.object_api+'.'+f.api_name,action:'edit'}
    ]),
    ...[...new Set(types.rows.map(t=>t.object_api))].map(name=>({resource:name,action:'read'})),
    ...types.rows.map(t=>({resource:'RecordType:'+t.object_api+'.'+t.record_type_id,action:'read'}))
  ];
  const rights=await rbac.allowedMany(tenantId,userId,checks);
  const permissions=capabilities.filter((_,i)=>rights[i]).map(c=>c.capability);
  const fieldAccess:Record<string,{read:boolean;edit:boolean}>={};
  let cursor=capabilities.length;
  for(const f of fields.rows){
    fieldAccess[f.object_api+'.'+f.api_name]={read:rights[cursor++],edit:rights[cursor++]};
  }
  const objectRights=new Map<string,boolean>();
  for(const name of [...new Set(types.rows.map(t=>t.object_api))])objectRights.set(name,rights[cursor++]);
  const recordTypeAccess:Record<string,boolean>={};
  for(const type of types.rows)recordTypeAccess[type.object_api+'.'+type.record_type_id]=
    rights[cursor++]&&type.active&&objectRights.get(type.object_api)===true;
  return {user:{
    id:userId,userId,tenantId,profileId:profile.rows[0]?.profile_id??'',
    landingAppApi:landing.rows[0]?.landing_app_api??'Setup',permissions,fieldAccess,recordTypeAccess
  }};
}
