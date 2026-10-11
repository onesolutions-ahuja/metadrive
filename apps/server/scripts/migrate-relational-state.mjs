// Guarded MetaDrive migration to a distinct, empty staging PostgreSQL database.
// Default mode reads the source snapshot only. Never modifies the old state table.
import pg from 'pg';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { projectState, restoreState, verifyProjection } from '../src/relational-projection.mjs';
import { relationalTables, readRelationalRows } from '../src/relational-tables.mjs';

const args=process.argv.slice(2);
const apply=args.includes('--apply');
const backupIndex=args.indexOf('--backup-file');
const backupPath=backupIndex<0?null:args[backupIndex+1];
if(args.some((arg,i)=>arg!=='--apply'&&arg!=='--backup-file'&&i!==backupIndex+1)) throw Error('Supported flags: --apply --backup-file FILE');
if(backupIndex>=0&&(!backupPath||backupPath.startsWith('--'))) throw Error('--backup-file requires a filename');
const sourceUrl=process.env.SOURCE_DATABASE_URL??process.env.DATABASE_URL;
const targetUrl=process.env.TARGET_DATABASE_URL;
if(!sourceUrl) throw Error('SOURCE_DATABASE_URL or DATABASE_URL is required');
if(apply&&(!targetUrl||!backupPath||process.env.METADRIVE_MIGRATION_TARGET!=='staging'))
  throw Error('Apply requires METADRIVE_MIGRATION_TARGET=staging, TARGET_DATABASE_URL and --backup-file');
function parsed(url) {
  const u=new URL(url);
  if(!['postgres:','postgresql:'].includes(u.protocol)) throw Error('Expected PostgreSQL URL');
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert']) u.searchParams.delete(key);
  return u;
}
function location(url) {
  const u=parsed(url);
  return [u.hostname.toLowerCase(),u.port||'5432',decodeURIComponent(u.pathname)].join('|');
}
function client(url) {
  return new pg.Client({
    connectionString:parsed(url).toString(),
    ssl:process.env.PGSSLMODE==='disable'?false:{
      rejectUnauthorized:process.env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT!=='true',
      ...(process.env.METADRIVE_DB_CA_CERT?{ca:process.env.METADRIVE_DB_CA_CERT.replace(/\\n/g,'\n')}:{})
    },
    connectionTimeoutMillis:15000
  });
}
const source=client(sourceUrl);
let state;
await source.connect();
try {
  await source.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const r=await source.query('SELECT payload FROM metadrive_platform_state WHERE id=1');
  if(r.rowCount!==1) throw Error('Source platform state missing');
  state=r.rows[0].payload;
  await source.query('COMMIT');
} catch(error) {
  await source.query('ROLLBACK');
  throw error;
} finally { await source.end(); }

const rows=projectState(state);
const checked=verifyProjection(state,rows);
console.log(JSON.stringify({mode:apply?'staging-copy':'read-only-check',sha256:checked.digest,counts:checked.counts},null,2));
if(apply) {
  if(location(sourceUrl)===location(targetUrl)) throw Error('Refusing to write to source database');
  const backup=resolve(backupPath);
  mkdirSync(dirname(backup),{recursive:true,mode:0o700});
  const fd=openSync(backup,'wx',0o600);
  try { writeFileSync(fd,JSON.stringify(state)); } finally { closeSync(fd); }
  assert.deepStrictEqual(JSON.parse(readFileSync(backup,'utf8')),state);
  const target=client(targetUrl);
  await target.connect();
  let inTransaction=false;
  try {
    await target.query('BEGIN');
    inTransaction=true;
    await target.query("SET LOCAL lock_timeout='5s'");
    // Requires a fresh disposable target, never an existing app database.
    const occupied=await target.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_type='BASE TABLE' LIMIT 1");
    if(occupied.rowCount) throw Error('Target is not a fresh disposable database; refusing to overwrite any existing table');
    const sql=resolve(dirname(fileURLToPath(import.meta.url)),'../sql/relational-state-v1.sql');
    await target.query(readFileSync(sql,'utf8'));

    // All identifiers are fixed, code-owned names. Metadata is always a parameter.
    const tables=relationalTables;
    for(const [key,table,columnList,values] of tables) {
      const columns=columnList.split(',');
      const input=rows[key];
      const size=Math.min(200,Math.floor(60000/columns.length));
      for(let start=0;start<input.length;start+=size) {
        const slice=input.slice(start,start+size);
        const placeholders=slice.map((_,i)=>'('+columns.map((_,j)=>'$'+(i*columns.length+j+1)).join(',')+')').join(',');
        await target.query('INSERT INTO '+table+' ('+columnList+') VALUES '+placeholders,slice.flatMap(values));
      }
    }
    const actual=await readRelationalRows(target);
    // Round-trip verification occurs BEFORE commit, allowing a complete rollback.
    assert.deepStrictEqual(restoreState(actual),state);
    assert.equal(verifyProjection(state,actual).digest,checked.digest);
    await target.query('INSERT INTO metadrive_rel_migrations (revision,source_sha256) VALUES (1,$1)',[checked.digest]);
    await target.query('INSERT INTO metadrive_rel_runtime (id,version,state_sha256) VALUES (1,0,$1)',[checked.digest]);
    await target.query('COMMIT');
    inTransaction=false;
    console.log('Verified staging copy committed; MetaDrive runtime and source database unchanged.');
  } catch(error) {
    if(inTransaction) await target.query('ROLLBACK');
    throw error;
  } finally { await target.end(); }
}
