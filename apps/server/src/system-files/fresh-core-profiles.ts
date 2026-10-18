import type {PoolClient} from 'pg';
/** Core profiles are tenant-scoped SQL permission sets.
 * They are separate from organisational roles and never bypass OneEngine.
 */
export const FRESH_CORE_PROFILES = [
 {apiName:'SystemAdministrator',label:'System Administrator',fullAccess:true},
 {apiName:'Developer',label:'Developer',fullAccess:true},
 {apiName:'StandardUser',label:'Standard User',fullAccess:false}
] as const;
export async function seedFreshCoreProfiles(client:PoolClient,tenantId:string) {
 for(const profile of FRESH_CORE_PROFILES) {
  const result=await client.query<{id:string}>(
   'INSERT INTO md_permission_sets(tenant_id,api_name) VALUES($1,$2) ON CONFLICT(tenant_id,api_name) DO UPDATE SET api_name=EXCLUDED.api_name RETURNING id',
   [tenantId,profile.apiName]);
  if(profile.fullAccess) await client.query(
   "INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect) VALUES($1,$2,'*','*','allow') ON CONFLICT DO NOTHING",
   [tenantId,result.rows[0].id]);
 }
}
