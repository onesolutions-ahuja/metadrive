import type {SqlPersistence} from '../system-files/sql-persistence.js';

/** OneChatter is a separate, Page Builder-owned application. Discovery never
 * installs it or initialises AceChatter. Installation remains an AppExchange action. */
export const ONECHATTER_APP=Object.freeze({
  apiName:'OneChatter',
  label:'OneChatter',
  version:1,
  description:'Editable OneComponents chat inbox using shared SQL Objects and OneEngine Flows',
  brandColor:'#128C7E',
  homePageApi:'OneChatterInbox'
});

export async function seedOneChatterAppCatalog(db:Pick<SqlPersistence,'transaction'>):Promise<void>{
  await db.transaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['metadrive:app-catalog:OneChatter']);
    await client.query(`INSERT INTO md_apps(api_name,label,enabled,tenant_owner_id)
      VALUES($1,$2,true,NULL)
      ON CONFLICT(api_name) DO UPDATE SET label=EXCLUDED.label,enabled=true
      WHERE md_apps.tenant_owner_id IS NULL`,
      [ONECHATTER_APP.apiName,ONECHATTER_APP.label]);
    const {rows}=await client.query<{id:string}>(`SELECT id FROM md_apps
      WHERE api_name=$1 AND enabled=true AND tenant_owner_id IS NULL`,[ONECHATTER_APP.apiName]);
    if(!rows[0])throw Error('OneChatter catalog registration conflict');
    await client.query(`INSERT INTO md_app_package_versions
      (app_id,version,published,description,brand_color)
      VALUES($1,$2,true,$3,$4)
      ON CONFLICT(app_id,version) DO UPDATE SET published=true
      WHERE md_app_package_versions.published=false`,
      [rows[0].id,ONECHATTER_APP.version,ONECHATTER_APP.description,ONECHATTER_APP.brandColor]);
    const {rows:published}=await client.query<{version:number}>(`SELECT version FROM md_app_package_versions
      WHERE app_id=$1 AND version=$2 AND published=true`,[rows[0].id,ONECHATTER_APP.version]);
    if(!published[0])throw Error('OneChatter published package is unavailable');
  });
}
