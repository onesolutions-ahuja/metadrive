// Transactional, fully typed (no JSONB) SQL state codec.
// This module is intentionally NOT connected to the production persistence selector
// until Flow, credential, row-based record and rollback parity are verified.
import {projectNormalizedTree,restoreNormalizedTree,verifyNormalizedTree} from './normalized-state-tree.mjs';
import {stateDigest} from './relational-projection.mjs';
import {planNormalizedDelta,verifyDeltaReadback,verifyProjectedDelta,primeNormalizedDeltaIndex} from './normalized-state-delta.mjs';

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
    primeNormalizedDeltaIndex(nodes);
    return {state,version,digest,sourceDigest:source_sha256.trim(),storageRevision,nodes};
  } catch(error) {
    if(begun) await client.query('ROLLBACK');
    throw error;
  } finally {client.release();}
}
export async function writeNormalizedState(pool,nextState,previous,synchronizePhysicalRecords=null,alreadyNormalized=false,beforeCommit=null) {
  if(!previous||!Number.isSafeInteger(previous.version)||!previous.digest ||
     !Number.isSafeInteger(previous.storageRevision)||!Array.isArray(previous.nodes))
    throw Error('A verified normalized SQL snapshot with storage nodes is required');
  const writeStartedAt=performance.now();
  const {nodes,digest}=projectNormalizedTree(nextState,alreadyNormalized);
  const projectedAt=performance.now();
  if(digest===previous.digest) return {...previous};
  const delta=planNormalizedDelta(previous.nodes,nodes);
  // Verify the remapped tree against every source node without a second
  // whole-platform JSON restore, sort and SHA256. The canonical digest above,
  // transactional SQL readback and verified startup checksum remain intact.
  verifyProjectedDelta(nodes,delta.nodes);

  const preparedAt=performance.now();
  const touched=[...delta.updated,...delta.inserted];
  const client=await pool.connect();
  const connectedAt=performance.now();
  let begun=false;
  try {
    await client.query("BEGIN; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'");
    begun=true;
    // A single parameterized statement atomically checks the logical revision,
    // updates the changed SQL nodes and returns the actual affected rows. Avoid
    // 5-7 high-latency Render -> Aiven query roundtrips per token refresh.
    // A failed compare-and-swap never touches any nodes or releases a session.
    const sql=`
      WITH guarded AS (
        UPDATE md_v3_runtime
           SET revision=revision+1,state_sha256=$3,updated_at=now()
         WHERE id=1 AND revision=$1 AND state_sha256=$2
        RETURNING source_sha256
      ), removed AS (
        DELETE FROM md_v3_state_nodes
         WHERE revision=$4 AND node_id=ANY($5::bigint[])
           AND EXISTS(SELECT 1 FROM guarded)
        RETURNING node_id
      ), applied AS (
        INSERT INTO md_v3_state_nodes
          (revision,node_id,parent_id,slot_key,ordinal,kind,string_value,number_value,bool_value)
        SELECT $4, incoming.node_id,incoming.parent_id,incoming.slot_key,
               incoming.ordinal,incoming.kind,incoming.string_value,
               incoming.number_value,incoming.bool_value
          FROM unnest($6::bigint[],$7::bigint[],$8::text[],$9::integer[],
                      $10::text[],$11::text[],$12::double precision[],$13::boolean[])
            AS incoming(node_id,parent_id,slot_key,ordinal,kind,string_value,number_value,bool_value)
          JOIN guarded ON true
        ON CONFLICT (revision,node_id) DO UPDATE
          SET parent_id=EXCLUDED.parent_id,slot_key=EXCLUDED.slot_key,
              ordinal=EXCLUDED.ordinal,kind=EXCLUDED.kind,
              string_value=EXCLUDED.string_value,
              number_value=EXCLUDED.number_value,bool_value=EXCLUDED.bool_value
        RETURNING node_id,parent_id,slot_key,ordinal,kind,string_value,number_value,bool_value
      )
      SELECT false AS summary,node_id,parent_id,slot_key,ordinal,kind,
             string_value,number_value,bool_value,
             NULL::integer AS guarded_rows,NULL::integer AS removed_rows,
             NULL::text AS source_digest
        FROM applied
      UNION ALL
      SELECT true,NULL::bigint,NULL::bigint,NULL::text,NULL::integer,NULL::text,
             NULL::text,NULL::double precision,NULL::boolean,
             (SELECT count(*)::integer FROM guarded),
             (SELECT count(*)::integer FROM removed),
             (SELECT source_sha256::text FROM guarded)
    `;
    const fields=[
      row=>row.nodeId,row=>row.parentId,row=>row.slotKey,row=>row.ordinal,
      row=>row.kind,row=>row.stringValue,row=>row.numberValue,row=>row.boolValue
    ];
    const sqlStartedAt=performance.now();
    const results=await client.query(sql,[
      previous.version,previous.digest,digest,previous.storageRevision,
      delta.deleted.map(row=>row.nodeId),...fields.map(select=>touched.map(select))
    ]);
    const sqlFinishedAt=performance.now();
    const summary=results.rows.find(row=>row.summary===true);
    if(!summary||summary.guarded_rows!==1)
      throw Error('Concurrent writer detected; no state was overwritten');
    if(summary.removed_rows!==delta.deleted.length)
      throw Error('SQL delta delete count mismatch');
    verifyDeltaReadback(touched,results.rows.filter(row=>row.summary===false));
    // Physical CRUD remains in the same transaction, never asynchronously
    // deferred. The caller cannot receive a token before durable COMMIT.
    const verificationFinishedAt=performance.now();
    if(synchronizePhysicalRecords)
      await synchronizePhysicalRecords(client,nextState,previous.state);
    const physicalSyncFinishedAt=performance.now();
    if(beforeCommit) await beforeCommit(client,nextState);
    await client.query('COMMIT');
    const commitFinishedAt=performance.now();
    if(commitFinishedAt-writeStartedAt>500) console.info(`SQL state commit phases: projection=${(projectedAt-writeStartedAt).toFixed(1)}ms delta-verify=${(preparedAt-projectedAt).toFixed(1)}ms pool-connect=${(connectedAt-preparedAt).toFixed(1)}ms begin=${(sqlStartedAt-connectedAt).toFixed(1)}ms sql=${(sqlFinishedAt-sqlStartedAt).toFixed(1)}ms readback=${(verificationFinishedAt-sqlFinishedAt).toFixed(1)}ms typed-sync=${(physicalSyncFinishedAt-verificationFinishedAt).toFixed(1)}ms commit=${(commitFinishedAt-physicalSyncFinishedAt).toFixed(1)}ms total=${(commitFinishedAt-writeStartedAt).toFixed(1)}ms changed=${touched.length} removed=${delta.deleted.length}`);
    begun=false;
    return {state:nextState,version:previous.version+1,digest,
      sourceDigest:summary.source_digest.trim(),
      storageRevision:previous.storageRevision,nodes:delta.nodes};
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
