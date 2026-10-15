import test from 'node:test';
import assert from 'node:assert/strict';
import {appSeedDefinitions,coreSeedDefinitions,seedNewTenantCore,listAvailableSeeders,seedInstalledTenantApp} from '../src/seeders/tenant-seeders.mjs';

test('Core and installed-app seeder definitions remain separate',()=>{
  const registry=listAvailableSeeders();
  assert.equal(registry.core.id,'metadrive-core');
  assert.equal(new Set(registry.apps.map(a=>a.id)).size,registry.apps.length);
  const core=coreSeedDefinitions();
  assert.ok(core.objectDefinitions.length>0);
  assert.equal(Object.hasOwn(core.accessControlTemplates,'users'),false,'seed cannot clone sample customer users');
  assert.ok(core.sharedComponents.every(c=>c.scope==='platform'));
  for (const item of registry.apps) {
    const pkg=appSeedDefinitions(item.id);
    assert.equal(pkg.appKey,item.id);
  }
});

test('Unknown and uninstalled apps cannot seed tenant state',()=>{
  const tenant={objects:[],apps:[],pages:[],flows:[],records:{Connector_App__c:[]},
    accessControl:{profiles:[],permissionSets:[],users:[]}};
  assert.throws(()=>appSeedDefinitions('missing-package'),/Unknown/);
  assert.throws(()=>seedInstalledTenantApp(tenant,'tenant-one','whatsapp'),/App must first be installed/);
  assert.equal(tenant.objects.length,0);
});

test('App seed requires explicit tenant identity and leaves other apps untouched',()=>{
  const tenant={objects:[],apps:[],pages:[],flows:[],records:{Connector_App__c:[]},
    accessControl:{profiles:[],permissionSets:[],users:[]}};
  assert.throws(()=>seedInstalledTenantApp(tenant,'','whatsapp'),/Tenant identity/);
  assert.throws(()=>seedInstalledTenantApp(tenant,'tenant-one','missing'),/Unknown/);
});

test('Fresh Core seeding is opt-in, idempotent and never creates user data',()=>{
  const tenant={objects:[],records:{},apps:[],users:[]};
  const empty=seedNewTenantCore(tenant);
  assert.equal(empty,tenant);
  const provisioned=seedNewTenantCore(tenant,{objectApiNames:['Account']});
  assert.equal(provisioned.objects.length,1);
  assert.equal(seedNewTenantCore(provisioned,{objectApiNames:['Account']}).objects.length,1);
  assert.equal(provisioned.apps.length,0);
  assert.equal(provisioned.users.length,0);
  assert.deepEqual(provisioned.records,{});
  assert.throws(()=>seedNewTenantCore(tenant,{objectApiNames:['Nonexistent_App']}),/Unknown/);
});
