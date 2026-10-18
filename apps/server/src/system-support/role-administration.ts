import type { SqlPersistence } from '../system-files/sql-persistence.js';
import { RbacEngine } from '../system-files/rbac-engine.js';

type Role = { id:string; apiName:string; name:string; parentRoleId:string|null };
type UserRole = { id:string; roleId:string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const obj = (v:unknown):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);

/** Role metadata and memberships use SQL, with OneEngine authorisation and no implicit grants. */
export class RoleAdministration {
  constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine) {}
  async save(tenant:string,actor:string,body:unknown) {
    await this.rbac.require(tenant,actor,'Security','manage');
    if(!obj(body)||Object.keys(body).some(k=>!['roles','users'].includes(k))||
       !Array.isArray(body.roles)||!Array.isArray(body.users)||body.roles.length>500||body.users.length>2000)
      throw Error('Invalid role administration request');
    const roles:Role[]=body.roles.map((r:unknown)=>{
      if(!obj(r)||Object.keys(r).some(k=>!['id','apiName','name','parentRoleId'].includes(k))||
         typeof r.id!=='string'||!uuid.test(r.id)||typeof r.apiName!=='string'||
         !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(r.apiName)||typeof r.name!=='string'||
         !r.name.trim()||r.name.length>120||(r.parentRoleId!==null&&
         (typeof r.parentRoleId!=='string'||!uuid.test(r.parentRoleId))))throw Error('Invalid role');
      return r as Role;
    });
    const users:UserRole[]=body.users.map((u:unknown)=>{
      if(!obj(u)||Object.keys(u).some(k=>!['id','roleId'].includes(k))||
        typeof u.id!=='string'||!uuid.test(u.id)||typeof u.roleId!=='string'||
        (u.roleId&&!uuid.test(u.roleId)))throw Error('Invalid user role');
      return u as UserRole;
    });
    const ids=new Map(roles.map(r=>[r.id,r]));
    if(ids.size!==roles.length||new Set(roles.map(r=>r.apiName.toLowerCase())).size!==roles.length||
       new Set(users.map(u=>u.id)).size!==users.length)throw Error('Duplicate role or user');
    for(const r of roles){
      const seen=new Set([r.id]);let parent=r.parentRoleId;
      while(parent){if(seen.has(parent)||!ids.has(parent))throw Error('Invalid role hierarchy');
        seen.add(parent);parent=ids.get(parent)!.parentRoleId;}
    }
    await this.db.transaction(async tx=>{
      await tx.query('SELECT id FROM md_tenants WHERE id=$1 FOR UPDATE',[tenant]);
      const existing=await tx.query<{id:string}>('SELECT id FROM md_roles WHERE tenant_id=$1',[tenant]);
      const previous=new Set(existing.rows.map(r=>r.id));
      if(existing.rows.some(r=>!ids.has(r.id)))throw Error('Role deletion requires separate review');
      const current=await tx.query<{id:string;role_id:string|null}>(
        'SELECT u.id,ur.role_id FROM md_users u LEFT JOIN md_user_roles ur ON ur.tenant_id=u.tenant_id AND ur.user_id=u.id WHERE u.tenant_id=$1',[tenant]);
      const assigned=new Map<string,string[]>();
      for(const u of current.rows)assigned.set(u.id,[...(assigned.get(u.id)??[]),...(u.role_id?[u.role_id]:[])]);
      if(users.length!==assigned.size||users.some(u=>!assigned.has(u.id)))throw Error('Stale user list');
      const changes=users.filter(u=>assigned.get(u.id)!.join(',')!==u.roleId);
      if(changes.length)await this.rbac.require(tenant,actor,'User','edit');
      if(changes.some(u=>u.id===actor))throw Error('Cannot edit own role');
      for(const r of roles.filter(r=>!previous.has(r.id)))
        await tx.query('INSERT INTO md_roles(tenant_id,id,api_name,label) VALUES($1,$2,$3,$4)',
          [tenant,r.id,r.apiName,r.name.trim()]);
      for(const r of roles)await tx.query(
        'UPDATE md_roles SET api_name=$3,label=$4,parent_role_id=$5 WHERE tenant_id=$1 AND id=$2',
        [tenant,r.id,r.apiName,r.name.trim(),r.parentRoleId]);
      for(const u of changes){
        if(u.roleId&&!ids.has(u.roleId))throw Error('Unknown role');
        await tx.query('DELETE FROM md_user_roles WHERE tenant_id=$1 AND user_id=$2',[tenant,u.id]);
        if(u.roleId)await tx.query('INSERT INTO md_user_roles(tenant_id,user_id,role_id) VALUES($1,$2,$3)',
          [tenant,u.id,u.roleId]);
      }
      if(roles.length||changes.length)await tx.query(
        "INSERT INTO md_security_events(tenant_id,actor_user_id,action) VALUES($1,$2,'rbac.roles.update')",
        [tenant,actor]);
    });
    return this.rbac.describe(tenant,actor);
  }
}
