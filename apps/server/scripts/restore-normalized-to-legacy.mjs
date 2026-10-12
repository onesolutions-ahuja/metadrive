// Guarded rollback for a normalized SQL cutover; exports all post-cutover
// changes to the legacy state only while API writers and webhooks are halted.
// Never delete normalized tables; retain both copies until verification.
import pg from 'pg';
import {createHash} from 'node:crypto';
import {createReadStream,statSync} from 'node:fs';
import {stateDigest} from '../src/relational-projection.mjs';
import {restoreNormalizedTree} from '../src/normalized-state-tree.mjs';

const apply=process.argv.length===3&&process.argv[2]==='--apply';
if(process.argv.length!==2&&!apply) throw Error('Only read-only preflight or --apply is supported');
if(!process.env.DATABASE_URL) throw Error('DATABASE_URL required');
if(process.env.METADRIVE_PERSISTENCE_MODE!=='normalized')
  throw Error('Rollback requires an approved normalized SQL cutover');
const u=new URL(process.env.DATABASE_URL);
const local=['localhost','127.0.0.1','::1'].includes(u.hostname);
if(!local && !u.hostname.endsWith('.aivencloud.com')) throw Error('Unapproved rollback database host');
if(!local && process.env.PGSSLMODE==='disable') throw Error('TLS required for remote database');
if(apply) {
  for(const key of ['METADRIVE_CONFIRMED_OFFLINE','METADRIVE_ROLLBACK_CONFIRMED','METADRIVE_BACKUP_VERIFIED_RESTORE'])
    if(process.env[key]!=='true') throw Error('Missing required rollback safety attestation: '+key);
  const path=process.env.METADRIVE_VERIFIED_BACKUP_FILE;
  const expected=process.env.METADRIVE_VERIFIED_BACKUP_SHA256;
  if(!path||!expected||!/^[a-f0-9]{64}$/i.test(expected)) throw Error('Validated recovery backup is required');
  if(!statSync(path).isFile()||statSync(path).size<20) throw Error('Verified backup is missing');
  const digest=createHash('sha256');
  for await(const chunk of createReadStream(path)) digest.update(chunk);
  if(digest.digest('hex')!==expected.toLowerCase()) throw Error('Verified rollback backup checksum mismatch');
  if(!local) {
    // Public maintenance barrier must be externally active and verifiable.
    const endpoint=process.env.METADRIVE_MAINTENANCE_BARRIER_URL;
    if(!endpoint||!/^https:\/\//.test(endpoint)) throw Error('Explicit HTTPS maintenance barrier URL required');
    const response=await fetch(endpoint,{signal:AbortSignal.timeout(15000)});
    if(response.status!==503) throw Error('API maintenance barrier is not active');
    const body=await response.json();
    if(body?.error!=='MetaDrive database maintenance in progress') throw Error('Unexpected maintenance barrier');
  }
}
for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])u.searchParams.delete(key);
const client=new pg.Client({connectionString:u.toString(),ssl:local?false:{
  rejectUnauthorized:process.env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT!=='true',
  ...(process.env.METADRIVE_DB_CA_CERT?{ca:process.env.METADRIVE_DB_CA_CERT.replace(/\\n/g,'\n')}:{})
},connectionTimeoutMillis:15000});
await client.connect();
let begun=false;
try {
  await client.query('BEGIN');
  begun=true;
  await client.query("SET LOCAL lock_timeout='10s'");
  await client.query("SET LOCAL statement_timeout='120s'");
  const m=await client.query('SELECT revision,state_sha256,source_sha256 FROM md_v3_runtime WHERE id=1 FOR UPDATE');
  if(m.rowCount!==1) throw Error('Normalized SQL runtime marker is missing');
  const rev=Number(m.rows[0].revision);
  if(!Number.isSafeInteger(rev)||rev<0)throw Error('Invalid runtime revision');
  // Logical runtime revisions advance on delta commits, while stored node IDs
  // retain one stable SQL revision. Verify exactly one physical snapshot.
  const physical=await client.query('SELECT DISTINCT revision FROM md_v3_state_nodes LIMIT 2');
  if(physical.rowCount!==1) throw Error('Invalid normalized storage revision set');
  const storageRev=Number(physical.rows[0].revision);
  if(!Number.isSafeInteger(storageRev)||storageRev<0) throw Error('Invalid stored node revision');
  const rows=await client.query('SELECT node_id,parent_id,slot_key,ordinal,kind,string_value,number_value,bool_value FROM md_v3_state_nodes WHERE revision=$1 ORDER BY node_id',[storageRev]);
  const state=restoreNormalizedTree(rows.rows);
  const digest=stateDigest(state);
  if(digest!==m.rows[0].state_sha256.trim()) throw Error('Normalized state digest mismatch');
  const old=await client.query('SELECT payload FROM metadrive_platform_state WHERE id=1 FOR UPDATE');
  if(old.rowCount!==1||stateDigest(old.rows[0].payload)!==m.rows[0].source_sha256.trim())
    throw Error('Legacy baseline changed independently; refusing unsafe rollback');
  if(!apply) {
    await client.query('ROLLBACK');
    begun=false;
    console.log(JSON.stringify({readyForGuardedRollback:true,revision:rev,legacyBaselineValid:true,
      pendingChanges:digest!==m.rows[0].source_sha256.trim()}));
  }else{
    await client.query('UPDATE metadrive_platform_state SET payload=$1::jsonb,updated_at=now() WHERE id=1',[JSON.stringify(state)]);
    const check=await client.query('SELECT payload FROM metadrive_platform_state WHERE id=1');
    if(stateDigest(check.rows[0].payload)!==digest) throw Error('Legacy rollback readback digest mismatch');
    await client.query('COMMIT');
    begun=false;
    console.log('Verified normalized SQL state copied to legacy rollback store. Original SQL tables retained.');
  }
}catch(error){
  if(begun)await client.query('ROLLBACK');
  throw error;
}finally{await client.end();}
