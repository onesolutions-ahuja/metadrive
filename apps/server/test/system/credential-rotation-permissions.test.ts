import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import {NamedCredentialService} from '../../src/system-support/named-credential-service.js';

test('rotation requires both Security manage and NamedCredential manage before any SQL access',async()=>{
 let dbTouched=false;
 const db={
  transaction:async()=>{dbTouched=true;throw Error('SQL must not run');},
  query:async()=>{dbTouched=true;throw Error('SQL must not run');}
 } as unknown as SqlPersistence;
 let checked:string[]=[];
 const rbac={
  require:async(_tenant:string,_user:string,resource:string,action:string)=>{
   checked.push(resource+':'+action);
   if(resource==='NamedCredential')throw Error('Permission denied');
  }
 } as unknown as RbacEngine;
 const service=new NamedCredentialService(db,rbac);
 await assert.rejects(service.rotate('tenant','user','123e4567-e89b-42d3-a456-426614174000'),/Permission denied/);
 assert.deepEqual(checked,['Security:manage','NamedCredential:manage']);
 assert.equal(dbTouched,false);
 checked=[];
 const noSecurity={
  require:async(_tenant:string,_user:string,resource:string)=>{
   checked.push(resource);
   throw Error('Permission denied');
  }
 } as unknown as RbacEngine;
 await assert.rejects(new NamedCredentialService(db,noSecurity).rotate(
  'tenant','user','123e4567-e89b-42d3-a456-426614174000'),/Permission denied/);
 assert.deepEqual(checked,['Security']);
 assert.equal(dbTouched,false);
});
