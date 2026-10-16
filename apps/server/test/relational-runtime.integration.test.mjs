// Real PostgreSQL tests for the opt-in relational persistence runtime.
// Every database is disposable and must be local; never accesses Aiven.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { relationalTables } from '../src/relational-tables.mjs';
import { projectState, stateDigest } from '../src/relational-projection.mjs';
import { readRelationalState, writeRelationalState } from '../src/relational-runtime.mjs';
import { resetRelationalAccount } from '../src/relational-account-recovery.mjs';

const base=process.env.METADRIVE_TEST_DATABASE_URL;
const sample=()=>({
  tenants:{
    alpha:{
      objects:[
        {apiName:'Custom__c',fields:[{apiName:'Parent__c',relationship:{targetObject:'Custom__c'}}]},
        {apiName:'Second__c',fields:[{apiName:'Name',dataType:'Text'}]}
      ],
      records:{Custom__c:[{Id:'first',Name:'Initial',Parent__c:null},{Id:'second',Name:'Second',Parent__c:'first'}],Empty__c:[],Second__c:[]},
      namedCredentials:[{id:'secret1',ciphertext:'encrypted-data'}],
      flows:[{apiName:'When_Custom_Created',elements:[{config:{objectApiName:'Custom__c'}}]}],
      pages:[],accessControl:{roles:[]},scheduleRetries:{},fieldHistory:[]
    },beta:{objects:[],records:{},flows:[],pages:[],accessControl:{roles:[]}}
  },
  libraryComponents:[{id:'custom-widget',data:'reusable'}],
  users:[
    {id:'u1',tenantId:'alpha',email:'support@example.test',name:'Support',passwordSalt:'salt1',passwordHash:'hash1',role:'Admin',permissionSetIds:['all'],permissionSetGroupIds:[],disabled:false,createdAt:'2026-10-11T00:00:00.000Z'},
    {id:'u2',tenantId:'beta',email:'reader@example.test',name:'Reader',passwordSalt:'salt2',passwordHash:'hash2',role:'Reader',permissionSetIds:[],permissionSetGroupIds:[],disabled:false,createdAt:'2026-10-11T00:00:00.000Z'}
  ],
  refreshSessions:[{tokenHash:'session1',familyId:'family',userId:'u1',tenantId:'alpha',expiresAt:1000,usedAt:null,revokedAt:null}],
  revokedAccessTokens:{old:950}
});
async function withDatabase(action) {
  const u=new URL(base);
  assert.ok(['localhost','127.0.0.1','::1'].includes(u.hostname),'No remote DB tests');
  assert.equal(u.pathname,'/postgres','Use local PostgreSQL test administrator DB');
  const pg=(await import('pg')).default;
  const admin=new pg.Client({connectionString:base,ssl:false});
  await admin.connect();
  const name='mrel_runtime_'+randomBytes(6).toString('hex');
  const database=new URL(base);database.pathname='/'+name;
  try {
    await admin.query('CREATE DATABASE '+name);
    const pool=new pg.Pool({connectionString:database.toString(),ssl:false,max:3});
    try {
      const sql=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'../sql/relational-state-v1.sql'),'utf8');
      await pool.query(sql);
      await action(pool);
    } finally {await pool.end();}
  } finally {
    await admin.query('DROP DATABASE IF EXISTS '+name+'');
    await admin.end();
  }
}
async function seed(pool,state) {
  const rows=projectState(state);
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    for(const [key,table,columnList,toValues] of relationalTables) {
      const columns=columnList.split(',');
      const values=rows[key];
      for(let start=0;start<values.length;start+=100) {
        const batch=values.slice(start,start+100);
        const places=batch.map((_,index)=>'('+columns.map((_,c)=>'$'+(index*columns.length+c+1)).join(',')+')').join(',');
        await client.query('INSERT INTO '+table+' ('+columnList+') VALUES '+places,batch.flatMap(toValues));
      }
    }
    const digest=stateDigest(state);
    await client.query('INSERT INTO metadrive_rel_migrations (revision,source_sha256) VALUES (1,$1)',[digest]);
    await client.query('INSERT INTO metadrive_rel_runtime (id,version,state_sha256) VALUES (1,0,$1)',[digest]);
    await client.query('COMMIT');
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
test('relational persistence retains custom fields, flows, credentials, account hashes and sessions through restart',{skip:!base},async()=>{
  await withDatabase(async pool=>{
    const original=sample();
    await seed(pool,original);
    let prior=await readRelationalState(pool);
    assert.equal(prior.version,0);
    assert.equal(prior.digest,stateDigest(original));
    const updated=structuredClone(original);
    updated.tenants.alpha.records.Custom__c[0].Status__c='Ready';
    updated.tenants.alpha.records.Custom__c.push({Id:'third',Name:'Added',Parent__c:'second',Nested__c:[null,1,true]});
    updated.tenants.alpha.namedCredentials.push({id:'secret2',ciphertext:'still-encrypted'});
    updated.tenants.alpha.flows.push({apiName:'On_Update',elements:[{config:{field:'Status__c'}}]});
    updated.users[0].passwordHash='new-salted-password-hash';
    updated.refreshSessions[0].revokedAt=456;
    updated.revokedAccessTokens.latest=1100;
    prior=await writeRelationalState(pool,updated,prior);
    assert.equal(prior.version,1);
    const verified=await readRelationalState(pool);
    assert.equal(verified.version,1);
    assert.equal(verified.digest,stateDigest(updated));
    assert.equal(verified.state.users[0].passwordHash,'new-salted-password-hash');
    assert.equal(verified.state.tenants.alpha.records.Custom__c.length,3);
    assert.equal(verified.state.refreshSessions[0].revokedAt,456);
    assert.equal((await pool.query('SELECT to_regclass($1) AS name',['metadrive_platform_state'])).rows[0].name,null);
  });
});
test('optimistic revision guards reject stale writers without overwriting newer records',{skip:!base},async()=>{
  await withDatabase(async pool=>{
    await seed(pool,sample());
    const a=await readRelationalState(pool);
    const b=await readRelationalState(pool);
    const first=structuredClone(a.state);
    first.tenants.alpha.records.Custom__c[0].Name='Writer A';
    const next=await writeRelationalState(pool,first,a);
    assert.equal(next.version,1);
    const stale=structuredClone(b.state);
    stale.tenants.alpha.records.Custom__c[0].Name='Writer B';
    await assert.rejects(writeRelationalState(pool,stale,b),/Concurrent MetaDrive writer/);
    const verified=await readRelationalState(pool);
    assert.equal(verified.state.tenants.alpha.records.Custom__c[0].Name,'Writer A');
    assert.equal(verified.version,1);
    const invalid=structuredClone(verified.state);
    invalid.tenants.alpha.records.Custom__c.push({...invalid.tenants.alpha.records.Custom__c[0]});
    await assert.rejects(writeRelationalState(pool,invalid,verified),/duplicate record Id/);
    assert.equal((await readRelationalState(pool)).version,1);
  });
});
test('reordering record buckets, users and objects preserves relationship payloads',{skip:!base},async()=>{
  await withDatabase(async pool=>{
    await seed(pool,sample());
    const before=await readRelationalState(pool);
    const next=structuredClone(before.state);
    next.tenants.alpha.objects.reverse();
    next.users.reverse();
    const bucket=next.tenants.alpha.records;
    next.tenants.alpha.records={Second__c:bucket.Second__c,Empty__c:bucket.Empty__c,Custom__c:bucket.Custom__c};
    next.tenants.alpha.records.Custom__c.reverse();
    const saved=await writeRelationalState(pool,next,before);
    assert.equal(saved.version,1);
    const after=await readRelationalState(pool);
    assert.equal(after.digest,stateDigest(next));
    assert.equal(after.state.tenants.alpha.records.Custom__c[0].Id,'second');
    assert.equal(after.state.tenants.alpha.records.Custom__c[0].Parent__c,'first');
    assert.equal(after.state.users[0].id,'u2');
  });
});
test('mismatched checksum fails closed and does not seed empty data',{skip:!base},async()=>{
  await withDatabase(async pool=>{
    await seed(pool,sample());
    await pool.query("UPDATE metadrive_rel_runtime SET state_sha256=$1 WHERE id=1",['0'.repeat(64)]);
    await assert.rejects(readRelationalState(pool),/checksum mismatch/);
    const record=(await pool.query('SELECT count(*)::int AS count FROM metadrive_rel_records')).rows[0].count;
    assert.equal(record,2);
  });
});

test('offline relational account recovery replaces only the matching hash and revokes refresh sessions',{skip:!base},async()=>{
  await withDatabase(async pool=>{
    const original=sample();
    await seed(pool,original);
    const client=await pool.connect();
    const previous=await readRelationalState(pool);
    try {
      const completed=await resetRelationalAccount(client,{email:' SUPPORT@example.test ',salt:'new-unique-salt',hash:'new-scrypt-hash',revokedAt:12345});
      assert.equal(completed.userId,'u1');
      assert.equal(completed.revokedSessions,1);
      assert.equal(completed.version,1);
      const verified=await readRelationalState(pool);
      assert.equal(verified.version,1);
      assert.equal(verified.state.users.find(u=>u.id==='u1').passwordSalt,'new-unique-salt');
      assert.equal(verified.state.users.find(u=>u.id==='u1').passwordHash,'new-scrypt-hash');
      assert.equal(verified.state.users.find(u=>u.id==='u2').passwordHash,'hash2');
      assert.equal(verified.state.refreshSessions[0].revokedAt,12345);
      assert.notEqual(previous.digest,verified.digest);
      await assert.rejects(resetRelationalAccount(client,{email:'missing@example.test',salt:'salt',hash:'hash'}),/Exactly one enabled/);
      assert.equal((await readRelationalState(pool)).version,1);
    } finally {client.release();}
  });
});
