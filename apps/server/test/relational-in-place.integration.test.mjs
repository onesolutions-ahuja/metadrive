// Controlled in-place Aiven backfill test. Uses only a random local test database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { join,resolve,dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readRelationalState, writeRelationalState } from '../src/relational-runtime.mjs';
import { stateDigest } from '../src/relational-projection.mjs';
import { resetRelationalAccount } from '../src/relational-account-recovery.mjs';

const base=process.env.METADRIVE_TEST_DATABASE_URL;
test('in-place Aiven backfill is additive, backup-gated and refuses stale JSONB cutover',{skip:!base,timeout:120000},async()=>{
  const url=new URL(base);
  assert.ok(['localhost','127.0.0.1','::1'].includes(url.hostname));
  assert.equal(url.pathname,'/postgres');
  const pg=(await import('pg')).default;
  const suffix=randomBytes(6).toString('hex'),db='mrel_inplace_'+suffix;
  const dbUrl=new URL(base);dbUrl.pathname='/'+db;
  const admin=new pg.Client({connectionString:base,ssl:false});
  const dir=mkdtempSync(join(tmpdir(),'metadrive-inplace-'));
  await admin.connect();
  try {
    await admin.query('CREATE DATABASE '+db);
    const pool=new pg.Pool({connectionString:dbUrl.toString(),ssl:false,max:3});
    try {
      const state={
        tenants:{
          tenant:{objects:[{apiName:'Custom__c',fields:[{apiName:'Name',dataType:'Text'}]}],
            records:{Custom__c:[{Id:'record1',Name:'Before'}],Blank__c:[]},
            flows:[{apiName:'Test_Flow',elements:[]}],pages:[],namedCredentials:[{token:'encrypted'}],
            accessControl:{roles:[]}}
        },
        libraryComponents:[],
        users:[{id:'user',tenantId:'tenant',name:'Support',email:'support@example.test',passwordSalt:'salt',passwordHash:'hash',role:'Admin',permissionSetIds:[],permissionSetGroupIds:[],disabled:false,createdAt:'2026-10-11T00:00:00.000Z'}],
        refreshSessions:[{tokenHash:'token',familyId:'family',userId:'user',tenantId:'tenant',expiresAt:9999999999,usedAt:null,revokedAt:null}],revokedAccessTokens:{}
      };
      await pool.query('CREATE TABLE metadrive_platform_state (id INTEGER PRIMARY KEY,payload JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now())');
      await pool.query('INSERT INTO metadrive_platform_state (id,payload) VALUES (1,$1::jsonb)',[JSON.stringify(state)]);
      const backupFile=join(dir,'restored-and-verified.json');
      const raw=JSON.stringify(state);
      writeFileSync(backupFile,raw,{mode:0o600});
      const sha=createHash('sha256').update(raw).digest('hex');
      const script=resolve(dirname(fileURLToPath(import.meta.url)),'../scripts/migrate-relational-in-place.mjs');
      const env={
        ...process.env,DATABASE_URL:dbUrl.toString(),PGSSLMODE:'disable',
        METADRIVE_MIGRATION_TARGET:'staging',METADRIVE_CONFIRMED_OFFLINE:'true',
        METADRIVE_BACKUP_VERIFIED_RESTORE:'true',
        METADRIVE_VERIFIED_BACKUP_FILE:backupFile,METADRIVE_VERIFIED_BACKUP_SHA256:sha
      };
      const run=(flags=[],overrides={})=>spawnSync(process.execPath,[script,...flags],{
        cwd:process.cwd(),encoding:'utf8',timeout:75000,env:{...env,...overrides}
      });
      assert.equal(run().status,0,'Read-only preflight must pass without mutations');
      assert.equal((await pool.query("SELECT to_regclass('metadrive_rel_runtime') AS name")).rows[0].name,null);
      assert.notEqual(run(['--apply'],{METADRIVE_CONFIRMED_OFFLINE:'false'}).status,0,'Cannot backfill with active API');
      assert.notEqual(run(['--apply'],{METADRIVE_VERIFIED_BACKUP_SHA256:'0'.repeat(64)}).status,0,'Cannot backfill with unverified backup');
      assert.equal((await pool.query("SELECT to_regclass('metadrive_rel_runtime') AS name")).rows[0].name,null);
      const applied=run(['--apply']);
      assert.equal(applied.status,0,'In-place conversion failed: '+applied.stderr?.slice(-4000));
      const original=(await pool.query('SELECT payload FROM metadrive_platform_state WHERE id=1')).rows[0].payload;
      assert.deepStrictEqual(original,state);
      const relational=await readRelationalState(pool);
      assert.equal(relational.digest,stateDigest(state));
      assert.equal(relational.state.tenants.tenant.records.Custom__c[0].Name,'Before');
      assert.notEqual(run(['--apply']).status,0,'Never accept duplicate backfill');
      const changed=structuredClone(state);
      changed.tenants.tenant.records.Custom__c[0].Name='Unmigrated late change';
      await pool.query('UPDATE metadrive_platform_state SET payload=$1::jsonb WHERE id=1',[JSON.stringify(changed)]);
      await assert.rejects(readRelationalState(pool),/Legacy state changed after relational migration/);
      await pool.query('UPDATE metadrive_platform_state SET payload=$1::jsonb WHERE id=1',[JSON.stringify(state)]);
      assert.equal((await readRelationalState(pool)).digest,stateDigest(state));
      // Password recovery invalidates both refresh sessions and pre-reset JWT access tokens.
      const reset=await resetRelationalAccount(pool,{
        email:'support@example.test',salt:'new-salt',hash:'new-password-hash',revokedAt:10000
      });
      assert.equal(reset.revokedSessions,1);
      const afterReset=await readRelationalState(pool);
      assert.equal(afterReset.state.users[0].passwordHash,'new-password-hash');
      assert.equal(afterReset.state.users[0].authRevokedBefore,10000);
      assert.equal(afterReset.state.refreshSessions[0].revokedAt,10000);
      // Simulate records created AFTER switching to relational mode.
      const beforeRollback=await readRelationalState(pool);
      const latest=structuredClone(beforeRollback.state);
      latest.tenants.tenant.records.Custom__c.push({Id:'record2',Name:'Created after cutover'});
      await writeRelationalState(pool,latest,beforeRollback);
      const rollbackScript=resolve(dirname(fileURLToPath(import.meta.url)),'../scripts/restore-relational-to-legacy.mjs');
      const rollback=(flags=[],overrides={})=>spawnSync(process.execPath,[rollbackScript,...flags],{
        cwd:process.cwd(),encoding:'utf8',timeout:75000,
        env:{...env,METADRIVE_PERSISTENCE_MODE:'relational',METADRIVE_ROLLBACK_CONFIRMED:'true',...overrides}
      });
      assert.equal(rollback().status,0,'Rollback preflight must be read-only');
      assert.notEqual(rollback(['--apply'],{METADRIVE_ROLLBACK_CONFIRMED:'false'}).status,0);
      assert.equal(rollback(['--apply']).status,0,'Rollback export must succeed with verified offline backup');
      const restoredLegacy=(await pool.query('SELECT payload FROM metadrive_platform_state WHERE id=1')).rows[0].payload;
      assert.equal(restoredLegacy.tenants.tenant.records.Custom__c.length,2,
        'Rollback must preserve records written after relational cutover');
      assert.equal(restoredLegacy.tenants.tenant.records.Custom__c[1].Name,'Created after cutover');
      await assert.rejects(readRelationalState(pool),/Legacy state changed after relational migration/,
        'Relational restart must refuse mismatched baseline after rollback');
    } finally {await pool.end();}
  } finally {
    await admin.query('DROP DATABASE IF EXISTS '+db+' WITH (FORCE)');
    await admin.end();
    rmSync(dir,{recursive:true,force:true});
  }
});
