// Read-only verification of an independently restored SQL-only database.
// No source values, login secrets or credentials are logged.
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {stateDigest} from '../src/relational-projection.mjs';
import {readNormalizedState} from '../src/normalized-state-runtime.mjs';
import {verifyTypedRecords} from '../src/normalized-typed-records.mjs';

const mode=process.argv[2];
if(!['source','target'].includes(mode)||process.argv.length!==3) throw Error('Expected source or target verification');
const digestFile=process.env.METADRIVE_DIGEST_FILE;
if(!digestFile) throw Error('Missing verified source digest file');
const expected=readFileSync(digestFile,'utf8').trim();
if(!/^[0-9a-f]{64}$/.test(expected)) throw Error('Invalid verified digest');
const sourceUrl=process.env.DATABASE_URL;
if(!sourceUrl) throw Error('Missing Aiven connection');
const u=new URL(sourceUrl);
if(!u.hostname.toLowerCase().endsWith('.aivencloud.com') || u.searchParams.get('sslmode')!=='require')
  throw Error('Verified Aiven PostgreSQL TLS required');
const sourceName=u.pathname.slice(1),targetName=process.env.METADRIVE_SQL_TARGET_DB;
if(!/^[a-z][a-z0-9_]{2,61}$/.test(targetName??'')||sourceName===targetName)
  throw Error('Invalid or non-distinct target database');
if(mode==='target') u.pathname='/'+targetName;
for(const k of ['sslmode','sslcert','sslkey','sslrootcert']) u.searchParams.delete(k);
const pool=new pg.Pool({connectionString:u.toString(),max:1,connectionTimeoutMillis:15000,
  ssl:{rejectUnauthorized:process.env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT!=='true',
    ...(process.env.METADRIVE_DB_CA_CERT?{ca:process.env.METADRIVE_DB_CA_CERT.replace(/\\n/g,'\n')}:{})}});
try{
  const ssl=await pool.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()');
  if(ssl.rows[0]?.ssl!==true) throw Error('Connection is not using TLS');
  if(mode==='source'){
    const old=await pool.query('SELECT payload FROM metadrive_platform_state WHERE id=1');
    if(old.rowCount!==1||stateDigest(old.rows[0].payload)!==expected)
      throw Error('Source changed after verified backup');
    console.log('Verified frozen legacy source checksum');
  }else{
    const columns=await pool.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE data_type IN ('json','jsonb') AND table_schema NOT IN ('pg_catalog','information_schema')");
    if(columns.rows[0]?.n!==0) throw Error('Target still has JSON/JSONB columns');
    const state=await readNormalizedState(pool,verifyTypedRecords);
    if(state.digest!==expected||state.sourceDigest!==expected)
      throw Error('Typed SQL does not match source checksum');
    const archive=await pool.query('SELECT count(*)::int AS n FROM md_v4_archive_sources');
    if(archive.rows[0]?.n<1) throw Error('Historical backups not archived');
    console.log(JSON.stringify({zeroJsonColumns:true,typedRecordsVerified:true,archivedTables:archive.rows[0].n}));
  }
}finally{await pool.end();}
