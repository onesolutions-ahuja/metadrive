import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeSharedDependency} from '../src/seeders/shared.mjs';
import {createTenantSeedRegistry} from '../src/seeders/registry.mjs';

test('agent2: shared seeding preserves customer state, overrides and idempotency',()=>{
 const tenant={objects:[{apiName:'Account',label:'Tenant edit'}],pages:[],flows:[],
  libraryComponents:[{apiName:'OneCard',label:'Custom'}],records:{Account:[{Id:'a'}]},
  accessControl:{permissionSets:[{apiName:'OneEngine',permissions:[]}]}};
 const dependency={objects:[{apiName:'Account',label:'Seed'},{apiName:'SharedItem__c'}],
  libraryComponents:[{apiName:'OneCard',label:'Seed'},{apiName:'OneTable'}]};
 const once=mergeSharedDependency(tenant,dependency);
 assert.deepEqual(once.records,tenant.records);
 assert.deepEqual(once.accessControl,tenant.accessControl);
 assert.equal(once.objects.find(x=>x.apiName==='Account').label,'Tenant edit');
 assert.equal(once.libraryComponents.find(x=>x.apiName==='OneCard').label,'Custom');
 assert.equal(once.libraryComponents.length,2);
 assert.deepEqual(mergeSharedDependency(once,dependency),once);
});
test('agent2: shared dependency rejects credentials, customer data and permissions',()=>{
 for(const key of ['records','users','namedCredentials','accessControl','securityAudit'])
  assert.throws(()=>mergeSharedDependency({}, {[key]:[]}),/may not seed/);
});
test('agent2: registry supports shared seeds independent of app install',()=>{
 const r=createTenantSeedRegistry({coreTemplate:{objects:[],pages:[],flows:[]},appCatalog:{packages:[]}});
 assert.equal(r.installShared({objects:[],pages:[],flows:[]},
  {objects:[{apiName:'Shared__c'}]}).objects[0].apiName,'Shared__c');
});
