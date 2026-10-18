import type { SqlPersistence } from '../system-files/sql-persistence.js';
import type { RbacEngine } from '../system-files/rbac-engine.js';
import {toPermissionRule,systemPermissionBindings} from './permission-resource-map.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const name=/^[A-Za-z][A-Za-z0-9_]{0,79}$/;
const value=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
type SetRow={id:string;apiName:string;label:string;systemPermissions:string[];
 objectPermissions:Record<string,Record<string,boolean>>;fieldPermissions:Record<string,Record<string,boolean>>};
const objectActions=['read','create','edit','delete','viewAll','modifyAll'];
const fieldActions=['read','edit','create','delete'];
const validResource=(part:string)=>name.test(part)&&!part.includes('*');
type GrantRule={resource:string;action:string;effect:'allow'|'deny'};
function parseRules(set:SetRow):GrantRule[] {
 const rules:GrantRule[]=[];
 const wildcard=set.systemPermissions.includes('*:*');
 const append=(resource:string,action:string,effect:'allow'|'deny'='allow')=>{
   if(resource.includes('*')||action.includes('*'))throw Error('Use the dedicated wildcard policy entry');
   rules.push({resource,action,effect});
 };
 if(wildcard)rules.push({resource:'*',action:'*',effect:'allow'});
 for(const item of set.systemPermissions){
   if(item==='*:*')continue;
   if(typeof item!=='string'||item.length>150)throw Error('Invalid system permission');
   const rule=toPermissionRule(item);
   if(!wildcard||!Object.hasOwn(systemPermissionBindings,item))append(rule.resource,rule.action);
 }
 if(wildcard){
   // A missing checkbox disables the corresponding grant even though the
   // wildcard still allows other resources. The central evaluator honours deny first.
   for(const key of Object.keys(systemPermissionBindings)){
     if(set.systemPermissions.includes(key))continue;
     const rule=toPermissionRule(key);
     append(rule.resource,rule.action,'deny');
   }
 }
 for(const [obj,actions] of Object.entries(set.objectPermissions)){
   if(!validResource(obj)||!value(actions))throw Error('Invalid object grant');
   for(const [action,enabled] of Object.entries(actions)){
     if(!objectActions.includes(action)||typeof enabled!=='boolean')throw Error('Invalid object grant');
     if(wildcard){if(!enabled)append(obj,action,'deny');}
     else if(enabled)append(obj,action);
   }
 }
 for(const [field,actions] of Object.entries(set.fieldPermissions)){
   const parts=field.split('.');
   if(parts.length!==2||parts.some(part=>!validResource(part))||!value(actions))throw Error('Invalid field grant');
   for(const [action,enabled] of Object.entries(actions)){
     if(!fieldActions.includes(action)||typeof enabled!=='boolean')throw Error('Invalid field grant');
     if(wildcard){if(!enabled)append(field,action,'deny');}
     else if(enabled)append(field,action);
   }
 }
 if(new Set(rules.map(r=>r.resource+':'+r.action)).size!==rules.length||rules.length>3000)
   throw Error('Duplicate or excessive permission rules');
 return rules;
}

