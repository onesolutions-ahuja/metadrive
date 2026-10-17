/**
 * Conservative SQL-only duplicate-backup cleanup.
 *
 * Only the two historical tables already verified as equal in both SQL
 * databases can be considered. This does NOT remove business Objects, users,
 * installed packages, recovery archives or schema/seed infrastructure.
 *
 * Dry run:
 *   DATABASE_URL=... METADRIVE_SQL_TARGET_DB=metadrive_sql_20261012 \
 *     node apps/server/scripts/remove-verified-sql-duplicates.mjs
 *
 * Actual removal requires an independently restored CURRENT encrypted SQL
 * backup and its validated proof file, then:
 *   METADRIVE_SQL_CLEANUP_PROOF_FILE=/secure/path/proof.json \
 *     node apps/server/scripts/remove-verified-sql-duplicates.mjs --apply
 *
 * This script is never called from startup, seeders, app install, or CI.
 */
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {readNormalizedState} from '../src/normalized-state-runtime.mjs';
import {verifyTypedRecords} from '../src/normalized-typed-records.mjs';

export const duplicateBackupNames=Object.freeze([
  'md_wa_router_backup_20261011',
  'metadrive_connector_backup_20261011'
]);
// These are old source-database projections. In typed SQL-only mode, the
// normalized graph and physical md_obj_* tables are canonical. Keep
// metadrive_rel_tenants: md_v2 Object/Field and app-seed FKs still reference it.
// User and system User physical de-duplication use a separate guarded switch.
export const legacyStagingNames=Object.freeze([
  'metadrive_rel_records',
  'metadrive_rel_record_buckets',
  'metadrive_rel_tenant_collection_items',
  'metadrive_rel_tenant_collections',
  'metadrive_rel_library_components',
  'metadrive_rel_migrations',
  'metadrive_rel_objects',
  'metadrive_rel_refresh_sessions',
  'metadrive_rel_revoked_tokens',
  'metadrive_rel_runtime',
  'metadrive_rel_tenant_settings'
]);

const target=process.env.METADRIVE_SQL_TARGET_DB;
const input=process.env.DATABASE_URL;
const applying=process.argv.includes('--apply');
const removeSystemUser=process.argv.includes('--user-duplicates');
const retireLegacyStaging=process.argv.includes('--retire-legacy-staging');
if(process.argv.slice(2).some(arg=>!['--apply','--user-duplicates','--retire-legacy-staging'].includes(arg)))
  throw Error('Unknown argument');
if(!input||target!=='metadrive_sql_20261012')
  throw Error('Expected explicit SQL-only database and DATABASE_URL');
const base=new URL(input);
if(!['postgres:','postgresql:'].includes(base.protocol))throw Error('Invalid SQL driver');
if(!base.hostname.toLowerCase().endsWith('.aivencloud.com'))
  throw Error('Only approved Aiven SQL-only database is accepted');
if(process.env.PGSSLMODE==='disable')throw Error('TLS is mandatory');
for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])base.searchParams.delete(k);
const ssl={rejectUnauthorized:process.env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT!=='true',
  ...(process.env.METADRIVE_DB_CA_CERT?{ca:process.env.METADRIVE_DB_CA_CERT.replace(/\\n/g,'\n')}:{})};
function connection(database){
  const url=new URL(base.toString());
  url.pathname='/'+database;
  return new pg.Pool({connectionString:url.toString(),ssl,max:1,connectionTimeoutMillis:15000});
}
const active=connection(target),archive=connection('defaultdb');
const tableFingerprintSql=name=>
  'SELECT count(*)::bigint AS row_count,'+
  "md5(coalesce(string_agg(md5(to_jsonb(t)::text),'|' ORDER BY md5(to_jsonb(t)::text)),'')) AS digest "+
  'FROM public.'+name+' t';
const schemaSql="SELECT column_name,data_type,udt_name,is_nullable,column_default "+
  "FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position";
const dependenciesSql="SELECT "+
  "(SELECT count(*)::int FROM pg_constraint WHERE confrelid=$1::regclass AND conrelid<>$1::regclass) AS inbound_fks,"+
  "(SELECT count(*)::int FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal) AS triggers,"+
  "(SELECT count(*)::int FROM pg_rewrite WHERE ev_class=$1::regclass AND rulename<>'_RETURN') AS rules";
