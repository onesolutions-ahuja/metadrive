import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PoolClient} from 'pg';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import {NamedCredentialService} from '../../src/system-support/named-credential-service.js';

const tenant='00000000-0000-4000-8000-000000000001';
const provider='00000000-0000-4000-8000-000000000002';
const tokenId='00000000-0000-4000-8000-000000000003';
const jwksId='00000000-0000-4000-8000-000000000004';

test('OIDC settings create linked HTTPS Named Credentials and encrypt the client secret',async()=>{
 const previous=process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY;
 process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
 try{
  let created=0;
  const inserts:unknown[][]=[];
  const updates:unknown[][]=[];
  const client={query:async(sql:string,args:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
   if(sql.includes('SELECT token_credential_id'))return {rows:[{
    token_credential_id:null,jwks_credential_id:null
   }]};
   if(sql.includes('SELECT id,name,protocol'))return {rows:[]};
   if(sql.includes('INSERT INTO md_named_credentials')){
    inserts.push(args);
    created++;
    return {rows:[{id:created===1?tokenId:jwksId}]};
   }
   if(sql.includes('UPDATE md_identity_providers SET token_credential_id')){
    updates.push(args);return {rows:[]};
   }
   return {rows:[]};
  }};
  const service=new NamedCredentialService({} as SqlPersistence,{} as RbacEngine);
  await service.manageFederationCredentials(client as unknown as PoolClient,tenant,provider,
   'https://idp.example/token','https://idp.example/keys','client-secret');
  assert.equal(inserts.length,2);
  assert.equal(inserts[0][3],'https://idp.example/token');
  assert.ok(inserts[0][4] instanceof Buffer);
  assert.equal(service.decryptOpaque(inserts[0][4] as Buffer,String(inserts[0][5])),'client-secret');
  assert.equal(inserts[1][3],'https://idp.example/keys');
  assert.equal(inserts[1][4],null);
  assert.deepEqual(updates,[[tenant,provider,tokenId,jwksId]]);
 }finally{
  if(previous===undefined)delete process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY;
  else process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY=previous;
 }
});

test('OIDC token requests cannot target MetaDrive or override Named Credential identity',async()=>{
 const previous=process.env.METADRIVE_AUTH_PUBLIC_ORIGIN;
 process.env.METADRIVE_AUTH_PUBLIC_ORIGIN='https://metadrive.example';
 try{
  const activities:Array<Record<string,unknown>>=[];
  const db={query:async()=>({rows:[{
   provider:'Test IdP',enabled:true,client_id:'registered-client',
   expected_url:'https://metadrive.example/token',id:tokenId,
   base_url:'https://metadrive.example/token',secret_ciphertext:null,
   encryption_key_id:'legacy'
  }],rowCount:1})} as unknown as SqlPersistence;
  const service=new NamedCredentialService(db,{} as RbacEngine);
  service.setIntegrationActivityWriter(async activity=>{
   activities.push(activity as unknown as Record<string,unknown>);
  });
  const parameters=new URLSearchParams({grant_type:'authorization_code',
   client_id:'untrusted-client',client_secret:'untrusted-secret'});
  await assert.rejects(()=>service.identityProviderJson(tenant,provider,'token',parameters),
   /cannot target MetaDrive internal APIs/);
  assert.equal(activities.length,1);
  assert.equal(activities[0].outcome,'network_error');
  assert.equal(activities[0].requestBytes,Buffer.byteLength(
   'grant_type=authorization_code&client_id=registered-client'));
 }finally{
  if(previous===undefined)delete process.env.METADRIVE_AUTH_PUBLIC_ORIGIN;
  else process.env.METADRIVE_AUTH_PUBLIC_ORIGIN=previous;
 }
});
