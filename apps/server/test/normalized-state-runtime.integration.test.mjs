// Local PostgreSQL 18 only: tests transactional parity, concurrency, rollback and no JSONB.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {initializeNormalizedState,readNormalizedState,writeNormalizedState} from '../src/normalized-state-runtime.mjs';
const base=process.env.METADRIVE_TEST_DATABASE_URL;
test('SQL-only normalized metadata runtime preserves active Flow, credentials, RBAC, record values and atomic revisions',{
  skip:!base, timeout:120000
},async()=>{
  const u=new URL(base);
  assert.ok(['localhost','127.0.0.1','::1'].includes(u.hostname));
  assert.equal(u.pathname,'/postgres');
  const database='md_v3_'+randomBytes(6).toString('hex'),target=new URL(base);
  target.pathname='/'+database;
  const admin=new pg.Client({connectionString:base,ssl:false});
  const dir=mkdtempSync(join(tmpdir(),'metadrive-normalized-rollback-'));
  const protectedBackup=join(dir,'backup.json');
  await admin.connect();
  try {
    await admin.query('CREATE DATABASE '+database);
    const pool=new pg.Pool({connectionString:target.toString(),ssl:false,max:4});
    try {
      const state={
        tenants:{une:{
          objects:[{apiName:'Product__c',fields:[{apiName:'Amount__c',dataType:'Currency(18, 2)'}]}],
          records:{Product__c:[{Id:'r1',Amount__c:15.5}]},
          flows:[{apiName:'Appointment',activeVersion:21,versions:[{versionNumber:20,status:'Inactive'},{versionNumber:21,status:'Active',elements:[{type:'HTTP_REQUEST',config:{credential:'WHATSAPP'}}]}]}],
          namedCredentials:[{apiName:'WHATSAPP',secret:'encrypted-value'}],
          pages:[{apiName:'Home',properties:{dockVisible:true}}],
          accessControl:{roles:[{id:'staff',grants:[]}]}
        }},
        libraryComponents:[],users:[{id:'user1',disabled:false}],refreshSessions:[],revokedAccessTokens:{}
      };
      await pool.query('CREATE TABLE metadrive_platform_state(id SMALLINT PRIMARY KEY,payload JSONB NOT NULL,updated_at TIMESTAMPTZ DEFAULT now())');
      await pool.query('INSERT INTO metadrive_platform_state(id,payload) VALUES (1,$1::jsonb)',[JSON.stringify(state)]);
      await pool.query(await readFile(new URL('../sql/normalized-state-v3.sql',import.meta.url),'utf8'));
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        const first=await initializeNormalizedState(client,state);
        assert.ok(first.nodeCount>50);
        await client.query('COMMIT');
      } finally {client.release();}
      const before=await readNormalizedState(pool);
      assert.equal(before.version,0);
      assert.deepEqual(before.state,state);
      const edited=structuredClone(state);
      edited.tenants.une.records.Product__c[0].Amount__c=19.75;
      edited.tenants.une.flows[0].versions[1].elements[0].config.credential='WHATSAPP_V2';
      edited.tenants.une.accessControl.roles[0].grants.push('read');
      const saved=await writeNormalizedState(pool,edited,before);
      assert.equal(saved.version,1);
      assert.deepEqual((await readNormalizedState(pool)).state,edited);
      await assert.rejects(writeNormalizedState(pool,{...edited,users:[]},before),/Concurrent writer/);
      assert.deepEqual((await readNormalizedState(pool)).state,edited,'Rejected conflicting write must not modify committed SQL state');
      const legacy=await pool.query('SELECT payload FROM metadrive_platform_state WHERE id=1');
      assert.deepEqual(legacy.rows[0].payload,state,'Existing backup must remain unchanged');
      const jsonCols=await pool.query(
        "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'md_v3_%' AND data_type IN ('json','jsonb')");
      assert.equal(jsonCols.rowCount,0,'New normalized tables must not use JSON/JSONB');
      // Exercise the exact guarded rollback path with post-cutover record and Flow changes.
      const data=JSON.stringify(state);
      writeFileSync(protectedBackup,data,{mode:0o600});
      const sha=createHash('sha256').update(data).digest('hex');
      const path=resolve(fileURLToPath(new URL('../scripts/restore-normalized-to-legacy.mjs',import.meta.url)));
      const env={...process.env,DATABASE_URL:target.toString(),PGSSLMODE:'disable',
        METADRIVE_PERSISTENCE_MODE:'normalized',
        METADRIVE_VERIFIED_BACKUP_FILE:protectedBackup,METADRIVE_VERIFIED_BACKUP_SHA256:sha,
        METADRIVE_CONFIRMED_OFFLINE:'true',METADRIVE_ROLLBACK_CONFIRMED:'true',
        METADRIVE_BACKUP_VERIFIED_RESTORE:'true'};
      const rollback=(args=[],overrides={})=>spawnSync(process.execPath,[path,...args],{
        encoding:'utf8',timeout:25000,env:{...env,...overrides}});
      assert.equal(rollback().status,0,'Rollback preflight failed');
      assert.notEqual(rollback(['--apply'],{METADRIVE_CONFIRMED_OFFLINE:'false'}).status,0);
      assert.notEqual(rollback(['--apply'],{METADRIVE_VERIFIED_BACKUP_SHA256:'0'.repeat(64)}).status,0);
      const applied=rollback(['--apply']);
      assert.equal(applied.status,0,applied.stderr?.slice(-1000));
      const recovered=await pool.query('SELECT payload FROM metadrive_platform_state WHERE id=1');
      assert.deepEqual(recovered.rows[0].payload,edited,'Rollback must retain new records, Flow changes and permissions');

      await assert.rejects(readNormalizedState(pool),/Legacy data changed/,'Normalized store must reject legacy mode after rollback');
    } finally {await pool.end();}
  } finally {
    await admin.query('DROP DATABASE IF EXISTS '+database);
    await admin.end();
    rmSync(dir,{recursive:true,force:true});
  }
});
