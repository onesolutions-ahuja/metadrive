import type { SqlPersistence } from '../system-files/sql-persistence.js';
import type { RbacEngine } from '../system-files/rbac-engine.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const name=/^[A-Za-z][A-Za-z0-9_]{0,79}$/;
const value=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
type SetRow={id:string;apiName:string;label:string;systemPermissions:string[];
 objectPermissions:Record<string,Record<string,boolean>>;fieldPermissions:Record<string,Record<string,boolean>>};
const objectActions=['read','create','edit','delete','viewAll','modifyAll'];
const fieldActions=['read','edit','create','delete'];
const validResource=(part:string)=>name.test(part)&&!part.includes('*');
function parseRules(set:SetRow) {
 const rules:Array<{resource:string;action:string}>=[];
 const append=(resource:string,action:string)=>{if(resource.includes('*')||action.includes('*'))throw Error('Wildcard grants require separate privileged policy workflow');rules.push({resource,action});};
 for(const item of set.systemPermissions){
   if(typeof item!=='string'||item.length>150||!item.includes(':'))throw Error('Invalid system permission');
   const index=item.lastIndexOf(':'),resource=item.slice(0,index),action=item.slice(index+1);
   if(!/^[A-Za-z][A-Za-z0-9_:.-]*$/.test(resource)||!name.test(action))throw Error('Invalid system permission');
   append(resource,action);
 }
 for(const [obj,actions] of Object.entries(set.objectPermissions)){
   if(!validResource(obj)||!value(actions))throw Error('Invalid object grant');
   for(const [action,enabled] of Object.entries(actions)){
     if(!objectActions.includes(action)||typeof enabled!=='boolean')throw Error('Invalid object grant');
     if(enabled)append('Object:'+obj,action);
   }
 }
 for(const [field,actions] of Object.entries(set.fieldPermissions)){
   const parts=field.split('.');
   if(parts.length!==2||parts.some(part=>!validResource(part))||!value(actions))throw Error('Invalid field grant');
   for(const [action,enabled] of Object.entries(actions)){
     if(!fieldActions.includes(action)||typeof enabled!=='boolean')throw Error('Invalid field grant');
     if(enabled)append('Field:'+field,action);
   }
 }
 if(new Set(rules.map(r=>r.resource+':'+r.action)).size!==rules.length||rules.length>2500)
   throw Error('Duplicate or excessive permission rules');
 return rules;
}

/** Permission sets use the shared OneEngine evaluator; never issue wildcard grants. */
export class PermissionSetAdministration {
 constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine){}
 async save(tenant:string,actor:string,body:unknown){
   await this.rbac.require(tenant,actor,'Security','manage');
   if(!value(body)||Object.keys(body).some(key=>key!=='permissionSets')||
     !Array.isArray(body.permissionSets)||body.permissionSets.length>500)throw Error('Invalid permission set request');
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
       if(selfSets.has(s.entry.id)&&!s.rules.some(rule=>rule.resource==='Security'&&rule.action==='manage'))
         throw Error('Cannot revoke your own administration permission');
       const current=await tx.query<{resource:string;action:string;effect:string}>(
         'SELECT resource,action,effect FROM md_permission_rules WHERE tenant_id=$1 AND permission_set_id=$2',[tenant,s.entry.id]);
       // Preserve explicit deny and wildcard rows. Do not let UI replace security policy beyond supported grants.
       const desired=new Set(s.rules.map(rule=>rule.resource+':'+rule.action));
       for(const rule of current.rows){
         if(rule.effect!=='allow'||rule.resource==='*'||rule.action==='*')continue;
         if(!desired.has(rule.resource+':'+rule.action))
           await tx.query("DELETE FROM md_permission_rules WHERE tenant_id=$1 AND permission_set_id=$2 AND resource=$3 AND action=$4 AND effect='allow'",
             [tenant,s.entry.id,rule.resource,rule.action]);
       }
       for(const rule of s.rules){
         const found=current.rows.find(row=>row.resource===rule.resource&&row.action===rule.action);
         if(found?.effect==='deny')throw Error('Explicit deny must be edited through privileged policy workflow');
         if(!found)await tx.query(
           "INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect) VALUES($1,$2,$3,$4,'allow')",
           [tenant,s.entry.id,rule.resource,rule.action]);
       }
     }
     await tx.query("INSERT INTO md_security_events(tenant_id,actor_user_id,action) VALUES($1,$2,'rbac.permission_sets.update')",[tenant,actor]);
   });
   return this.rbac.describe(tenant,actor);
 }
}
