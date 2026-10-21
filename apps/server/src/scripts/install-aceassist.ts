import {SqlPersistence} from '../system-files/sql-persistence.js';
import {AppRuntime} from '../system-files/app-runtime.js';
import {seedAceAssistCatalog,seedAceAssistInstalledHome} from '../app-seeders/aceassist-app.js';

/** Explicit tenant install command, NOT loaded at server startup or for other tenants.
 * A valid existing tenant entitlement must be granted by the standard licensing process.
 * Usage: METADRIVE_TARGET_TENANT_SLUG=... DATABASE_URL=... node dist/scripts/install-aceassist.js
 */
async function main(){
  const slug=process.env.METADRIVE_TARGET_TENANT_SLUG;
  if(!slug||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw Error('Valid METADRIVE_TARGET_TENANT_SLUG required');
  const db=new SqlPersistence(process.env.DATABASE_URL??'');
  try {
    const {rows}=await db.query<{id:string}>(`SELECT id FROM md_tenants WHERE slug=$1 AND status='ACTIVE'`,[slug]);
    if(!rows[0])throw Error('Active tenant not found');
    await seedAceAssistCatalog(db);
    await new AppRuntime(db).install(rows[0].id,'AceAssist');
    await seedAceAssistInstalledHome(db,rows[0].id);
    console.info('Ace Assist AppExchange installation and SQL landing verified for tenant:',slug);
  }finally{await db.pool.end();}
}
void main().catch(error=>{console.error('Ace Assist install failed:',error);process.exitCode=1;});