async function fingerprint(client,name){
  const schema=(await client.query(schemaSql,[name])).rows;
  if(schema.length===0)throw Error('Missing backup table: '+name);
  const hash=(await client.query(tableFingerprintSql(name))).rows[0];
  return {schema,rows:Number(hash.row_count),digest:hash.digest};
}
function comparable(a,b){
  return a.rows===b.rows&&a.digest===b.digest&&
    JSON.stringify(a.schema)===JSON.stringify(b.schema);
}
async function check(name,client){
  const targetCopy=await fingerprint(client,name);
  const archiveCopy=await fingerprint(archive,name);
  const dep=(await client.query(dependenciesSql,['public.'+name])).rows[0];
  return {name,targetCopy,archiveCopy,
    noInboundDependencies:dep.inbound_fks===0&&dep.triggers===0&&dep.rules===0,
    verified:comparable(targetCopy,archiveCopy)&&
      dep.inbound_fks===0&&dep.triggers===0&&dep.rules===0};
}
function verifyProof(proof,snapshot){
  if(!proof||proof.database!==target||proof.revision!==snapshot.version||
    proof.stateDigest!==snapshot.digest||proof.restoredDatabaseVerified!==true||
    !/^[a-f0-9]{64}$/.test(proof.encryptedBackupSha256??'')||
    typeof proof.verifiedAt!=='string'||!Number.isFinite(Date.parse(proof.verifiedAt)))
    throw Error('Fresh independently restored SQL backup proof missing or mismatched');
  // On-disk archive and fresh encrypted backup are separate data-recovery layers.
}

/** The SQL-only identity projection is the ONLY authoritative User data.
 * A zero-row typed User table must not be recreated by the generic Object
 * synchroniser; the deployed version is checked again before any DROP.
 */
async function inspectSystemUserDuplicates(client,snapshot){
  const realUsers=snapshot.state.users??[];
  if(!realUsers.length || realUsers.some(u=>!u.id||!u.email||!u.passwordHash||!u.passwordSalt))
    throw Error('Canonical user identities are missing or incomplete');
  const known=new Map(realUsers.map(u=>[u.id,u]));
  if(known.size!==realUsers.length)throw Error('Duplicate canonical User identity IDs');
  const old=(await client.query('SELECT user_id,email FROM metadrive_rel_users')).rows;
  if(old.some(u=>!known.has(u.user_id)||
      known.get(u.user_id).email.toLowerCase()!==u.email.toLowerCase()))
    throw Error('Legacy user rows are not a subset of canonical authentication identities');
  const matches=(await client.query(
    "SELECT object_id,physical_table,active FROM md_v2_object_registry WHERE api_name='User'")).rows;
  if(matches.length!==1||!/^md_obj_[0-9a-f]{32}$/.test(matches[0].physical_table))
    throw Error('Expected exactly one immutable generic User registry entry');
  const user=matches[0];
  const count=(await client.query('SELECT count(*)::int AS n FROM public.'+user.physical_table)).rows[0].n;
  const presence=(await client.query(
    'SELECT count(*)::int AS n FROM md_v2_field_presence WHERE object_id=$1',
    [user.object_id])).rows[0].n;
  if(count!==0||presence!==0)throw Error('Generic physical User table contains data; refuse cleanup');
  const dependencies=[];
  for(const name of [user.physical_table,'metadrive_rel_users']){
    const row=(await client.query(dependenciesSql,['public.'+name])).rows[0];
    if(row.inbound_fks||row.triggers||row.rules)
      throw Error('External SQL dependency prevents User cleanup');
    dependencies.push(name);
  }
  const reference=(snapshot.state.tenants??{});
  if(Object.values(reference).some(t=>(t.records?.User??[]).length!==0))
    throw Error('User was written as an ordinary business Object');
  return {canonicalUsers:realUsers.length,legacyUsers:old.length,
    emptyPhysicalUser:user.physical_table,registryId:user.object_id,
    protectedReferences:dependencies};
}