/** Tenant permission sets use the central RBAC evaluator, including configurable OneEngine wildcard grants. */
export class PermissionSetAdministration {
 constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine){}
 async save(tenant:string,actor:string,body:unknown){
   await this.rbac.require(tenant,actor,'Security','manage');
   if(!value(body)||Object.keys(body).some(key=>!['permissionSets','users'].includes(key))||
     !Array.isArray(body.permissionSets)||body.permissionSets.length>500)throw Error('Invalid permission set request');
   const requestedUsers=body.users;
   if(requestedUsers!==undefined&&(!Array.isArray(requestedUsers)||requestedUsers.length>2000))throw Error('Invalid assignment request');
   const users=(requestedUsers as unknown[]|undefined)?.map((raw)=>{
     if(!value(raw)||Object.keys(raw).some(key=>!['id','permissionSetIds'].includes(key))||
       typeof raw.id!=='string'||!uuid.test(raw.id)||!Array.isArray(raw.permissionSetIds)||
       raw.permissionSetIds.some(id=>typeof id!=='string'||!uuid.test(id))||
       new Set(raw.permissionSetIds).size!==raw.permissionSetIds.length)throw Error('Invalid user assignment');
     return raw as {id:string;permissionSetIds:string[]};
   });
   if(users&&new Set(users.map(user=>user.id)).size!==users.length)throw Error('Duplicate user');
   const sets=body.permissionSets.map((raw:unknown)=>{
     if(!value(raw)||Object.keys(raw).some(k=>!['id','apiName','label','systemPermissions','objectPermissions','fieldPermissions'].includes(k))||
       typeof raw.id!=='string'||!uuid.test(raw.id)||typeof raw.apiName!=='string'||!name.test(raw.apiName)||
       typeof raw.label!=='string'||!raw.label.trim()||raw.label.length>120||
       !Array.isArray(raw.systemPermissions)||!value(raw.objectPermissions)||!value(raw.fieldPermissions))throw Error('Invalid permission set');
     const entry=raw as SetRow;return {entry,rules:parseRules(entry)};
   });
   if(new Set(sets.map(s=>s.entry.id)).size!==sets.length||
     new Set(sets.map(s=>s.entry.apiName.toLowerCase())).size!==sets.length)throw Error('Duplicate permission set');
   await this.db.transaction(async tx=>{
     await tx.query('SELECT id FROM md_tenants WHERE id=$1 FOR UPDATE',[tenant]);
     const existing=await tx.query<{id:string;api_name:string}>('SELECT id,api_name FROM md_permission_sets WHERE tenant_id=$1',[tenant]);
     if(existing.rows.some(x=>!sets.some(y=>y.entry.id===x.id)))throw Error('Permission set deletion requires separate review');
     const oldById=new Map(existing.rows.map(x=>[x.id,x.api_name]));
     // A replacement must not revoke an administrator's own Security manage access.
     const actorGrants=await tx.query<{permission_set_id:string}>(
       'SELECT permission_set_id FROM md_permission_assignments WHERE tenant_id=$1 AND user_id=$2',[tenant,actor]);
     const selfSets=new Set(actorGrants.rows.map(x=>x.permission_set_id));
     for(const s of sets){
       if(oldById.has(s.entry.id)){
         if(oldById.get(s.entry.id)!==s.entry.apiName)throw Error('Permission set API name is immutable');
       }else{
         await tx.query('INSERT INTO md_permission_sets(tenant_id,id,api_name) VALUES($1,$2,$3)',
           [tenant,s.entry.id,s.entry.apiName]);
       }
       const current=await tx.query<{resource:string;action:string;effect:string}>(
         'SELECT resource,action,effect FROM md_permission_rules WHERE tenant_id=$1 AND permission_set_id=$2',[tenant,s.entry.id]);
       const protectedGrants=current.rows.filter(row=>row.effect==='allow'&&(row.resource==='*'||row.action==='*'));
       if(protectedGrants.some(rule=>rule.resource!=='*'||rule.action!=='*'))
         throw Error('Scoped wildcard grants require a dedicated policy editor');
       const hasWildcard=s.rules.some(rule=>rule.resource==='*'&&rule.action==='*'&&rule.effect==='allow');
       const deniesManage=s.rules.some(rule=>rule.resource==='Security'&&rule.action==='manage'&&rule.effect==='deny');
       const retainsManage=s.rules.some(rule=>rule.effect==='allow'&&(
         (rule.resource==='Security'&&rule.action==='manage')||
         (rule.resource==='*'&&rule.action==='*')));
       if(selfSets.has(s.entry.id)&&(!retainsManage||deniesManage))
         throw Error('Cannot revoke your own administration permission');
       // Replace only rules controlled by this form. A custom deny policy on a
       // non-wildcard set is preserved for its separate privileged editor.
       const desired=new Map(s.rules.map(rule=>[rule.resource+':'+rule.action,rule]));
       for(const rule of current.rows){
         const key=rule.resource+':'+rule.action;
         if(rule.effect==='deny'&&!hasWildcard)continue;
         if(!desired.has(key))
           await tx.query('DELETE FROM md_permission_rules WHERE tenant_id=$1 AND permission_set_id=$2 AND resource=$3 AND action=$4',
             [tenant,s.entry.id,rule.resource,rule.action]);
       }
       for(const rule of s.rules){
         const existingRule=current.rows.find(row=>row.resource===rule.resource&&row.action===rule.action);
         if(existingRule?.effect==='deny'&&!hasWildcard)
           throw Error('Explicit deny must be edited through privileged policy workflow');
         if(!existingRule)await tx.query(
           'INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect) VALUES($1,$2,$3,$4,$5)',
           [tenant,s.entry.id,rule.resource,rule.action,rule.effect]);
         else if(existingRule.effect!==rule.effect)await tx.query(
           'UPDATE md_permission_rules SET effect=$5 WHERE tenant_id=$1 AND permission_set_id=$2 AND resource=$3 AND action=$4',
           [tenant,s.entry.id,rule.resource,rule.action,rule.effect]);
       }
     }
     if(users){
       await this.rbac.require(tenant,actor,'User','edit');
       const currentUsers=await tx.query<{id:string}>('SELECT id FROM md_users WHERE tenant_id=$1',[tenant]);
       if(currentUsers.rows.length!==users.length||users.some(user=>!currentUsers.rows.some(row=>row.id===user.id)))
         throw Error('Stale user assignment list');
       const knownSets=new Set(sets.map(set=>set.entry.id));
       const previous=await tx.query<{user_id:string;permission_set_id:string}>(
         'SELECT user_id,permission_set_id FROM md_permission_assignments WHERE tenant_id=$1',[tenant]);
       for(const user of users){
         if(user.permissionSetIds.some(id=>!knownSets.has(id)))throw Error('Unknown permission set');
         const prior=previous.rows.filter(row=>row.user_id===user.id).map(row=>row.permission_set_id).sort();
         if(user.id===actor&&JSON.stringify(prior)!==JSON.stringify([...user.permissionSetIds].sort()))
           throw Error('Cannot alter own permission set assignment');
         for(const id of prior.filter(id=>!user.permissionSetIds.includes(id)))
           await tx.query('DELETE FROM md_permission_assignments WHERE tenant_id=$1 AND user_id=$2 AND permission_set_id=$3',
             [tenant,user.id,id]);
         for(const id of user.permissionSetIds.filter(id=>!prior.includes(id)))
           await tx.query('INSERT INTO md_permission_assignments(tenant_id,user_id,permission_set_id) VALUES($1,$2,$3)',
             [tenant,user.id,id]);
       }
     }
     await tx.query("INSERT INTO md_security_events(tenant_id,actor_user_id,action) VALUES($1,$2,'rbac.permission_sets.update')",[tenant,actor]);
   });
   return this.rbac.describe(tenant,actor);
 }
}
