import type {SqlPersistence} from '../system-files/sql-persistence.js';
/** Catalog discovery only. Installation, licensing, activation and RBAC remain tenant decisions. */
export async function seedAceChatterAppCatalog(db:Pick<SqlPersistence,'transaction'>):Promise<void>{
 await db.transaction(async client=>{
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['metadrive:app-catalog:AceChatter']);
  await client.query(`INSERT INTO md_apps(api_name,label,enabled,tenant_owner_id)
   VALUES('AceChatter','AceChatter',true,NULL) ON CONFLICT(api_name) DO NOTHING`);
  const {rows}=await client.query<{id:string}>(`
   SELECT id FROM md_apps WHERE api_name='AceChatter' AND enabled=true AND tenant_owner_id IS NULL`);
  if(!rows[0])throw Error('AceChatter catalog registration conflict');
  await client.query(`INSERT INTO md_app_package_versions
   (app_id,version,published,description,brand_color)
   VALUES($1,1,true,'Custom WhatsApp inbox using tenant metadata and OneEngine Flows','#128C7E')
   ON CONFLICT(app_id,version) DO NOTHING`,[rows[0].id]);
 });
}
