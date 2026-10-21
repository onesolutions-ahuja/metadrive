import type {SqlPersistence} from '../system-files/sql-persistence.js';

/**
 * Independent Acetill catalog seeder. Register discoverable package metadata
 * without installing, licensing, granting permissions or starting Acetill for
 * any tenant. Those transitions belong to the shared AppExchange lifecycle.
 *
 * SQL is the only source of truth. Never replace edited tenant app metadata.
 */
export const ACETILL_PACKAGE={
  apiName:'Acetill',
  label:'Acetill',
  version:1,
  description:'Independent point of sale frontend powered by MetaDrive Objects, OneEngine and Flows',
  brandColor:'#1769D2'
} as const;

export async function seedAcetillAppCatalog(db:Pick<SqlPersistence,'transaction'>):Promise<void> {
  await db.transaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['metadrive:app-catalog:Acetill']);
    const {rows:apps}=await client.query<{id:string}>(`
      INSERT INTO md_apps(api_name,label,enabled,tenant_owner_id)
      VALUES($1,$2,true,NULL)
      ON CONFLICT(api_name) DO NOTHING RETURNING id
    `,[ACETILL_PACKAGE.apiName,ACETILL_PACKAGE.label]);
    const appId=apps[0]?.id
      ??(await client.query<{id:string}>(`
        SELECT id FROM md_apps
        WHERE api_name=$1 AND enabled=true AND tenant_owner_id IS NULL
      `,[ACETILL_PACKAGE.apiName])).rows[0]?.id;
    if(!appId)throw Error('Acetill catalog identity unavailable or conflicting');
    await client.query(`
      INSERT INTO md_app_package_versions(app_id,version,published,description,brand_color)
      VALUES($1,$2,true,$3,$4)
      ON CONFLICT(app_id,version) DO NOTHING
    `,[appId,ACETILL_PACKAGE.version,ACETILL_PACKAGE.description,ACETILL_PACKAGE.brandColor]);
  });
}
