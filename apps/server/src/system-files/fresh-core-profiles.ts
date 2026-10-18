import type {PoolClient} from 'pg';
import {FRESH_CORE_OBJECTS} from './fresh-core-objects.js';

/** Profiles are labels mapped to OneEngine permission sets; roles remain separate. */
export const FRESH_CORE_PROFILES = [
 {apiName:'SystemAdministrator',label:'System Administrator',permissionSet:'Admin'},
 {apiName:'Developer',label:'Developer',permissionSet:'OneEngineDeveloper'},
 {apiName:'StandardUser',label:'Standard User',permissionSet:'PermissionSet1'}
] as const;
export const ADMIN_PROTECTED_RESOURCES = [
 'OneEnginePolicy','OneEngine:*','DeveloperApp','DeveloperApp:*',
 'TenantApp','TenantApp:*'
] as const;
type Rule={resource:string;action:string;effect:'allow'|'deny'};
const crud=['read','create','edit','delete'] as const;
/** Called inside the provisioning transaction, with no sample users or records. */
export async function seedFreshCoreProfiles(client:PoolClient,tenantId:string) {
 for(const profile of FRESH_CORE_PROFILES) {
  const result=await client.query<{id:string}>(
   'INSERT INTO md_permission_sets(tenant_id,api_name) VALUES($1,$2) ON CONFLICT(tenant_id,api_name) DO UPDATE SET api_name=EXCLUDED.api_name RETURNING id',
   [tenantId,profile.permissionSet]);
  const permissionSetId=result.rows[0]?.id;
  if(!permissionSetId)throw new Error('Missing seeded permission set');
  const rules:Rule[]=[];
  if(profile.apiName==='SystemAdministrator') {
   rules.push({resource:'*',action:'*',effect:'allow'});
   for(const resource of ADMIN_PROTECTED_RESOURCES)rules.push({resource,action:'*',effect:'deny'});
  } else {
   const actions=profile.apiName==='Developer'?crud:['read','create'] as const;
   for(const object of FRESH_CORE_OBJECTS)for(const action of actions)
    rules.push({resource:object.apiName,action,effect:'allow'});
  }
  for(const rule of rules)await client.query(
   'INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
   [tenantId,permissionSetId,rule.resource,rule.action,rule.effect]);
 }
}
