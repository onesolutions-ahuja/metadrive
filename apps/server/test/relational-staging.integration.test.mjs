// PostgreSQL integration test runs only against a disposable local service.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stateDigest } from '../src/relational-projection.mjs';

const base=process.env.METADRIVE_TEST_DATABASE_URL;
test('migrate a real PostgreSQL snapshot into independent staging and reject repeat writes',{skip:!base},async()=>{
  const url=new URL(base);
  assert.ok(['localhost','127.0.0.1','::1'].includes(url.hostname),'Never run this test on a remote database');
  assert.equal(url.pathname,'/postgres','Must start from local test administrator database');
  const pg=(await import('pg')).default;
  const client=u=>new pg.Client({connectionString:u,ssl:false});
  const dbUrl=name=>{const u=new URL(base);u.pathname='/'+name;return u.toString();};
  const suffix=randomBytes(6).toString('hex');
  const src='mrel_src_'+suffix, dst='mrel_dst_'+suffix;
  const root=client(base);
  await root.connect();
  const temp=mkdtempSync(join(tmpdir(),'metadrive-relational-'));
  try {
    await root.query('CREATE DATABASE '+src);
    await root.query('CREATE DATABASE '+dst);
    const state={
      tenants:{
        alpha:{
          objects:[{apiName:'Custom__c',fields:[{apiName:'Status__c',dataType:'Picklist'},{apiName:'Parent__c',relationship:{targetObject:'Custom__c'}}]}],
          records:{Custom__c:[{Id:'one',Status__c:'Open',Parent__c:null}],Empty__c:[]},
          flows:[{apiName:'FollowUp',elements:[{config:{objectApiName:'Custom__c'}}]}],
          pages:[],namedCredentials:[{ciphertext:'encrypted'}],
          fieldHistory:[],accessControl:{roles:[{id:'admin'}]},scheduleRetries:{}
        },
        beta:{objects:[],records:{},flows:[],pages:[]}
      },
      libraryComponents:[{id:'widget',source:'component'}],
      users:[{id:'u1',tenantId:'alpha',name:'Support',email:'support@example.test',passwordSalt:'salt',passwordHash:'hash',role:'Admin',permissionSetIds:[],permissionSetGroupIds:[],disabled:false,createdAt:'2026-10-11T00:00:00.000Z'}],
      refreshSessions:[{tokenHash:'session1',familyId:'family1',userId:'u1',tenantId:'alpha',expiresAt:1000,usedAt:null,revokedAt:null}],
      revokedAccessTokens:{old:900}
    };
    const source=client(dbUrl(src));
    await source.connect();
    try {
      await source.query('CREATE TABLE metadrive_platform_state (id INTEGER PRIMARY KEY, payload JSONB NOT NULL)');
      await source.query('INSERT INTO metadrive_platform_state (id,payload) VALUES (1,$1::jsonb)',[JSON.stringify(state)]);
    } finally { await source.end(); }
    const script=resolve(dirname(fileURLToPath(import.meta.url)),'../scripts/migrate-relational-state.mjs');
    const env={...process.env,SOURCE_DATABASE_URL:dbUrl(src),TARGET_DATABASE_URL:dbUrl(dst),METADRIVE_MIGRATION_TARGET:'staging',PGSSLMODE:'disable'};
    const run=(...flags)=>spawnSync(process.execPath,[script,...flags],{env,cwd:process.cwd(),encoding:'utf8',timeout:90000});
    const inspect=run();
    assert.equal(inspect.status,0,'Read-only preflight failed: '+inspect.stderr);
    const backup=join(temp,'state-backup.json');
    const converted=run('--apply','--backup-file',backup);
    assert.equal(converted.status,0,'Staging conversion failed: '+converted.stderr);
    assert.deepStrictEqual(JSON.parse(readFileSync(backup,'utf8')),state);
    const target=client(dbUrl(dst));
    await target.connect();
    try {
      const records=await target.query('SELECT payload FROM metadrive_rel_records WHERE tenant_id=$1 AND object_api_name=$2',['alpha','Custom__c']);
      assert.equal(records.rowCount,1);
      assert.equal(records.rows[0].payload.Status__c,'Open');
      const users=await target.query('SELECT email,password_hash FROM metadrive_rel_users');
      assert.deepStrictEqual(users.rows,[{email:'support@example.test',password_hash:'hash'}]);
      const marker=await target.query('SELECT source_sha256 FROM metadrive_rel_migrations');
      assert.equal(marker.rows[0].source_sha256.trim(),stateDigest(state));
      const old=await target.query("SELECT to_regclass('metadrive_platform_state') AS present");
      assert.equal(old.rows[0].present,null);
    } finally { await target.end(); }
    const repeat=run('--apply','--backup-file',join(temp,'attempt2.json'));
    assert.notEqual(repeat.status,0,'Should refuse occupied target');
    const confirm=client(dbUrl(src));
    await confirm.connect();
    try {
      const original=await confirm.query('SELECT payload FROM metadrive_platform_state WHERE id=1');
      assert.deepStrictEqual(original.rows[0].payload,state,'Source must remain unchanged');
    } finally { await confirm.end(); }
  } finally {
    for(const name of [src,dst]) await root.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');
    await root.end();
    rmSync(temp,{recursive:true,force:true});
  }
});
