import test from 'node:test';
import assert from 'node:assert/strict';
import {createTenantSeedRegistry} from '../src/seeders/registry.mjs';
import {packageChecksum} from '../src/seeders/sql-package-ledger.mjs';

const coreTemplate={objects:[{apiName:'Account'}],pages:[],flows:[]};
const appCatalog={packages:[{appKey:'crm',objects:[{apiName:'Lead'}]}]};

function fakeTransaction() {
 const statements=[];
 const client={query:async (sql,args)=>{
   statements.push({sql,args});
   return {rows:[]};
 }};
 return {client,statements};
}

test('agent2: versioned Core entrypoint passes metadata and transaction client',async()=>{
 const r=createTenantSeedRegistry({coreTemplate,appCatalog});
 const {client,statements}=fakeTransaction();
 let applied=false;
 const result=await r.versionedCore(client,{tenantId:'tenant1',version:'1',apply:async (tx,definitions)=>{
   assert.equal(tx,client);
   assert.equal(definitions.objects[0].apiName,'Account');
   applied=true;
 }});
 assert.equal(applied,true);
 assert.equal(result.changed,true);
 assert.ok(statements.some(x=>x.sql.startsWith('INSERT INTO md_seed_package_versions')));
});
test('agent2: app entrypoint never installs or licenses packages automatically',async()=>{
 const registry=createTenantSeedRegistry({coreTemplate,appCatalog});
 let applied=false;
 const {client}=fakeTransaction();
 await assert.rejects(async()=>registry.versionedApp(client,{
  tenantId:'t',appKey:'unknown',version:'1',apply:async()=>{applied=true;}
 }),/not registered/);
 assert.equal(applied,false);
});
test('agent2: shared package hashes are deterministic and preserve its version identity',async()=>{
 const registry=createTenantSeedRegistry({coreTemplate,appCatalog});
 const {client,statements}=fakeTransaction();
 const definition={objects:[{apiName:'Shared__c'}]};
 await registry.versionedShared(client,{tenantId:'t',key:'shared-ui',version:'2',
   definition,apply:async()=>{}});
 const write=statements.find(x=>x.sql.startsWith('INSERT INTO md_seed_package_versions'));
 assert.deepEqual(write.args.slice(0,4),['t','shared','shared-ui','2']);
 assert.equal(write.args[4],packageChecksum(definition));
});
