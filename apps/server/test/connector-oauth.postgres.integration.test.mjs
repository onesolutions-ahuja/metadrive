import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { SqlOAuthChallengeStore } from '../dist/connector-oauth-challenges.js';
const url=process.env.METADRIVE_TEST_DATABASE_URL;
test('OAuth PKCE state is SQL durable, unique and consumed once across replicas',
  {skip:!url && 'Isolated PostgreSQL required'},async()=>{
    const pool=new pg.Pool({connectionString:url,ssl:false});
    const client=await pool.connect();
    const schema='md11_oauth_'+randomUUID().replaceAll('-','');
    try{
      await client.query('CREATE SCHEMA "'+schema+'"');
      await client.query('SET search_path TO "'+schema+'"');
      await client.query(readFileSync(new URL('../sql/module11-oauth-challenges.sql',import.meta.url),'utf8'));
      const cipher={seal:(_tenant,_digest,value)=>({
        keyId:'mock-encryption',iv:'opaque-iv',authTag:'opaque-tag',
        ciphertext:'sealed:'+Buffer.from(value).toString('base64')}),
        open:(_tenant,_digest,encrypted)=>Buffer.from(encrypted.ciphertext.slice(7),'base64').toString('utf8')};
      const storeA=new SqlOAuthChallengeStore(client,cipher);
      const storeB=new SqlOAuthChallengeStore(client,cipher);
      const state='b'.repeat(64);
      const challenge={scope:{tenantId:'tenant-A',credentialId:'cred-A'},verifier:'sensitive-pkce-verifier',
        redirectUri:'https://api.example.org/api/oauth/callback',expiresAtMs:Date.now()+300000};
      await storeA.create(state,challenge);
      await assert.rejects(storeB.create(state,challenge),/duplicate key/);
      assert.deepEqual(await storeB.findScope(state),challenge.scope);
      const row=await client.query('SELECT ciphertext,tenant_id FROM md_integration_oauth_challenges WHERE state_digest=$1',[state]);
      assert.equal(row.rows[0].ciphertext.includes(challenge.verifier),false);
      assert.equal(row.rows[0].tenant_id,'tenant-A');
      assert.deepEqual(await storeB.consume(state),{...challenge,expiresAtMs:Math.floor(challenge.expiresAtMs)});
      assert.equal(await storeA.consume(state),null);
      const columns=await client.query("SELECT COUNT(*)::integer AS n FROM information_schema.columns WHERE table_schema=$1 AND data_type IN ('json','jsonb')",[schema]);
      assert.equal(columns.rows[0].n,0);
    }finally{
      await client.query('RESET search_path');
      await client.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');
      client.release();await pool.end();
    }
  });
