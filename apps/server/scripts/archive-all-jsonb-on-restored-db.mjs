// ZERO-PRODUCTION-WRITES proof. Convert ALL PostgreSQL JSON/JSONB table rows to
// typed scalar nodes on a disposable local restore; reject any lossy conversion.
// This is not a runtime activation or production cutover utility.
import { createHash } from 'node:crypto';
import pg from 'pg';
import { projectNormalizedTree, restoreNormalizedTree } from '../src/normalized-state-tree.mjs';
import { readNormalizedState } from '../src/normalized-state-runtime.mjs';

if (process.argv.length !== 3 || process.argv[2] !== '--apply')
  throw Error('Only --apply on a disposable local PostgreSQL 18 restore is supported');
const raw = process.env.DATABASE_URL;
if (!raw) throw Error('Restored DATABASE_URL is required');
const target = new URL(raw);
if (!['localhost','127.0.0.1','::1'].includes(target.hostname) ||
    target.pathname !== '/metadrive_restored' || process.env.PGSSLMODE !== 'disable')
  throw Error('Refusing non-local or non-isolated database; production writes prohibited');
const pool = new pg.Pool({connectionString:target.toString(),ssl:false,max:2});
const cleanTable = (name) => {
  if (!/^metadrive_[a-z][a-z0-9_]*$/.test(name)) throw Error('Unexpected JSONB table name');
  return '"' + name + '"';
};
const cleanColumn = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw Error('Unexpected JSONB column name');
  return '"' + name + '"';
};
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const c = await pool.connect();
let started = false;
try {
  // Do not archive/drop the legacy baseline before *both* SQL shadow models exist.
  const shadow = await c.query("SELECT to_regclass('md_v2_shadow_run') AS records, to_regclass('md_v3_runtime') AS state");
  if (!shadow.rows[0]?.records || !shadow.rows[0]?.state)
    throw Error('Typed SQL records or normalized state verification missing');
  const live = await c.query('SELECT count(*)::int AS n FROM md_v2_shadow_run');
  const tree = await c.query('SELECT count(*)::int AS n FROM md_v3_runtime');
  if (live.rows[0].n !== 1 || tree.rows[0].n !== 1) throw Error('SQL source markers missing');
  await c.query('BEGIN');
  started = true;
  await c.query("SET LOCAL statement_timeout='120000'");
  const existing = await c.query("SELECT to_regclass('md_v4_archive_sources') AS archived");
  if (existing.rows[0]?.archived) throw Error('Archive already exists; never overwrite an earlier proof');

  // Metadata inventory is fetched from PostgreSQL. No business table or field API
  // name is interpolated into SQL from a customer record.
  const inventory = await c.query(`SELECT table_schema,table_name,column_name
    FROM information_schema.columns WHERE data_type IN ('json','jsonb')
    ORDER BY table_schema,table_name,column_name`);
  if (!inventory.rowCount) throw Error('No JSONB remains to archive; refusing unverified rerun');
  if (inventory.rows.some(x=>x.table_schema!=='public' || !x.table_name.startsWith('metadrive_')))
    throw Error('Unrecognized JSON column outside MetaDrive; refuse partial conversion');
  const names = [...new Set(inventory.rows.map(x=>x.table_name))];

  await c.query(`CREATE TABLE md_v4_archive_sources (
    source_table TEXT PRIMARY KEY,
    record_count INTEGER NOT NULL CHECK(record_count>=0),
    original_columns INTEGER NOT NULL CHECK(original_columns>0),
    json_columns INTEGER NOT NULL CHECK(json_columns>0),
    archived_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await c.query(`CREATE TABLE md_v4_archive_columns (
    source_table TEXT NOT NULL REFERENCES md_v4_archive_sources(source_table),
    position INTEGER NOT NULL CHECK(position>0),
    column_name TEXT NOT NULL,
    sql_type TEXT NOT NULL,
    was_nullable BOOLEAN NOT NULL,
    PRIMARY KEY(source_table,position),
    UNIQUE(source_table,column_name))`);
  await c.query(`CREATE TABLE md_v4_archive_rows (
    source_table TEXT NOT NULL REFERENCES md_v4_archive_sources(source_table),
    row_ordinal INTEGER NOT NULL CHECK(row_ordinal>=0),
    node_count INTEGER NOT NULL CHECK(node_count>0),
    original_sha256 CHAR(64) NOT NULL,
    PRIMARY KEY(source_table,row_ordinal))`);
  await c.query(`CREATE TABLE md_v4_archive_nodes (
    source_table TEXT NOT NULL,
    row_ordinal INTEGER NOT NULL,
    node_id BIGINT NOT NULL CHECK(node_id>0),
    parent_id BIGINT,
    slot_key TEXT,
    ordinal INTEGER NOT NULL CHECK(ordinal>=0),
    kind TEXT NOT NULL CHECK(kind IN ('object','array','null','string','number','boolean')),
    string_value TEXT,
    number_text TEXT,
    bool_value BOOLEAN,
    PRIMARY KEY(source_table,row_ordinal,node_id),
    FOREIGN KEY(source_table,row_ordinal) REFERENCES md_v4_archive_rows(source_table,row_ordinal),
    FOREIGN KEY(source_table,row_ordinal,parent_id)
      REFERENCES md_v4_archive_nodes(source_table,row_ordinal,node_id)
      DEFERRABLE INITIALLY DEFERRED,
    CHECK(
      (kind='string' AND string_value IS NOT NULL AND number_text IS NULL AND bool_value IS NULL)
      OR (kind='number' AND string_value IS NULL AND number_text IS NOT NULL AND bool_value IS NULL)
      OR (kind='boolean' AND string_value IS NULL AND number_text IS NULL AND bool_value IS NOT NULL)
      OR (kind IN ('object','array','null') AND string_value IS NULL AND number_text IS NULL AND bool_value IS NULL)
    ))`);
  await c.query('CREATE INDEX md_v4_archive_nodes_parent_idx ON md_v4_archive_nodes(source_table,row_ordinal,parent_id,ordinal)');
  let totalRows = 0, totalNodes = 0;
  for (const table of names) {
    const qname = cleanTable(table);
    const specs = await c.query(`SELECT ordinal_position,column_name,udt_name,is_nullable,
      format_type((SELECT oid FROM pg_type WHERE typname=udt_name LIMIT 1),NULL) AS native_type
      FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,[table]);
    const jsonCols = inventory.rows.filter(x=>x.table_name===table);
    // to_jsonb(row) keeps the full original SQL row, including primary keys and
    // non-JSON columns. Rehydration never relies on mutable PostgreSQL ctid.
    const originals = await c.query('SELECT to_jsonb(t)::text AS document FROM public.'+qname+' AS t ORDER BY ctid');
    await c.query('INSERT INTO md_v4_archive_sources(source_table,record_count,original_columns,json_columns) VALUES($1,$2,$3,$4)',
      [table,originals.rowCount,specs.rowCount,jsonCols.length]);
    for (const spec of specs.rows) await c.query(`INSERT INTO md_v4_archive_columns
      (source_table,position,column_name,sql_type,was_nullable) VALUES($1,$2,$3,$4,$5)`,
      [table,spec.ordinal_position,spec.column_name,spec.udt_name,spec.is_nullable==='YES']);
    for (let rowIndex=0;rowIndex<originals.rows.length;rowIndex++) {
      const sourceText=originals.rows[rowIndex].document;
      const source=JSON.parse(sourceText);
      const {nodes}=projectNormalizedTree(source);
      await c.query('INSERT INTO md_v4_archive_rows(source_table,row_ordinal,node_count,original_sha256) VALUES($1,$2,$3,$4)',
        [table,rowIndex,nodes.length,fingerprint(source)]);
      const width=10, chunk=160;
      for (let start=0;start<nodes.length;start+=chunk) {
        const subset=nodes.slice(start,start+chunk);
        const markers=subset.map((_,i)=>'('+Array.from({length:width},(_,j)=>'$'+(i*width+j+1)).join(',')+')').join(',');
        const values=subset.flatMap(n=>[table,rowIndex,n.nodeId,n.parentId,n.slotKey,n.ordinal,n.kind,
          n.stringValue,n.kind==='number'?String(n.numberValue):null,n.boolValue]);
        await c.query(`INSERT INTO md_v4_archive_nodes
          (source_table,row_ordinal,node_id,parent_id,slot_key,ordinal,kind,string_value,number_text,bool_value)
          VALUES `+markers,values);
      }
      const saved=await c.query('SELECT node_id,parent_id,slot_key,ordinal,kind,string_value,number_text,bool_value FROM md_v4_archive_nodes WHERE source_table=$1 AND row_ordinal=$2 ORDER BY node_id',
        [table,rowIndex]);
      if (saved.rowCount!==nodes.length) throw Error('Lost nodes in SQL archive for '+table);
      const recovered=restoreNormalizedTree(saved.rows.map(n=>({
        ...n,numberValue:n.number_text===null?null:Number(n.number_text),stringValue:n.string_value,boolValue:n.bool_value
      })));
      if (fingerprint(recovered)!==fingerprint(source)) throw Error('Archive row checksum mismatch for '+table);
      // SQL comparison catches JSON numeric precision or timestamp changes which
      // JavaScript-only checksum comparisons could miss.
      const exact=await c.query('SELECT $1::jsonb = $2::jsonb AS equivalent',
        [sourceText,JSON.stringify(recovered)]);
      if (exact.rows[0]?.equivalent!==true) throw Error('SQL semantic readback differs: '+table);
      totalNodes+=saved.rowCount;
    }
    totalRows+=originals.rowCount;
  }

  // Strictly on a disposable RESTORE: prove the final no-JSONB schema is possible.
  // Every removed JSONB value is already independently read back from typed rows.
  for (const item of inventory.rows) await c.query('ALTER TABLE public.'+cleanTable(item.table_name)+
    ' DROP COLUMN '+cleanColumn(item.column_name));
  // The legacy table must be removed rather than left as an empty name: normalized
  // state runtime checks its existence to detect stale/competing writers.
  await c.query('DROP TABLE public.metadrive_platform_state');
  const leftovers=await c.query("SELECT table_schema,table_name,column_name FROM information_schema.columns WHERE data_type IN ('json','jsonb')");
  if (leftovers.rowCount) throw Error('Final schema still contains JSON/JSONB columns');
  await c.query('COMMIT');started=false;
  const normalized=await readNormalizedState(pool);
  if (!normalized?.state?.tenants || !normalized?.digest) throw Error('SQL-only runtime readback failed');
  console.log(JSON.stringify({isolatedRestoreOnly:true,archivedTables:names.length,
    archivedColumns:inventory.rowCount,archivedRows:totalRows,archivedNodes:totalNodes,
    remainingJsonColumns:0,normalizedRuntimeReadable:true,
    businessRecordCount:Number((await pool.query('SELECT record_count FROM md_v2_shadow_run WHERE id=1')).rows[0].record_count)}));
} catch (error) {
  if(started) await c.query('ROLLBACK');
  console.error('SQL-only archive conversion aborted; original backup remains unchanged:',
    error instanceof Error?error.message:'UnknownError');
  process.exitCode=1;
} finally {
  c.release();
  await pool.end();
}
