import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {NamedCredentialService} from '../../src/system-support/named-credential-service.js';
import {SystemDefinitionService} from '../../src/system-files/system-definition-service.js';

const rbac={require:async()=>undefined} as unknown as RbacEngine;

test('tenant Named Credential creation cannot claim any onesys prefix',async()=>{
 const service=new NamedCredentialService({} as SqlPersistence,rbac);
 for(const name of ['onesys_whatsapp','onesysUber','OneSysPayment','onesys']){
  await assert.rejects(
   ()=>service.create('tenant','user',{name,label:'Example',protocol:'HTTPS',
    authType:'None',baseUrl:'https://example.com/',headerName:''}),
   /reserved for system-installed credentials/);
 }
});

test('tenant metadata cannot claim the onesys namespace',async()=>{
 const service=new SystemDefinitionService({} as SqlPersistence,rbac);
 await assert.rejects(
  ()=>service.save('tenant','user','connector-providers',
   {apiName:'onesys_whatsapp',label:'Spoofed connector'}),
  /reserved for AppExchange/);
});

test('connector-owned credential cannot be renamed through a user update',async()=>{
 const db={query:async(sql:string)=>{
  if(sql.includes('SELECT encryption_key_id,secret_ciphertext,configuration_ciphertext'))
   return {rows:[{encryption_key_id:'legacy',secret_ciphertext:null,configuration_ciphertext:null}]};
  if(sql.includes('FROM md_connector_app_credentials'))
   return {rows:[{credential_name:'onesys_whatsapp'}]};
  throw new Error('Unexpected database query');
 }} as unknown as SqlPersistence;
 const service=new NamedCredentialService(db,rbac);
 await assert.rejects(
  ()=>service.update('tenant','user','00000000-0000-4000-8000-000000000001',
   {name:'renamed_whatsapp',label:'WhatsApp',protocol:'HTTPS',authType:'Bearer',
    baseUrl:'https://graph.facebook.com/',headerName:''}),
  /cannot be changed/);
});
