// Last-resort offline rollback: reconstruct CURRENT relational state into the
// retained legacy JSONB row before switching METADRIVE_PERSISTENCE_MODE to jsonb.
// Never run with active API writers. No tables are dropped.
import pg from 'pg';
import { createHash } from 'node:crypto';
import { createReadStream,statSync } from 'node:fs';
import { readRelationalRows } from '../src/relational-tables.mjs';
import { restoreState,stateDigest,verifyProjection } from '../src/relational-projection.mjs';

const flags=process.argv.slice(2);
const apply=flags.length===1&&flags[0]==='--apply';
if(flags.length&&!apply) throw Error('Supported flags: --apply (default is read-only preflight)');
if(process.env.METADRIVE_PERSISTENCE_MODE!=='relational') throw Error('Relational mode must be selected before rollback export');
if(!process.env.DATABASE_URL) throw Error('DATABASE_URL required');
if(apply) {
  if(process.env.METADRIVE_CONFIRMED_OFFLINE!=='true'||process.env.METADRIVE_ROLLBACK_CONFIRMED!=='true')
    throw Error('Stop all API writers and explicitly confirm rollback');
  if(process.env.METADRIVE_BACKUP_VERIFIED_RESTORE!=='true')
    throw Error('Independently restore/verify a backup before rollback');
  const backup=process.env.METADRIVE_VERIFIED_BACKUP_FILE;
  const expected=process.env.METADRIVE_VERIFIED_BACKUP_SHA256;
  if(!backup||!expected||!/^[a-f0-9]{64}$/i.test(expected)) throw Error('Backup path and verified SHA256 are required');
  const stat=statSync(backup);
  if(!stat.isFile()||stat.size===0) throw Error('Missing backup file');
  const digest=createHash('sha256');
  for await(const chunk of createReadStream(backup)) digest.update(chunk);
  if(digest.digest('hex')!==expected.toLowerCase()) throw Error('Backup SHA256 mismatch; nothing changed');
}
const url=new URL(process.env.DATABASE_URL);
for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(k);
const client=new pg.Client({
  connectionString:url.toString(),
  ssl:process.env.PGSSLMODE==='disable'?false:{
    rejectUnauthorized:process.env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT!=='true',
    ...(process.env.METADRIVE_DB_CA_CERT?{ca:process.env.METADRIVE_DB_CA_CERT.replace(/\\n/g,'\n')}:{})
  }
});
let started=false;
await client.connect();
try {
  await client.query('BEGIN');
  started=true;
  await client.query("SET LOCAL lock_timeout='10s'");
  const marker=await client.query('SELECT version,state_sha256 FROM metadrive_rel_runtime WHERE id=1 FOR UPDATE');
  const migration=await client.query('SELECT source_sha256 FROM metadrive_rel_migrations WHERE revision=1');
  const legacy=await client.query('SELECT payload FROM metadrive_platform_state WHERE id=1 FOR UPDATE');
  if(marker.rowCount!==1||migration.rowCount!==1||legacy.rowCount!==1)
    throw Error('Both verified relational state and original legacy source must exist');
  if(stateDigest(legacy.rows[0].payload)!==String(migration.rows[0].source_sha256).trim())
    throw Error('Legacy baseline has changed; refusing rollback to avoid overwriting it');
  const projected=await readRelationalRows(client);
  const current=restoreState(projected);
  verifyProjection(current,projected);
  const currentDigest=stateDigest(current);
  if(currentDigest!==String(marker.rows[0].state_sha256).trim())
    throw Error('Relational state checksum mismatch; refusing rollback');
  console.log('Verified relational snapshot for rollback, revision '+marker.rows[0].version+', SHA256 '+currentDigest);
  if(apply) {
    await client.query('UPDATE metadrive_platform_state SET payload=$1::jsonb,updated_at=now() WHERE id=1',[JSON.stringify(current)]);
    const reloaded=await client.query('SELECT payload FROM metadrive_platform_state WHERE id=1');
    if(stateDigest(reloaded.rows[0].payload)!==currentDigest) throw Error('Legacy rollback readback verification failed');
    await client.query('COMMIT');
    started=false;
    console.log('Latest relational state exported into legacy row. Set mode=jsonb ONLY while API stays stopped.');
    console.log('Relational tables retained for investigation; future relational startup now fails closed.');
  } else {
    await client.query('ROLLBACK');
    started=false;
  }
} catch(error) {
  if(started) await client.query('ROLLBACK');
  throw error;
} finally {await client.end();}
