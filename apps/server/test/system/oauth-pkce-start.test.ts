import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {NamedCredentialService} from '../../src/system-support/named-credential-service.js';
import {OAuthAuthorizationService} from '../../src/system-support/oauth-authorization-service.js';

test('PKCE authorization uses hashed state and encrypted verifier, never stores plaintext',async()=>{
 const oldCallback=process.env.METADRIVE_OAUTH_CALLBACK_URL;
 const oldReturn=process.env.METADRIVE_OAUTH_RETURN_URL;
 process.env.METADRIVE_OAUTH_CALLBACK_URL='https://auth.example.org/api/oauth/callback';
 process.env.METADRIVE_OAUTH_RETURN_URL='https://app.example.org/settings';
 try{
  let insertArgs:unknown[]=[];
  const db={
   query:async(sql:string)=>{
    if(sql.includes('FROM md_named_credentials'))return {rows:[{
     id:'123e4567-e89b-42d3-a456-426614174000',enabled:true,auth_type:'OAuth Authorization Code',
     secret_ciphertext:Buffer.from('secret'),configuration_ciphertext:Buffer.from('config'),encryption_key_id:'legacy'}]};
    throw Error('Unexpected SQL');
   },
   transaction:async<T>(run:(client:{query:(sql:string,args?:unknown[])=>Promise<unknown>})=>Promise<T>)=>run({
    query:async(sql:string,args?:unknown[])=>{
     if(sql.includes('count(*)'))return {rows:[{n:'0'}]};
     if(sql.includes('INSERT INTO md_credential_oauth_grants'))insertArgs=args??[];
     return {rows:[],rowCount:1};
    }
   })
  } as unknown as SqlPersistence;
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  const vault={
   decryptOpaque:(cipher:Buffer)=>cipher.toString()==='config'
    ?JSON.stringify({clientId:'client-1',authorizationUrl:'https://provider.example.org/authorize',
      tokenUrl:'https://provider.example.org/token',scope:'read'}):'encrypted-secret',
   encryptOpaque:(plain:string)=>({ciphertext:Buffer.from('encrypted:'+plain),keyId:'key1'})
  } as unknown as NamedCredentialService;
  const service=new OAuthAuthorizationService(db,rbac,vault);
  const result=await service.start('tenant','actor','123e4567-e89b-42d3-a456-426614174000');
  const u=new URL(result.authorizationUrl);
  const state=u.searchParams.get('state')??'';
  assert.match(state,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(insertArgs[3],createHash('sha256').update(state).digest('hex'));
  assert.equal(u.searchParams.get('code_challenge_method'),'S256');
  assert.match(u.searchParams.get('code_challenge')??'',/^[A-Za-z0-9_-]{43}$/);
  assert.equal(u.searchParams.get('redirect_uri'),process.env.METADRIVE_OAUTH_CALLBACK_URL);
  assert.notEqual(String(insertArgs[4]),state);
  assert.ok(!JSON.stringify(insertArgs).includes(state));
 }finally{
  if(oldCallback===undefined)delete process.env.METADRIVE_OAUTH_CALLBACK_URL;
  else process.env.METADRIVE_OAUTH_CALLBACK_URL=oldCallback;
  if(oldReturn===undefined)delete process.env.METADRIVE_OAUTH_RETURN_URL;
  else process.env.METADRIVE_OAUTH_RETURN_URL=oldReturn;
 }
});
