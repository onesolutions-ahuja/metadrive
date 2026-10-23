import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import {NamedCredentialService} from '../../src/system-support/named-credential-service.js';

test('invalid OAuth credentials cannot be saved as executable Named Credentials',async()=>{
 let writes=0;
 const db={query:async(sql:string)=>{if(sql.includes('SELECT encryption_key_id'))return {rows:[{encryption_key_id:'legacy',secret_ciphertext:null,configuration_ciphertext:null}],rowCount:1};if(sql.trimStart().startsWith('SELECT'))return {rows:[],rowCount:0};writes++;return {rows:[],rowCount:0};}} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const service=new NamedCredentialService(db,rbac);
 const request={name:'demo',label:'Demo',protocol:'HTTPS',baseUrl:'https://example.com',
  headerName:'X-API-Key',authType:'OAuth Client Credentials'};
 for(const authType of ['OAuth Authorization Code']){
  await assert.rejects(service.create('tenant','user',{...request,authType,configuration:{invalid:42}}),/Invalid credential/);
  await assert.rejects(service.update('tenant','user','123e4567-e89b-42d3-a456-426614174000',{...request,authType,configuration:{invalid:42}}),/Invalid credential/);
 }
 assert.equal(writes,0);
});
