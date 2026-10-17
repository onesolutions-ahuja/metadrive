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
const target=process.env.METADRIVE_SQL_TARGET_DB;
const input=process.env.DATABASE_URL;
const applying=process.argv.includes('--apply');
if(process.argv.some(arg=>!['--apply'].includes(arg)))
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
  for(const name of duplicateBackupNames)checks.push(await check(name,active));
  const report={mode:applying?'apply':'dry-run',database:target,revision:snapshot.version,
    candidates:checks.map(item=>({
      table:item.name,rows:item.targetCopy.rows,identicalCopyInDefaultdb:item.verified,
      inboundDependencies:!item.noInboundDependencies
    }))};
  if(checks.some(item=>!item.verified))
    throw Error('Duplicate cleanup preflight failed: '+JSON.stringify(report));
  if(!applying){
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
  }else{
    client=await active.connect();
    await client.query("BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'");
    try{
      for(const name of duplicateBackupNames){
        await client.query('LOCK TABLE public.'+name+' IN ACCESS EXCLUSIVE MODE NOWAIT');
        const inside=await check(name,client);
        if(!inside.verified)throw Error('Backup changed during cleanup; aborting');
      }
      for(const name of duplicateBackupNames){
        await client.query('DROP TABLE public.'+name+' RESTRICT');
      }
      await client.query('COMMIT');
      process.stdout.write(JSON.stringify({...report,result:'committed',removed:duplicateBackupNames})+'\n');
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
