/**
 * Read-only SQL table / seeder ownership audit for the verified SQL-only runtime.
 *
 * SQL tables are backend storage, NOT frontend resources: a Page or Flow can
 * access a table through generic Object APIs without naming the table itself.
 *
 * Usage: DATABASE_URL=... METADRIVE_SQL_TARGET_DB=... node apps/server/scripts/audit-sql-table-lifecycle.mjs
 *
 * Does not mutate the database, remove metadata, or expose customer records.
 */
import pg from 'pg';
import {readdirSync,readFileSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readNormalizedState} from '../src/normalized-state-runtime.mjs';
import {verifyTypedRecords} from '../src/normalized-typed-records.mjs';
import {loadAppSeedCatalog} from '../src/seeders/catalog.mjs';

const root=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const sqlUrl=process.env.DATABASE_URL;
const target=process.env.METADRIVE_SQL_TARGET_DB;
if(!sqlUrl||!/^[a-z][a-z0-9_]{2,61}$/.test(target??''))
  throw Error('DATABASE_URL and explicit METADRIVE_SQL_TARGET_DB are required');
const url=new URL(sqlUrl);
if(!['postgres:','postgresql:'].includes(url.protocol))
  throw Error('PostgreSQL connection required');
url.pathname='/'+target;
for(const key of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(key);
const ssl=process.env.PGSSLMODE==='disable'?false:{
  rejectUnauthorized:process.env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT!=='true',
  ...(process.env.METADRIVE_DB_CA_CERT?{ca:process.env.METADRIVE_DB_CA_CERT.replace(/\\n/g,'\n')}:{})
};
const pool=new pg.Pool({connectionString:url.toString(),ssl,max:1,connectionTimeoutMillis:15000});

function walk(dir,out=[]){
  try {
    for(const entry of readdirSync(dir,{withFileTypes:true})){
      if(entry.name==='node_modules'||entry.name==='dist'||entry.name==='.git')continue;
      const path=join(dir,entry.name);
      if(entry.isDirectory())walk(path,out);
      else if(/\.(?:ts|tsx|js|mjs|json|sql|yml|yaml)$/.test(entry.name))out.push(path);
    }
  }catch(error){if(error?.code!=='ENOENT')throw error;}
  return out;
}
const sources=walk(resolve(root,'apps/server/src'))
  .concat(walk(resolve(root,'apps/server/sql')))
  .concat(walk(resolve(root,'apps/server/scripts')))
  .concat(walk(resolve(root,'apps/server/data')))
  .concat(walk(resolve(root,'apps/web/src')))
  .concat(walk(resolve(root,'.github/workflows')))
  .filter(path=>!path.endsWith('/audit-sql-table-lifecycle.mjs'))
  .map(path=>({path:relative(root,path),contents:readFileSync(path,'utf8')}));
const literalReferences=name=>sources.filter(item=>item.contents.includes(name)).map(item=>item.path);
const catalog=loadAppSeedCatalog();

function objectUses(tenant,apiName){
  const surfaces=['pages','apps','flows','dashboards','reports'];
  // Exclude the Object schema itself, RBAC grants and obsolete app definitions.
  const refs=[];
  for(const kind of surfaces){
    for(const entry of tenant[kind]??[]){
      const serialized=JSON.stringify(entry);
      if(!serialized.includes(apiName))continue;
      if(kind==='apps'&&entry.installationAppKey){
        const installed=(tenant.records?.Connector_App__c??[]).some(
          row=>row.AppKey__c===entry.installationAppKey&&row.Installed__c===true);
        if(!installed)continue;
      }
      if(kind==='flows'&&entry.status==='Obsolete')continue;
      refs.push(kind+':'+(entry.apiName??entry.name??'<unnamed>'));
    }
  }
  for(const object of tenant.objects??[]){
    if(object.apiName===apiName)continue;
    if((object.fields??[]).some(field=>field.relationship?.targetObject===apiName||
       field.dataType==='Lookup('+apiName+')'))
      refs.push('lookup:'+object.apiName);
  }
  return [...new Set(refs)];
}

function classify(name,registry,tenantObjects){
  if(name.startsWith('md_obj_')){
    const entry=registry.get(name);
    if(!entry)return {category:'ORPHAN_PHYSICAL_REVIEW',protection:'data-and-reference-check-required'};
    const defined=tenantObjects.get(entry.tenant_id)?.has(entry.api_name)===true;
    return {category:entry.active&&defined?'LIVE_OBJECT_TABLE':'RETIRED_OBJECT_REVIEW',
      protection:defined?'object-api-and-app-runtime':'preserve-retired-records',
      objectApiName:entry.api_name,tenantObjectDefined:defined};
  }
  if(/^md_v3_/.test(name))return {category:'LIVE_STATE',protection:'metadata-users-tenant-state'};
  if(/^md_v2_/.test(name))return {category:'OBJECT_REGISTRY',protection:'typed-physical-object-contract'};
  if(/^md_v4_archive_/.test(name))return {category:'RECOVERY_ARCHIVE',protection:'rollback-proof'};
  if(/^md_auth_/.test(name))return {category:'AUTH_RUNTIME',protection:'sessions-and-revocation'};
  if(/^md_integration_/.test(name))return {category:'INTEGRATION_RUNTIME',protection:'optional-connector-runtime'};
  if(name==='md_seed_package_versions')return {category:'SEED_VERSION_LEDGER',protection:'tenant-app-version-idempotency'};
  if(name==='metadrive_rel_tenants')return {category:'SHARED_TENANT_FK',protection:'runtime-registry-foreign-keys'};
  if(name.startsWith('metadrive_rel_'))return {category:'LEGACY_RELATIONAL_REVIEW',protection:'migration-or-recovery-dependency'};
  if(/backup|snapshot/i.test(name))return {category:'HISTORICAL_BACKUP_REVIEW',protection:'requires-independent-restored-backup'};
  return {category:'UNKNOWN_REVIEW',protection:'not-safe-to-drop'};
}

const query="SELECT c.relname AS table_name,pg_total_relation_size(c.oid) AS bytes,"
  +"COALESCE(s.n_tup_ins,0) AS inserts,COALESCE(s.n_tup_upd,0) AS updates,"
  +"COALESCE(s.n_tup_del,0) AS deletes,"
  +"(SELECT count(*) FROM pg_constraint k WHERE k.confrelid=c.oid AND k.conrelid<>c.oid) AS referencing_fk_count "
  +"FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
  +"LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid "
  +"WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname";
try {
  const current=await pool.query('SELECT current_database() AS db');
  if(current.rows[0]?.db!==target)throw Error('Wrong target SQL database');
  // The same verified snapshot used for user authentication and all generic
  // Object APIs is the authority, not legacy metadrive_rel_* copies.
  const snapshot=await readNormalizedState(pool,verifyTypedRecords);
  const registryRows=await pool.query(
    'SELECT tenant_id,api_name,physical_table,active FROM md_v2_object_registry');
  const registry=new Map(registryRows.rows.map(item=>[item.physical_table,item]));
  const tenantObjects=new Map(Object.entries(snapshot.state.tenants??{}).map(
    ([id,tenant])=>[id,new Set((tenant.objects??[]).map(item=>item.apiName))]));
  const sqlTables=(await pool.query(query)).rows;
  const physicalNames=[...registry.keys()].filter(name=>/^md_obj_[0-9a-f]{32}$/.test(name));
  const countsRow=physicalNames.length
    ?(await pool.query('SELECT '+physicalNames.map((name,index)=>
      '(SELECT count(*)::integer FROM public.'+name+') AS n'+index).join(','))).rows[0]
    :{};
  const physicalCounts=new Map(physicalNames.map((name,index)=>[name,Number(countsRow['n'+index])]));
  const tables=sqlTables.map(row=>{
    const info=classify(row.table_name,registry,tenantObjects);
    const records=physicalCounts.get(row.table_name);
    // A system User is served from canonical authentication state; its empty
    // extra physical table is a verified clean-up candidate, unlike ordinary
    // zero-row business Objects which remain configurable from Object Manager.
    if(info.objectApiName==='User'&&records===0){
      info.category='EMPTY_SYSTEM_USER_DUPLICATE';
      info.protection='guarded-identity-de-duplication';
    }
    const references=literalReferences(row.table_name);
    const owner=registry.get(row.table_name);
    const tenant=owner?snapshot.state.tenants?.[owner.tenant_id]:null;
    return {
      table:row.table_name,...info,
      bytes:Number(row.bytes),
      ...(records!==undefined?{recordCount:records}:{}),
      historicalWrites:Number(row.inserts)+Number(row.updates)+Number(row.deletes),
      incomingForeignKeys:Number(row.referencing_fk_count),
      codeReferences:references,
      ...(owner?{activeObjectSurfaces:tenant?objectUses(tenant,owner.api_name):[]}:{})
    };
  });
  const seederFiles=sources.filter(item=>
    /(?:^|\/)(?:seeders\/[^/]+|[^/]*seeder[^/]*)\.(?:mjs|ts)$/.test(item.path)
    &&item.path.startsWith('apps/server/'));
  const seeders=seederFiles.map(item=>{
    const base=item.path.split('/').pop();
    const importers=sources.filter(source=>
      source.path!==item.path&&(source.contents.includes(base)||source.contents.includes(base.replace(/\.ts$/,'.js')))).map(source=>source.path);
    return {path:item.path,referenceCount:importers.length,importedBy:importers};
  });
  const packageSummary=(catalog.packages??[]).map(pkg=>({
    appKey:pkg.appKey,version:String(pkg.version??''),
    suppliedObjects:(pkg.objects??[]).map(o=>o.apiName),
    extendedObjects:(pkg.extendObjects??[]).map(o=>o.apiName)
  }));
  const summary={
    mode:'read-only',database:target,revision:snapshot.version,
    totalTables:tables.length,trackedObjects:registry.size,
    zeroRowPhysicalTables:tables.filter(item=>item.recordCount===0).length,
    tenantCount:tenantObjects.size,
    byCategory:Object.fromEntries([...new Set(tables.map(t=>t.category))].map(
      type=>[type,tables.filter(t=>t.category===type).length])),
    explicitDropAuthorizations:0,
    // Review-only candidates: a named historical backup is not proof that an
    // independent backup or downstream recovery path no longer needs it.
    candidates:tables.filter(t=>t.category.endsWith('_REVIEW')&&
      t.incomingForeignKeys===0&&t.codeReferences.length===0).map(t=>t.table)
  };
  process.stdout.write(JSON.stringify({summary,tables,seeders,packageSummary},null,2)+'\n');
}finally {await pool.end();}