async function inspectLegacyStaging(client){
  const databaseRows=(await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1::text[])",
    [legacyStagingNames])).rows;
  if(databaseRows.length!==legacyStagingNames.length)
    throw Error('Legacy relational staging schema is not complete; cannot retire');
  const blocked=await client.query(
    "SELECT c.conname,c.conrelid::regclass::text AS from_table,c.confrelid::regclass::text AS to_table "+
    "FROM pg_constraint c WHERE c.contype='f' AND c.confrelid=ANY($1::regclass[]) "+
    "AND NOT (c.conrelid=ANY($1::regclass[]))",
    [legacyStagingNames.map(n=>'public.'+n)]);
  if(blocked.rowCount)throw Error('Active SQL schema still has foreign keys to legacy staging');
  const dependencyRows=[];
  for(const name of legacyStagingNames){
    const sql=(await client.query(dependenciesSql,['public.'+name])).rows[0];
    if(sql.triggers||sql.rules)throw Error('Custom SQL dependency blocks legacy retirement');
    dependencyRows.push({table:name,inboundForeignKeys:sql.inbound_fks});
  }
  // A live seed package ledger and typed object registry must remain anchored
  // to the separate metadrive_rel_tenants table (which is NOT in this allowlist).
  const anchors=await client.query(
    "SELECT (SELECT count(*) FROM metadrive_rel_tenants) AS tenants,"+
    "(SELECT count(*) FROM md_v2_object_registry) AS objects,"+
    "(SELECT count(*) FROM md_seed_package_versions) AS seeded");
  if(Number(anchors.rows[0]?.tenants)<1||Number(anchors.rows[0]?.objects)<1)
    throw Error('Missing live tenant/object schema; refusing staging retirement');
  return {tables:legacyStagingNames.length,tenantAnchorKept:true,
    existingSeedLedgerRows:Number(anchors.rows[0].seeded),dependencies:dependencyRows};
}
async function requireCurrentDeployedUserRuntime(){
  const expected=process.env.METADRIVE_CLEANUP_EXPECTED_DEPLOY_SHA;
  if(!/^[a-f0-9]{40}$/.test(expected??''))
    throw Error('Newly deployed commit SHA is required for User migration');
  const res=await fetch('https://metadrive.onrender.com/health',{
    signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw Error('Live backend health check failed');
  const health=await res.json();
  if(health.persistenceMode!=='typed'||health.database!=='healthy'||
     health.deployedCommit!==expected)
    throw Error('Production is not running the verified User-de-duplication code');
}

let client;
try {
  if((await active.query('SELECT current_database() AS db')).rows[0]?.db!==target)
    throw Error('Not connected to SQL-only target');
  if((await archive.query('SELECT current_database() AS db')).rows[0]?.db!=='defaultdb')
    throw Error('Not connected to retained historical-backup database');
  // Real source of truth, independently verify both metadata and physical Objects.
  const snapshot=await readNormalizedState(active,verifyTypedRecords);
  if(applying){
    const proofPath=process.env.METADRIVE_SQL_CLEANUP_PROOF_FILE;
    if(!proofPath)throw Error('Set verified backup proof file before --apply');
    verifyProof(JSON.parse(readFileSync(proofPath,'utf8')),snapshot);
  }
  const checks=[];
  if(!removeSystemUser&&!retireLegacyStaging)
    for(const name of duplicateBackupNames)checks.push(await check(name,active));
  const systemUser=removeSystemUser?await inspectSystemUserDuplicates(active,snapshot):null;
  const oldStaging=retireLegacyStaging?await inspectLegacyStaging(active):null;
  const report={mode:applying?'apply':'dry-run',database:target,revision:snapshot.version,
    ...(oldStaging?{oldStaging}:{}),
    ...(systemUser?{systemUser}:(retireLegacyStaging?{}:{
      candidates:checks.map(item=>({
        table:item.name,rows:item.targetCopy.rows,identicalCopyInDefaultdb:item.verified,
        inboundDependencies:!item.noInboundDependencies
      }))
    }))};
  if(checks.some(item=>!item.verified))
    throw Error('Duplicate cleanup preflight failed: '+JSON.stringify(report));
  if(applying&&(removeSystemUser||retireLegacyStaging))await requireCurrentDeployedUserRuntime();
  if(!applying){
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
  }else{
    client=await active.connect();
    await client.query("BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'");
    try{
      if(removeSystemUser){
        await client.query('LOCK TABLE public.md_v2_object_registry IN ROW EXCLUSIVE MODE NOWAIT');
        await client.query('LOCK TABLE public.'+systemUser.emptyPhysicalUser+' IN ACCESS EXCLUSIVE MODE NOWAIT');
        await client.query('LOCK TABLE public.metadrive_rel_users IN ACCESS EXCLUSIVE MODE NOWAIT');
        const inside=await inspectSystemUserDuplicates(client,snapshot);
        if(JSON.stringify(inside)!==JSON.stringify(systemUser))
          throw Error('User cleanup changed during migration');
        await client.query(
          "UPDATE md_v2_object_registry SET active=false WHERE object_id=$1 AND api_name='User'",
          [systemUser.registryId]);
        await client.query('DROP TABLE public.'+systemUser.emptyPhysicalUser+' RESTRICT');
        await client.query('DROP TABLE public.metadrive_rel_users RESTRICT');
      }
      if(retireLegacyStaging){
        for(const name of legacyStagingNames)
          await client.query('LOCK TABLE public.'+name+' IN ACCESS EXCLUSIVE MODE NOWAIT');
        const inside=await inspectLegacyStaging(client);
        if(JSON.stringify(inside)!==JSON.stringify(oldStaging))
          throw Error('Legacy staging dependencies changed while locking');
        for(const name of legacyStagingNames)
          await client.query('DROP TABLE public.'+name+' RESTRICT');
      }
      if(!removeSystemUser&&!retireLegacyStaging){
        for(const name of duplicateBackupNames){
          await client.query('LOCK TABLE public.'+name+' IN ACCESS EXCLUSIVE MODE NOWAIT');
          const inside=await check(name,client);
          if(!inside.verified)throw Error('Backup changed during cleanup; aborting');
        }
        for(const name of duplicateBackupNames)
          await client.query('DROP TABLE public.'+name+' RESTRICT');
      }
      await client.query('COMMIT');
      process.stdout.write(JSON.stringify({...report,result:'committed',
        removed:[
          ...(removeSystemUser?[systemUser.emptyPhysicalUser,'metadrive_rel_users']:[]),
          ...(retireLegacyStaging?legacyStagingNames:[]),
          ...(!removeSystemUser&&!retireLegacyStaging?duplicateBackupNames:[])
        ]})+'\n');
    }catch(error){
      await client.query('ROLLBACK');
      throw error;
    }
  }
}finally{
  if(client)client.release();
  await active.end();
  await archive.end();
}
