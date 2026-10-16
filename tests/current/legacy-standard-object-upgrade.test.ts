import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeMissingSeededCoreObjects} from '../../apps/server/src/seeders/merge-core-standard-objects.js';
import {restoreMissingCoreAdministratorGrants} from '../../apps/server/src/seeders/repair-core-administrator-grants.js';

const baseline=JSON.parse(readFileSync('apps/server/data/platform-metadata.json','utf8')).objects;
const fullGrant={read:true,create:true,edit:true,delete:true,viewAll:true,modifyAll:true};

test('legacy SQL tenants receive missing Product metadata and referenced Standard Objects',()=>{
 const account=structuredClone(baseline.find((o:{apiName:string})=>o.apiName==='Account'));
 account.label='My customised Accounts';
 const custom={apiName:'My_Own_Thing__c',kind:'Custom Object',label:'Tenant data'};
 const stored=[account,custom];
 const merged=mergeMissingSeededCoreObjects(stored,baseline,(object:any)=>structuredClone(object));
 for(const name of ['Product','ProductCategory','UnitOfMeasure','Tax','PriceList'])
   assert.ok(merged.some(object=>object.apiName===name),'Missing Core Object '+name);
 assert.equal(merged.find(object=>object.apiName==='Account'),account);
 assert.equal(merged.find(object=>object.apiName==='Account')?.label,'My customised Accounts');
 assert.equal(merged.find(object=>object.apiName==='My_Own_Thing__c'),custom);
 assert.equal(merged.some(object=>object.apiName==='Renewal__c'),false,'Optional Custom Objects never auto-install');
 assert.deepEqual(stored,[account,custom], 'Source state must not mutate');
 const again=mergeMissingSeededCoreObjects(merged,baseline,(object:any)=>structuredClone(object));
 assert.equal(again,merged,'Second seeding is strictly idempotent');
 assert.equal(new Set(merged.map(item=>item.apiName)).size,merged.length);
 const grants=restoreMissingCoreAdministratorGrants({},merged,fullGrant);
 assert.equal(grants.Product.read,true,'Product must be readable through OneEngine policy');
 assert.equal(grants.ProductCategory.read,true);
});

test('existing Core and shared dependencies are never overwritten',()=>{
 const existing=[{apiName:'Account',kind:'Standard Object',label:'Edited'}];
 const seeds=[{apiName:'Account',kind:'Standard Object',label:'Baseline'},
   {apiName:'Shared_Connector__c',kind:'Custom Object',label:'Shared'},
   {apiName:'Optional_App__c',kind:'Custom Object',label:'Not installed'}];
 const merged=mergeMissingSeededCoreObjects(existing,seeds,x=>x,new Set(['Shared_Connector__c']));
 assert.equal(merged[0],existing[0]);
 assert.ok(merged.some(x=>x.apiName==='Shared_Connector__c'));
 assert.ok(!merged.some(x=>x.apiName==='Optional_App__c'));
});
