// Guarded MetaDrive migration to a distinct, empty staging PostgreSQL database.
// Default mode reads the source snapshot only. Never modifies the old state table.
import pg from 'pg';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { projectState, restoreState, verifyProjection } from '../src/relational-projection.mjs';

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
    const tables=[
      ['tenants','metadrive_rel_tenants','tenant_id',r=>[r.tenantId],r=>({tenantId:r.tenant_id})],
      ['objects','metadrive_rel_objects','tenant_id,object_api_name,position,payload',r=>[r.tenantId,r.apiName,r.position,JSON.stringify(r.payload)],r=>({tenantId:r.tenant_id,apiName:r.object_api_name,position:r.position,payload:r.payload})],
      ['collections','metadrive_rel_tenant_collections','tenant_id,collection_name',r=>[r.tenantId,r.key],r=>({tenantId:r.tenant_id,key:r.collection_name})],
      ['collectionItems','metadrive_rel_tenant_collection_items','tenant_id,collection_name,position,payload',r=>[r.tenantId,r.key,r.position,JSON.stringify(r.payload)],r=>({tenantId:r.tenant_id,key:r.collection_name,position:r.position,payload:r.payload})],
      ['settings','metadrive_rel_tenant_settings','tenant_id,setting_name,payload',r=>[r.tenantId,r.key,JSON.stringify(r.payload)],r=>({tenantId:r.tenant_id,key:r.setting_name,payload:r.payload})],
      ['recordBuckets','metadrive_rel_record_buckets','tenant_id,object_api_name,position',r=>[r.tenantId,r.objectApiName,r.position],r=>({tenantId:r.tenant_id,objectApiName:r.object_api_name,position:r.position})],
      ['records','metadrive_rel_records','tenant_id,object_api_name,record_id,position,payload',r=>[r.tenantId,r.objectApiName,r.id,r.position,JSON.stringify(r.payload)],r=>({tenantId:r.tenant_id,objectApiName:r.object_api_name,id:r.record_id,position:r.position,payload:r.payload})],
      ['users','metadrive_rel_users','position,user_id,tenant_id,name,email,password_salt,password_hash,role,permission_set_ids,permission_set_group_ids,disabled,created_at,extra',r=>[r.position,r.id,r.tenantId,r.name,r.email,r.passwordSalt,r.passwordHash,r.role,JSON.stringify(r.permissionSetIds),JSON.stringify(r.permissionSetGroupIds),r.disabled,r.createdAt,JSON.stringify(r.extra)],r=>({position:r.position,id:r.user_id,tenantId:r.tenant_id,name:r.name,email:r.email,passwordSalt:r.password_salt,passwordHash:r.password_hash,role:r.role,permissionSetIds:r.permission_set_ids,permissionSetGroupIds:r.permission_set_group_ids,disabled:r.disabled,createdAt:r.created_at,extra:r.extra})],
      ['sessions','metadrive_rel_refresh_sessions','position,token_hash,family_id,user_id,tenant_id,expires_at,used_at,revoked_at,extra',r=>[r.position,r.tokenHash,r.familyId,r.userId,r.tenantId,r.expiresAt,r.usedAt,r.revokedAt,JSON.stringify(r.extra)],r=>({position:r.position,tokenHash:r.token_hash,familyId:r.family_id,userId:r.user_id,tenantId:r.tenant_id,expiresAt:r.expires_at,usedAt:r.used_at,revokedAt:r.revoked_at,extra:r.extra})],
      ['revokedTokens','metadrive_rel_revoked_tokens','token_hash,expires_at',r=>[r.tokenHash,r.expiresAt],r=>({tokenHash:r.token_hash,expiresAt:r.expires_at})],
      ['components','metadrive_rel_library_components','position,payload',r=>[r.position,JSON.stringify(r.payload)],r=>({position:r.position,payload:r.payload})]
    ];
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
    const actual={};
    for(const [key,table,, ,parseRow] of tables) {
      const query=await target.query('SELECT * FROM '+table);
      actual[key]=query.rows.map(parseRow);
    }
    // Round-trip verification occurs BEFORE commit, allowing a complete rollback.
    assert.deepStrictEqual(restoreState(actual),state);
    assert.equal(verifyProjection(state,actual).digest,checked.digest);
    await target.query('INSERT INTO metadrive_rel_migrations (revision,source_sha256) VALUES (1,$1)',[checked.digest]);
    await target.query('COMMIT');
    inTransaction=false;
    console.log('Verified staging copy committed; MetaDrive runtime and source database unchanged.');
  } catch(error) {
    if(inTransaction) await target.query('ROLLBACK');
    throw error;
  } finally { await target.end(); }
}
