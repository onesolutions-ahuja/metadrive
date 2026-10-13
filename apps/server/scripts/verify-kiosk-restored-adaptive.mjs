// MD-09 — verify restored Aiven snapshot, then create a disposable relational
// compatibility fixture for the kiosk installer. All writes are LOCAL only.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { readNormalizedState } from '../src/normalized-state-runtime.mjs';
import { verifyTypedRecords } from '../src/normalized-typed-records.mjs';
import { projectState, verifyProjection } from '../src/relational-projection.mjs';
import { insertProjectedRows, verifyRelationalCopy } from '../src/relational-copy.mjs';

const sourceUrl = new URL(process.env.KIOSK_RESTORED_SOURCE_DATABASE_URL ?? '');
const targetUrl = new URL(process.env.KIOSK_FIXTURE_DATABASE_URL ?? '');
const valid = url => url.hostname === '127.0.0.1' || url.hostname === 'localhost';
if (!valid(sourceUrl) || !valid(targetUrl) || sourceUrl.pathname === targetUrl.pathname
    || !sourceUrl.pathname.includes('validation') || !targetUrl.pathname.includes('validation')) {
  throw Error('Only two distinct disposable local validation databases are permitted');
}
const source = new pg.Pool({ connectionString:sourceUrl.toString(), ssl:false });
const target = new pg.Pool({ connectionString:targetUrl.toString(), ssl:false });
let client;
try {
  // Auto-detect source schema. If normalized typed SQL is present, verify
  // physical records; otherwise validate the restored legacy snapshot.
  // A partial relational marker never implies production cutover readiness.
  const fmt = await source.query("SELECT to_regclass('public.md_v3_runtime') AS normalized, to_regclass('public.metadrive_platform_state') AS legacy");
  const snapshot = fmt.rows[0]?.normalized ? await readNormalizedState(source,verifyTypedRecords)
    : fmt.rows[0]?.legacy ? {state:(await source.query('SELECT payload FROM metadrive_platform_state WHERE id=1')).rows[0]?.payload}
    : null;
  if (!snapshot?.state) throw Error('Restored database has no usable SQL snapshot');
  const rows = projectState(snapshot.state);
  const proof = verifyProjection(snapshot.state,rows);
  client = await target.connect();
  await client.query('BEGIN');
  const occupied = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' LIMIT 1");
  if (occupied.rowCount) throw Error('Disposable relational target was not empty');
  await client.query(readFileSync('apps/server/sql/relational-state-v1.sql','utf8'));
  await insertProjectedRows(client,rows);
  await verifyRelationalCopy(client,snapshot.state,rows);
  await client.query('INSERT INTO metadrive_rel_migrations (revision,source_sha256) VALUES (1,$1)',[proof.digest]);
  await client.query('INSERT INTO metadrive_rel_runtime (id,version,state_sha256) VALUES (1,0,$1)',[proof.digest]);
  await client.query('COMMIT');
  console.log('Validated restored snapshot and prepared disposable relational kiosk installer fixture; production cutover is not certified.');
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(()=>undefined);
  throw error;
} finally {
  client?.release();
  await Promise.all([source.end(),target.end()]);
}
