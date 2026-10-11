// Additive, transaction-safe in-place relational migration for an Aiven database.
// The existing metadrive_platform_state JSONB row is NEVER updated or deleted.
// No writes without an independently restored and checksum-verified backup,
// declared maintenance downtime, and explicit --apply.
import pg from 'pg';
import { createHash } from 'node:crypto';
import { createReadStream,statSync,readFileSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectState,verifyProjection,stateDigest } from '../src/relational-projection.mjs';
import { insertProjectedRows,verifyRelationalCopy } from '../src/relational-copy.mjs';

const flags=process.argv.slice(2);
const apply=flags.length===1&&flags[0]==='--apply';
if(flags.length&& !apply) throw Error('Supported flags: --apply (default is read-only preflight)');
if(!process.env.DATABASE_URL) throw Error('DATABASE_URL is required');
if(apply) {
  if(!['staging','production'].includes(process.env.METADRIVE_MIGRATION_TARGET))
    throw Error('Explicit METADRIVE_MIGRATION_TARGET=staging or production required');
  if(process.env.METADRIVE_CONFIRMED_OFFLINE!=='true')
    throw Error('Stop ALL MetaDrive API writers before backfilling relational tables');
  if(process.env.METADRIVE_BACKUP_VERIFIED_RESTORE!=='true')
    throw Error('An independent, restorable database backup must be verified first');
  if(process.env.METADRIVE_PERSISTENCE_MODE==='relational')
    throw Error('Migration cannot run after relational mode has been enabled');
}
const url=new URL(process.env.DATABASE_URL);
if(!['postgres:','postgresql:'].includes(url.protocol)) throw Error('Invalid PostgreSQL URL');
for(const key of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(key);
function makeClient() {
  return new pg.Client({
    connectionString:url.toString(),
    ssl:process.env.PGSSLMODE==='disable'?false:{
      rejectUnauthorized:process.env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT!=='true',
      ...(process.env.METADRIVE_DB_CA_CERT?{ca:process.env.METADRIVE_DB_CA_CERT.replace(/\\n/g,'\n')}:{})
    },
    connectionTimeoutMillis:15000
  });
}
async function verifyExternalBackup() {
  const file=process.env.METADRIVE_VERIFIED_BACKUP_FILE;
  const expected=process.env.METADRIVE_VERIFIED_BACKUP_SHA256;
  if(!file||!expected||!/^[a-f0-9]{64}$/i.test(expected))
    throw Error('Provide METADRIVE_VERIFIED_BACKUP_FILE and METADRIVE_VERIFIED_BACKUP_SHA256');
  const stat=statSync(file);
  if(!stat.isFile()||!stat.size) throw Error('Backup file is missing or empty');
  const hash=createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if(hash.digest('hex')!==expected.toLowerCase()) throw Error('External backup checksum mismatch');
  return {file,bytes:stat.size};
}
const verifiedBackup=apply?await verifyExternalBackup():null;
const client=makeClient();
await client.connect();
let inTransaction=false;
try {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  inTransaction=true;
  await client.query("SET LOCAL lock_timeout='10s'");
  await client.query("SET LOCAL statement_timeout='120s'");
  const original=await client.query('SELECT payload FROM metadrive_platform_state WHERE id=1 FOR UPDATE');
  if(original.rowCount!==1) throw Error('Exactly one existing platform state must be present');
  const state=original.rows[0].payload;
  const projection=projectState(state);
  const checked=verifyProjection(state,projection);
  // JSON state backups can be compared to the precise frozen source snapshot.
  // A pg_dump backup is checked by SHA256 and the external restore attestation.
  if(verifiedBackup&&verifiedBackup.bytes<100_000_000) {
    let jsonBackup=null;
    try {jsonBackup=JSON.parse(readFileSync(verifiedBackup.file,'utf8'));} catch {}
    if(jsonBackup&&typeof jsonBackup==='object'&&'tenants' in jsonBackup) {
      if(stateDigest(jsonBackup)!==checked.digest) throw Error('JSON backup differs from the current database state');
    }
  }
  console.log(JSON.stringify({mode:apply?'in-place-additive-migration':'read-only-preflight',sha256:checked.digest,counts:checked.counts},null,2));
  if(!apply) {
    await client.query('ROLLBACK');
    inTransaction=false;
  } else {
    const occupied=await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name LIKE 'metadrive_rel_%' LIMIT 1");
    if(occupied.rowCount) throw Error('Relational tables already exist; refusing duplicate or destructive backfill');
    const sql=resolve(dirname(fileURLToPath(import.meta.url)),'../sql/relational-state-v1.sql');
    await client.query(readFileSync(sql,'utf8'));
    await insertProjectedRows(client,projection);
    await verifyRelationalCopy(client,state,projection);
    // Both guard markers commit atomically with all metadata and record rows.
    await client.query('INSERT INTO metadrive_rel_migrations (revision,source_sha256) VALUES (1,$1)',[checked.digest]);
    await client.query('INSERT INTO metadrive_rel_runtime (id,version,state_sha256) VALUES (1,0,$1)',[checked.digest]);
    await client.query('COMMIT');
    inTransaction=false;
    console.log('Additive migration verified and committed. Legacy JSONB state remains untouched.');
    console.log('Do not enable relational mode until the API is stopped and the backup/rollback procedure is ready.');
  }
} catch(error) {
  if(inTransaction) await client.query('ROLLBACK');
  throw error;
} finally {await client.end();}
