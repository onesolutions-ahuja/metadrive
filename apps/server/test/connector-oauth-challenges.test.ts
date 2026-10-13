import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { SqlOAuthChallengeStore, type OAuthSql, type ChallengeCipher } from '../src/connector-oauth-challenges.js';
const digest=createHash('sha256').update('random-state').digest('hex');
const scope={tenantId:'tenant-a',credentialId:'named-a'};
test('OAuth challenge is sealed before persistence and consumed once',async()=>{
  let record:Record<string,unknown>|null=null;
  const db:OAuthSql={query:async(sql,params=[])=>{
    if(sql.includes('INSERT INTO')) {
      record={state_digest:params[0],tenant_id:params[1],credential_id:params[2],redirect_uri:params[3],
        key_id:params[4],iv:params[5],auth_tag:params[6],ciphertext:params[7],expires_at_ms:params[8]};
      return {rows:[]};
    }
    if(sql.includes('SELECT tenant_id'))return {rows:record?[record]:[]};
    if(sql.includes('DELETE FROM')&&sql.includes('RETURNING')){
      const result=record?[record]:[];record=null;return {rows:result};
    }
    return {rows:[]};
  }};
  const cipher:ChallengeCipher={
    seal:(_tenant,_digest,verifier)=>({keyId:'test',iv:'opaque-iv',authTag:'opaque-tag',ciphertext:'enc:'+Buffer.from(verifier).toString('base64')}),
    open:(_tenant,_digest,row)=>Buffer.from(row.ciphertext.slice(4),'base64').toString('utf8')
  };
  const challenges=new SqlOAuthChallengeStore(db,cipher);
  const input={scope,verifier:'private-verifier',redirectUri:'https://app.example.org/api/oauth/callback',expiresAtMs:Date.now()+600000};
  await challenges.create(digest,input);
  assert.ok(record);
  assert.equal(JSON.stringify(record).includes('private-verifier'),false);
  assert.deepEqual(await challenges.findScope(digest),scope);
  assert.deepEqual(await challenges.consume(digest),input);
  assert.equal(await challenges.consume(digest),null);
});
test('OAuth challenge invalid input fails without SQL writes',async()=>{
  let invoked=false;
  const db:OAuthSql={query:async()=>{invoked=true;return {rows:[]};}};
  const cipher:ChallengeCipher={seal:()=>({keyId:'',iv:'',authTag:'',ciphertext:''}),open:()=>''};
  const store=new SqlOAuthChallengeStore(db,cipher);
  await assert.rejects(store.create('malformed',{scope,verifier:'code',redirectUri:'https://a.example.org',expiresAtMs:Date.now()+600000}),/INVALID_OAUTH_STATE/);
  await assert.rejects(store.findScope('invalid'),/INVALID_OAUTH_STATE/);
  assert.equal(invoked,false);
});
