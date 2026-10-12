// Transactional, fully typed (no JSONB) SQL state codec.
// This module is intentionally NOT connected to the production persistence selector
// until Flow, credential, row-based record and rollback parity are verified.
import {projectNormalizedTree,restoreNormalizedTree,verifyNormalizedTree} from './normalized-state-tree.mjs';
import {stateDigest} from './relational-projection.mjs';
import {planNormalizedDelta,verifyDeltaReadback} from './normalized-state-delta.mjs';

function asRevision(value) {
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<0) throw Error('Invalid normalized revision');
  return n;
}
const columns='revision,node_id,parent_id,slot_key,ordinal,kind,string_value,number_value,bool_value';
const normalizeRow=(r,revision)=>[
  revision,r.nodeId,r.parentId,r.slotKey,r.ordinal,r.kind,r.stringValue,r.numberValue,r.boolValue
];
async function insertNodes(client,revision,nodes) {
  // Fixed identifiers; all values are bound. Safe for arbitrary tenant metadata.
  const paramsPerRow=9, batchSize=300;
  for(let start=0;start<nodes.length;start+=batchSize) {
    const batch=nodes.slice(start,start+batchSize);
    const placeholders=batch.map((_,i)=>'('+Array.from({length:paramsPerRow},(_,j)=>'$'+(i*paramsPerRow+j+1)).join(',')+')').join(',');
    await client.query('INSERT INTO md_v3_state_nodes ('+columns+') VALUES '+placeholders,
      batch.flatMap(row=>normalizeRow(row,revision)));
  }
}
async function nodesAt(client,revision) {
  const result=await client.query(
    'SELECT node_id,parent_id,slot_key,ordinal,kind,string_value,number_value,bool_value FROM md_v3_state_nodes WHERE revision=$1 ORDER BY node_id',
    [revision]);
  return result.rows;
}
async function stateAt(client,revision) {
  return restoreNormalizedTree(await nodesAt(client,revision));
}
export async function readNormalizedState(pool,verifyPhysicalRecords=null) {
  const client=await pool.connect();
  let begun=false;
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    begun=true;
    const marker=await client.query('SELECT revision,source_sha256,state_sha256 FROM md_v3_runtime WHERE id=1');
    if(marker.rowCount!==1) throw Error('Normalized state was not verified and migrated');
    const {revision,source_sha256,state_sha256}=marker.rows[0];
    const version=asRevision(revision);
    const sourceTable=await client.query("SELECT to_regclass('metadrive_platform_state') AS name");
    if(sourceTable.rows[0]?.name) {
      const legacy=await client.query('SELECT payload FROM metadrive_platform_state WHERE id=1');
      if(legacy.rowCount!==1||stateDigest(legacy.rows[0].payload)!==source_sha256.trim())
        throw Error('Legacy data changed since normalized SQL snapshot; refusing stale cutover');
    }
    // Node storage revision is intentionally stable across delta commits.
    // The logical version in md_v3_runtime still advances on EVERY change.
    // This supports SQL-only databases created before the delta upgrade.
    const revisions=await client.query('SELECT DISTINCT revision FROM md_v3_state_nodes LIMIT 2');
    if(revisions.rowCount!==1) throw Error('Expected one verified normalized storage revision');
    const storageRevision=asRevision(revisions.rows[0].revision);
    const nodes=await nodesAt(client,storageRevision);
    const state=restoreNormalizedTree(nodes);
    const digest=stateDigest(state);
    if(digest!==state_sha256.trim()) throw Error('Normalized state checksum mismatch');
    // Physical SQL records must match the same repeatable-read snapshot as metadata.
    if(verifyPhysicalRecords) await verifyPhysicalRecords(client,state);
    await client.query('COMMIT');
    begun=false;
    return {state,version,digest,sourceDigest:source_sha256.trim(),storageRevision,nodes};
  } catch(error) {
    if(begun) await client.query('ROLLBACK');
    throw error;
  } finally {client.release();}
}
export async function writeNormalizedState(pool,nextState,previous,synchronizePhysicalRecords=null) {
  if(!previous||!Number.isSafeInteger(previous.version)||!previous.digest ||
     !Number.isSafeInteger(previous.storageRevision)||!Array.isArray(previous.nodes))
    throw Error('A verified normalized SQL snapshot with storage nodes is required');
  const {nodes,digest}=projectNormalizedTree(nextState);
  verifyNormalizedTree(nextState,nodes);
  if(digest===previous.digest) return {...previous};
  const delta=planNormalizedDelta(previous.nodes,nodes);
  // Validate the complete *logical* next snapshot before touching the database.
  if(stateDigest(restoreNormalizedTree(delta.nodes))!==digest)
    throw Error('Incremental normalized graph did not preserve next state');
  const client=await pool.connect();
  let begun=false;
  try {
    await client.query('BEGIN');
    begun=true;
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query("SET LOCAL statement_timeout='120s'");
    const result=await client.query('SELECT revision,state_sha256,source_sha256 FROM md_v3_runtime WHERE id=1 FOR UPDATE');
    if(result.rowCount!==1) throw Error('Missing normalized state revision');
    const marker=result.rows[0];
    if(asRevision(marker.revision)!==previous.version||marker.state_sha256.trim()!==previous.digest)
      throw Error('Concurrent writer detected; no state was overwritten');
    const revision=previous.version+1;
    const physical=previous.storageRevision;
    // Keep the unchanged ~20,000 nodes untouched. The marker row lock and one
    // transaction give every reader either the prior or the next verified graph.
    if(delta.deleted.length) {
      const removed=await client.query(
        'DELETE FROM md_v3_state_nodes WHERE revision=$1 AND node_id=ANY($2::bigint[])',
        [physical,delta.deleted.map(row=>row.nodeId)]);
      if(removed.rowCount!==delta.deleted.length) throw Error('SQL delta delete count mismatch');
    }
    for(const row of delta.updated) {
      const changed=await client.query(
        'UPDATE md_v3_state_nodes SET parent_id=$3,slot_key=$4,ordinal=$5,kind=$6,string_value=$7,number_value=$8,bool_value=$9 WHERE revision=$1 AND node_id=$2',
        [physical,row.nodeId,row.parentId,row.slotKey,row.ordinal,row.kind,row.stringValue,row.numberValue,row.boolValue]);
      if(changed.rowCount!==1) throw Error('SQL delta update count mismatch');
    }
    if(delta.inserted.length) await insertNodes(client,physical,delta.inserted);
    const touched=[...delta.updated,...delta.inserted];
    if(touched.length) {
      const check=await client.query(
        'SELECT node_id,parent_id,slot_key,ordinal,kind,string_value,number_value,bool_value FROM md_v3_state_nodes WHERE revision=$1 AND node_id=ANY($2::bigint[])',
        [physical,touched.map(row=>row.nodeId)]);
      verifyDeltaReadback(touched,check.rows);
    }
    // SQL physical business rows and graph updates remain in the same commit.
    if(synchronizePhysicalRecords) await synchronizePhysicalRecords(client,nextState,previous.state);
    await client.query('UPDATE md_v3_runtime SET revision=$1,state_sha256=$2,updated_at=now() WHERE id=1',
      [revision,digest]);
    await client.query('COMMIT');
    begun=false;
    return {state:nextState,version:revision,digest,sourceDigest:marker.source_sha256.trim(),
      storageRevision:physical,nodes:delta.nodes};
  } catch(error) {
    if(begun) await client.query('ROLLBACK');
    throw error;
  } finally {client.release();}
}
export async function initializeNormalizedState(client,sourceState) {
  const exists=await client.query('SELECT id FROM md_v3_runtime WHERE id=1');
  if(exists.rowCount) throw Error('Normalized SQL staging already exists; refusing overwrite');
  const {nodes,digest}=projectNormalizedTree(sourceState);
  verifyNormalizedTree(sourceState,nodes);
  await insertNodes(client,0,nodes);
  const restored=await stateAt(client,0);
  if(stateDigest(restored)!==digest) throw Error('Initial SQL state failed readback');
  await client.query('INSERT INTO md_v3_runtime(id,revision,source_sha256,state_sha256) VALUES (1,0,$1,$2)',[digest,digest]);
  return {digest,nodeCount:nodes.length};
}
