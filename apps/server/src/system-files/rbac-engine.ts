import type { SqlPersistence } from './sql-persistence.js';
import {toDisplayedPermission} from './permission-resource-map.js';

export type PermissionCheck = {resource:string;action:string};

/** Single OneEngine SQL permission evaluator: tenant, user, explicit deny and wildcard. */
export class RbacEngine {
  constructor(private readonly db:SqlPersistence) {}
  async allowedMany(tenantId:string,userId:string,checks:readonly PermissionCheck[]):Promise<boolean[]> {
    if(!checks.length)return [];
    const {rows}=await this.db.query<{ordinal:number;allow_granted:boolean;deny_granted:boolean}>(`
      WITH assigned AS (
        SELECT a.permission_set_id FROM md_permission_assignments a
          WHERE a.tenant_id=$1 AND a.user_id=$2
        UNION
        SELECT rp.permission_set_id FROM md_user_roles ur
          JOIN md_role_permission_sets rp ON rp.tenant_id=ur.tenant_id AND rp.role_id=ur.role_id
          WHERE ur.tenant_id=$1 AND ur.user_id=$2
        UNION
        SELECT pp.permission_set_id FROM md_user_profiles up
          JOIN md_profile_permission_sets pp ON pp.tenant_id=up.tenant_id AND pp.profile_id=up.profile_id
          WHERE up.tenant_id=$1 AND up.user_id=$2
      ), requested AS (
        SELECT resource,action,ordinal
          FROM unnest($3::text[], $4::text[]) WITH ORDINALITY AS q(resource,action,ordinal)
      )
      SELECT q.ordinal::integer AS ordinal,
        COALESCE(bool_or(r.effect='allow'),false) AS allow_granted,
        COALESCE(bool_or(r.effect='deny'),false) AS deny_granted
      FROM requested q
      LEFT JOIN md_permission_rules r ON r.tenant_id=$1
        AND r.permission_set_id IN (SELECT permission_set_id FROM assigned)
        AND r.resource IN (q.resource,'*') AND r.action IN (q.action,'*')
      GROUP BY q.ordinal ORDER BY q.ordinal
    `,[tenantId,userId,checks.map(c=>c.resource),checks.map(c=>c.action)]);
    const byIndex=new Map(rows.map(row=>[Number(row.ordinal)-1,row]));
    return checks.map((_,i)=>{
      const row=byIndex.get(i);
      return row?.allow_granted===true && row?.deny_granted!==true;
    });
  }
  async allowed(tenantId:string,userId:string,resource:string,action:string):Promise<boolean> {
    return (await this.allowedMany(tenantId,userId,[{resource,action}]))[0];
  }
  /** Read actual tenant RBAC definitions; never manufacture profiles or grants. */
  async describe(tenantId:string,userId:string) {
    await this.require(tenantId,userId,'Security','read');
    const [sets,roles,assignments,users,profiles,assignedProfiles,assignedRoles,userSets,objects,fields]=await Promise.all([
      this.db.query<{id:string;api_name:string}>(
        'SELECT id,api_name FROM md_permission_sets WHERE tenant_id=$1 ORDER BY api_name',[tenantId]),
      this.db.query<{id:string;api_name:string;label:string;parent_role_id:string|null}>(
        'SELECT id,api_name,label,parent_role_id FROM md_roles WHERE tenant_id=$1 ORDER BY label',[tenantId]),
      this.db.query<{permission_set_id:string;resource:string;action:string;effect:string}>(
        'SELECT permission_set_id,resource,action,effect FROM md_permission_rules WHERE tenant_id=$1 ORDER BY resource,action',[tenantId]),
      this.db.query<{id:string;email:string}>(
        'SELECT id,email FROM md_users WHERE tenant_id=$1 ORDER BY email',[tenantId]),
      this.db.query<{id:string;api_name:string;label:string}>(
        'SELECT id,api_name,label FROM md_profiles WHERE tenant_id=$1 ORDER BY label',[tenantId]),
      this.db.query<{user_id:string;profile_id:string}>(
        'SELECT user_id,profile_id FROM md_user_profiles WHERE tenant_id=$1',[tenantId]),
      this.db.query<{user_id:string;role_id:string}>(
        'SELECT user_id,role_id FROM md_user_roles WHERE tenant_id=$1',[tenantId]),
      this.db.query<{user_id:string;permission_set_id:string}>(
        'SELECT user_id,permission_set_id FROM md_permission_assignments WHERE tenant_id=$1',[tenantId]),
      this.db.query<{api_name:string}>(
        'SELECT api_name FROM md_object_definitions WHERE tenant_id=$1',[tenantId]),
      this.db.query<{object_api:string;api_name:string}>(
        'SELECT object_api,api_name FROM md_field_definitions WHERE tenant_id=$1',[tenantId])
    ]);
    const objectNames=new Set(objects.rows.map(o=>o.api_name));
    const fieldNames=new Set(fields.rows.map(f=>f.object_api+'.'+f.api_name));
    const bySet=new Map<string,{systemPermissions:string[];objectPermissions:Record<string,Record<string,boolean>>;fieldPermissions:Record<string,Record<string,boolean>>}>();
    for(const rule of assignments.rows){
      if(rule.effect!=='allow')continue;
      const entries=bySet.get(rule.permission_set_id)??{systemPermissions:[],objectPermissions:{},fieldPermissions:{}};
      if(rule.resource.startsWith('Object:')||objectNames.has(rule.resource)){
        const key=rule.resource.startsWith('Object:')?rule.resource.slice(7):rule.resource;
        (entries.objectPermissions[key]??={})[rule.action]=true;
      }else if(rule.resource.startsWith('Field:')||fieldNames.has(rule.resource)){
        const key=rule.resource.startsWith('Field:')?rule.resource.slice(6):rule.resource;
        (entries.fieldPermissions[key]??={})[rule.action]=true;
      }else entries.systemPermissions.push(toDisplayedPermission(rule.resource,rule.action));
      bySet.set(rule.permission_set_id,entries);
    }
    const emptyRecordAccess={};
    return {
      tenantId,
      profiles:profiles.rows.map(p=>({id:p.id,apiName:p.api_name,label:p.label,license:'MetaDrive',description:'',isStandard:false,
        systemPermissions:[],objectPermissions:{},recordTypePermissions:{},fieldPermissions:{}})),
      permissionSets:sets.rows.map(p=>({
        id:p.id,apiName:p.api_name,label:p.api_name,license:'',description:'',
        systemPermissions:bySet.get(p.id)?.systemPermissions??[],
        objectPermissions:bySet.get(p.id)?.objectPermissions??emptyRecordAccess,recordTypePermissions:{},
        fieldPermissions:bySet.get(p.id)?.fieldPermissions??{}
      })),
      permissionSetGroups:[],
      roles:roles.rows.map(p=>({
        id:p.id,apiName:p.api_name,name:p.label,parentRoleId:p.parent_role_id
      })),
      publicGroups:[],queues:[],sharingRules:[],
      users:users.rows.map(u=>({
        id:u.id,name:u.email,username:u.email,role:'',roleId:assignedRoles.rows.find(r=>r.user_id===u.id)?.role_id??'',
        profileId:assignedProfiles.rows.find(p=>p.user_id===u.id)?.profile_id??'',permissionSetIds:userSets.rows.filter(p=>p.user_id===u.id).map(p=>p.permission_set_id),permissionSetGroupIds:[],
        timeZone:'UTC',locale:'en-GB'
      })),
      sharingSettings:{}
    };
  }
  async require(tenantId:string,userId:string,resource:string,action:string) {
    if(!(await this.allowed(tenantId,userId,resource,action))) throw new Error('Permission denied');
  }
}
