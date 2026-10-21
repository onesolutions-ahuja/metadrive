import type {SqlPersistence} from '../system-files/sql-persistence.js';

/** Publish the custom AceKiosk frontend to AppExchange discovery.
 * Tenant entitlement, installation and RBAC remain separate lifecycle actions.
 * Never create a Page Builder screen for this custom React app.
 */
export async function seedAceKioskAppCatalog(db:Pick<SqlPersistence,'transaction'>):Promise<void>{
  await db.transaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['metadrive:app-catalog:AceKiosk']);
    await client.query(`
      INSERT INTO md_apps(api_name,label,enabled,tenant_owner_id)
      VALUES('AceKiosk','AceKiosk',true,NULL)
      ON CONFLICT(api_name) DO NOTHING`);
    const {rows}=await client.query<{id:string}>(`
      SELECT id FROM md_apps
      WHERE api_name='AceKiosk' AND enabled=true AND tenant_owner_id IS NULL`);
    if(!rows[0])throw Error('AceKiosk catalog registration conflict');
    await client.query(`
      INSERT INTO md_app_package_versions(app_id,version,published,description,brand_color)
      VALUES($1,1,true,'Custom touchscreen ordering frontend using MetaDrive Objects and Flows','#E31B23')
      ON CONFLICT(app_id,version) DO NOTHING`,[rows[0].id]);
  });
}
