import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthenticationService } from './authentication.js';
import { RbacEngine } from './rbac-engine.js';
import { ObjectDefinitionService } from './object-definition.js';
import type { SqlPersistence } from './sql-persistence.js';

test('authentication hashes and verifies passwords without storing plain text', async () => {
  const queries: Array<{ sql: string; args: unknown[] }> = [];
  const db = { query: async (sql: string, args: unknown[]) => { queries.push({ sql, args }); return { rows: [] }; } } as unknown as SqlPersistence;
  const auth = new AuthenticationService(db);
  const encoded = await auth.hashPassword('LongRandomPassphrase!2026');
  assert.equal(await auth.verifyPassword('LongRandomPassphrase!2026', encoded), true);
  assert.equal(await auth.verifyPassword('incorrect-password', encoded), false);
  assert.equal(encoded.includes('LongRandomPassphrase!2026'), false);
});
test('RBAC fails closed without a matching grant', async () => {
  const db = { query: async () => ({ rows: [{ ok: false }] }) } as unknown as SqlPersistence;
  const rbac = new RbacEngine(db);
  assert.equal(await rbac.allowed('tenant', 'user', 'Product__c', 'read'), false);
  await assert.rejects(() => rbac.require('tenant', 'user', 'Product__c', 'read'), /Permission denied/);
});
test('metadata registration uses parameters and rejects invalid names', async () => {
  const calls: Array<{sql:string;args:unknown[]}> = [];
  const db = { query: async (sql: string, args: unknown[]) => { calls.push({sql,args}); return {rows:[{id:'new-object'}]}; } } as unknown as SqlPersistence;
  const service = new ObjectDefinitionService(db);
  await assert.rejects(() => service.register('tenant','abc;DROP TABLE', 'Bad'), /Invalid object API name/);
  await service.register('tenant','Product__c', 'Product');
  assert.match(calls[0].sql, /\$1/);
  assert.equal(calls[0].args[1], 'Product__c');
});

test('explicit deny takes precedence over a grant', async () => {
  const db={query:async()=>({rows:[{allow_granted:true,deny_granted:true}]})} as unknown as SqlPersistence;
  assert.equal(await new RbacEngine(db).allowed('tenant','user','Product__c','read'),false);
});
test('SQL record CRUD rejects fields not registered in metadata', async () => {
  const db={
    query:async(sql:string)=> sql.includes('FROM md_field_definitions')
      ?{rows:[{api_name:'Price',data_type:'number',related_object:null,required:false}]}
      :{rows:[],rowCount:0}
  } as unknown as SqlPersistence;
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  const {RecordEngine}=await import('./record-engine.js');
  await assert.rejects(
    ()=>new RecordEngine(db,rbac).create('tenant','user','Product__c',{Unexpected:1}),
    /Unknown field/
  );
  await assert.rejects(
    ()=>new RecordEngine(db,rbac).create('tenant','user','Product__c',{Price:'not a number'}),
    /Invalid number/
  );
});
