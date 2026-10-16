// Runtime PostgreSQL persistence for MetaDrive's metadata-driven objects.
// Enabled ONLY by METADRIVE_PERSISTENCE_MODE=relational after staging conversion.
// No dynamic metadata name is ever interpolated as a SQL identifier.
import { projectState, restoreState, stateDigest, verifyProjection } from './relational-projection.mjs';
import { relationalTables, keyFor, readRelationalRows } from './relational-tables.mjs';

const primaryColumns={
  tenants:['tenant_id'], objects:['tenant_id','object_api_name'],
  collections:['tenant_id','collection_name'],
  collectionItems:['tenant_id','collection_name','position'],
  settings:['tenant_id','setting_name'],recordBuckets:['tenant_id','object_api_name'],
  records:['tenant_id','object_api_name','record_id'],users:['user_id'],
  sessions:['token_hash'],revokedTokens:['token_hash'],components:['position'],
  platformSettings:['setting_name']
};
const signature=(key,row)=>JSON.stringify(keyFor[key](row));
const equivalent=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function delta(key,before,after) {
  const prev=new Map(before.map(row=>[signature(key,row),row]));
  const next=new Map(after.map(row=>[signature(key,row),row]));
  if(prev.size!==before.length||next.size!==after.length)
    throw Error('Duplicate relational row identity in '+key);
  const removes=[],inserts=[];
  for(const [id,old] of prev) {
    const current=next.get(id);
    if(!current||!equivalent(old,current)) removes.push(old);
  }
  for(const [id,current] of next) {
    const old=prev.get(id);
    if(!old||!equivalent(old,current)) inserts.push(current);
  }
  return {removes,inserts};
}
function buildDeltas(before,after) {
  const output={};
  for(const key of Object.keys(primaryColumns)) output[key]=delta(key,before[key],after[key]);
  // FK dependency: deleting/moving an existing record bucket requires deleting
  // its child records first, including children whose JSON itself did not change.
  const deletedBuckets=output.recordBuckets.removes;
  if(deletedBuckets.length) {
    const affected=new Set(deletedBuckets.map(row=>JSON.stringify([row.tenantId,row.objectApiName])));
    const previous=new Set(output.records.removes.map(row=>signature('records',row)));
    const later=new Set(output.records.inserts.map(row=>signature('records',row)));
    for(const record of before.records) {
      if(!affected.has(JSON.stringify([record.tenantId,record.objectApiName]))) continue;
      const id=signature('records',record);
      if(!previous.has(id)) {output.records.removes.push(record);previous.add(id);}
    }
    for(const record of after.records) {
      if(!affected.has(JSON.stringify([record.tenantId,record.objectApiName]))) continue;
      const id=signature('records',record);
      if(!later.has(id)) {output.records.inserts.push(record);later.add(id);}
    }
  }
  return output;
}
function snapshotRevision(row) {
  const version=Number(row.version);
  if(!Number.isSafeInteger(version)||version<0) throw Error('Invalid MetaDrive relational revision');
  if(!/^[0-9a-f]{64}$/.test(String(row.state_sha256).trim()))
    throw Error('Invalid MetaDrive relational checksum');
  return {version,digest:String(row.state_sha256).trim()};
}
export async function readRelationalState(pool) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const marker=await client.query('SELECT version,state_sha256 FROM metadrive_rel_runtime WHERE id=1');
    const migration=await client.query('SELECT revision,source_sha256 FROM metadrive_rel_migrations WHERE revision=1');
    if(marker.rowCount!==1||migration.rowCount!==1)
      throw Error('Relational store has no verified migration marker; refuse to seed or fall back');
    const {version,digest}=snapshotRevision(marker.rows[0]);
    // For an in-place Aiven migration, legacy JSONB remains as the immutable
    // rollback baseline. Reject a cutover if it changed after SQL backfill.
    const legacyTable=await client.query("SELECT to_regclass('metadrive_platform_state') AS name");
    if(legacyTable.rows[0]?.name) {
      const legacy=await client.query('SELECT payload FROM metadrive_platform_state WHERE id=1');
      if(legacy.rowCount!==1||stateDigest(legacy.rows[0].payload)!==String(migration.rows[0].source_sha256).trim())
        throw Error('Legacy state changed after relational migration; refusing stale cutover');
    }
    const rows=await readRelationalRows(client);
    const state=restoreState(rows);
    verifyProjection(state,rows);
    if(stateDigest(state)!==digest) throw Error('Relational state checksum mismatch; refusing to start');
    await client.query('COMMIT');
    return {state,rows,version,digest};
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {client.release();}
}

export async function writeRelationalState(pool,nextState,previous,beforeCommit=null) {
  if(!previous||!Number.isSafeInteger(previous.version)||!previous.rows)
    throw Error('Relational runtime requires a verified prior snapshot');
  const nextRows=projectState(nextState);
  const {digest}=verifyProjection(nextState,nextRows);
  if(digest===previous.digest) return {...previous};
  const changes=buildDeltas(previous.rows,nextRows);
  const client=await pool.connect();
  let begun=false;
  try {
    await client.query('BEGIN');
    begun=true;
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query("SET LOCAL statement_timeout='120s'");
    const marker=await client.query('SELECT version,state_sha256 FROM metadrive_rel_runtime WHERE id=1 FOR UPDATE');
    if(marker.rowCount!==1) throw Error('Missing relational runtime marker');
    const current=snapshotRevision(marker.rows[0]);
    if(current.version!==previous.version||current.digest!==previous.digest)
      throw Error('Concurrent MetaDrive writer detected; refusing to overwrite newer database state');

    // Children first for deletes, parents first for inserts. Unique row
    // positions remain conflict-free because all changed prior rows are deleted.
    for(const [key,table] of [...relationalTables].reverse()) {
      const keys=primaryColumns[key];
      for(const row of changes[key].removes) {
        const values=keyFor[key](row);
        const where=keys.map((col,i)=>col+'=$'+(i+1)).join(' AND ');
        await client.query('DELETE FROM '+table+' WHERE '+where,values);
      }
    }
    for(const [key,table,columnList,toValues] of relationalTables) {
      const columns=columnList.split(',');
      const incoming=changes[key].inserts;
      const batchSize=Math.min(150,Math.floor(60000/columns.length));
      for(let i=0;i<incoming.length;i+=batchSize) {
        const batch=incoming.slice(i,i+batchSize);
        const placeholders=batch.map((_,position)=>'('+columns.map((_,c)=>'$'+(position*columns.length+c+1)).join(',')+')').join(',');
        await client.query('INSERT INTO '+table+' ('+columnList+') VALUES '+placeholders,batch.flatMap(toValues));
      }
    }
    // The digest and revision update is atomic with all record/metadata writes.
    await client.query('UPDATE metadrive_rel_runtime SET version=version+1,state_sha256=$1,updated_at=now() WHERE id=1',[digest]);
    if(process.env.METADRIVE_REL_VERIFY_WRITES==='true') {
      const checkRows=await readRelationalRows(client);
      const restored=restoreState(checkRows);
      if(stateDigest(restored)!==digest) throw Error('Relational write readback digest mismatch');
    }
    if(beforeCommit) await beforeCommit(client,nextState);
    await client.query('COMMIT');
    begun=false;
    return {rows:nextRows,version:previous.version+1,digest,state:nextState};
  } catch(error) {
    if(begun) await client.query('ROLLBACK');
    throw error;
  } finally {client.release();}
}
