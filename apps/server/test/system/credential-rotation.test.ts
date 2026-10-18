import assert from 'node:assert/strict';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import {NamedCredentialService} from '../../src/system-support/named-credential-service.js';

test('credential rotation preserves secret and configuration plaintext under a new key',async()=>{
 const originalEnv={...process.env};
 try {
  const oldKey=randomBytes(32),newKey=randomBytes(32);
  process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY=oldKey.toString('base64');
  process.env.METADRIVE_CREDENTIAL_KEYS=JSON.stringify({next:newKey.toString('base64')});
  process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID='next';
  const wrap=(plain:string)=>{
   const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',oldKey,iv);
   return Buffer.concat([iv,cipher.update(plain,'utf8'),cipher.final(),cipher.getAuthTag()]);
  };
  const oldSecret=wrap('secret'),oldConfig=wrap('{"scope":"read"}');
  let updated:unknown[]=[];
  const db={
   transaction:async<T>(callback:(client:{query:(sql:string,args?:unknown[])=>Promise<unknown>})=>Promise<T>)=>
    callback({query:async(sql:string,args?:unknown[])=>{
     if(sql.includes('FOR UPDATE'))return {rows:[{encryption_key_id:'legacy',secret_ciphertext:oldSecret,configuration_ciphertext:oldConfig}]};
     if(sql.startsWith('UPDATE md_named_credentials'))updated=args??[];
     return {rows:[]};
    }}),
   query:async()=>({rows:[{id:'123e4567-e89b-42d3-a456-426614174000',name:'cred',label:'Cred',protocol:'HTTPS',base_url:'https://example.org',auth_type:'Bearer',header_name:'',secret_ciphertext:oldSecret,encryption_key_id:'next',enabled:true,updated_at:new Date()}]})
  } as unknown as SqlPersistence;
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  const service=new NamedCredentialService(db,rbac);
  await service.rotate('tenant','user','123e4567-e89b-42d3-a456-426614174000');
  assert.equal(updated[4],'next');
  const unwrap=(buf:Buffer)=>{
   const decipher=createDecipheriv('aes-256-gcm',newKey,buf.subarray(0,12));
   decipher.setAuthTag(buf.subarray(-16));
   return Buffer.concat([decipher.update(buf.subarray(12,-16)),decipher.final()]).toString('utf8');
  };
  assert.equal(unwrap(updated[2] as Buffer),'secret');
  assert.equal(unwrap(updated[3] as Buffer),'{"scope":"read"}');
 } finally {
  for(const key of ['METADRIVE_CREDENTIAL_ENCRYPTION_KEY','METADRIVE_CREDENTIAL_KEYS','METADRIVE_CREDENTIAL_ACTIVE_KEY_ID']){
   if(originalEnv[key]===undefined)delete process.env[key];
   else process.env[key]=originalEnv[key];
  }
 }
});
