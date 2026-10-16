import assert from 'node:assert/strict';
import test from 'node:test';
import { beginOAuthAuthorization, completeOAuthAuthorization, getOAuthAccessToken, OAuthFault,
  type OAuthToken, type OAuthChallenge, type OAuthScope } from '../src/connector-oauth.js';
const scope: OAuthScope = { tenantId: 'tenant-A', credentialId: 'credential-B' };
const settings = { tokenUrl: 'https://accounts.example.org/oauth/token', clientId: 'app', clientSecret: 'private' };
const makeVault = () => {
  const tokens = new Map<string, OAuthToken>();
  const key = (scope: OAuthScope) => JSON.stringify(scope);
  return { load: async (scope: OAuthScope) => tokens.get(key(scope)) ?? null,
    save: async (scope: OAuthScope, value: OAuthToken) => { tokens.set(key(scope), value); } };
};
test('Authorization Code uses S256 PKCE and single-use state', async () => {
  const stored = new Map<string, OAuthChallenge>();
  const challengeStore = { create: async (key: string, c: OAuthChallenge) => { stored.set(key,c); },
    consume: async (key: string) => { const c = stored.get(key) ?? null; stored.delete(key); return c; } };
  const url = new URL(await beginOAuthAuthorization({ ...settings,
    authorizationUrl: 'https://accounts.example.org/authorize', redirectUri: 'https://app.example.org/callback' }, scope, challengeStore));
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(url.searchParams.get('code_challenge'));
  const state = url.searchParams.get('state')!;
  const vault = makeVault();
  await completeOAuthAuthorization(settings, scope, { state, code: 'temporary-code' }, challengeStore, vault,
    async (endpoint, params) => {
      assert.equal(endpoint.hostname, 'accounts.example.org');
      assert.equal(params.get('grant_type'), 'authorization_code');
      assert.ok(params.get('code_verifier'));
      return {status:200, body:{ access_token:'issued', expires_in:3600 }};
    });
  assert.equal((await vault.load(scope))?.accessToken, 'issued');
  await assert.rejects(completeOAuthAuthorization(settings,scope,{state,code:'replay'},challengeStore,vault,
    async () => { throw Error('Must not call'); }), (e: unknown) => e instanceof OAuthFault && e.code === 'INVALID_OAUTH_STATE');
});
test('Concurrent expiry triggers one refresh and rotated token is encrypted by injected vault', async () => {
  const vault = makeVault();
  await vault.save(scope,{accessToken:'stale', refreshToken:'refresh',tokenType:'Bearer',expiresAtMs:1});
  let calls=0;
  const request = async (_url: URL, params: URLSearchParams) => {
    calls++; assert.equal(params.get('grant_type'), 'refresh_token');
    return { status:200, body: {access_token:'renewed', refresh_token:'rotated', expires_in:3600} };
  };
  const values = await Promise.all(Array.from({length:10}, () => getOAuthAccessToken(scope,settings,vault,request)));
  assert.ok(values.every(value=>value==='renewed')); assert.equal(calls,1);
  assert.equal((await vault.load(scope))?.refreshToken,'rotated');
});
test('Expired non-refreshable token fails closed; client credentials can acquire token', async () => {
  const vault=makeVault();
  await assert.rejects(getOAuthAccessToken(scope,settings,vault,async()=>({status:500,body:{}})),
    (e: unknown)=>e instanceof OAuthFault && e.code==='REAUTHORIZATION_REQUIRED');
  assert.equal(await getOAuthAccessToken(scope,{...settings,grantType:'client_credentials'},vault,
    async (_url,params)=>{assert.equal(params.get('grant_type'),'client_credentials');return {status:200,body:{access_token:'service',expires_in:3600}};}),'service');
});
test('Reject private/untrusted token URLs, never propagate secret provider error responses', async () => {
  await assert.rejects(getOAuthAccessToken(scope,{...settings,tokenUrl:'http://localhost/token',grantType:'client_credentials'},
    makeVault(),async()=>({status:200,body:{ access_token:'should-not-run',expires_in:3600 }})),
    (e: unknown)=>e instanceof OAuthFault && e.code==='INVALID_OAUTH_URL');
  const vault=makeVault();
  await assert.rejects(getOAuthAccessToken(scope,{...settings,grantType:'client_credentials'},vault,
    async()=>({status:401,body:{secret:'private'}})),(e: unknown)=>e instanceof OAuthFault && e.code==='TOKEN_EXCHANGE_FAILED');
});
