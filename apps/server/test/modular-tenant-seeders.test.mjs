import test from 'node:test';
import assert from 'node:assert/strict';
import {coreMetadataSeed, mergeCoreMetadata, initializeTenantCore} from '../src/seeders/core.mjs';
import {installedAppSeed, listSeedPackages} from '../src/seeders/apps.mjs';
import {createTenantSeedRegistry} from '../src/seeders/registry.mjs';

test('Core metadata seeds never copy users, customer records or secrets', () => {
  const template = {objects:[{apiName:'Account',fields:[]}],pages:[],flows:[],
    users:[{id:'secret'}], records:{Account:[{Id:'customer'}]},
    namedCredentials:[{value:'secret'}], integrationConnections:[{token:'secret'}],
    accessControl:{profiles:[]}};
  const seed = coreMetadataSeed(template);
  assert.equal(seed.objects[0].apiName,'Account');
  assert.deepEqual(seed.records,{});
  assert.deepEqual(seed.users,[]);
  assert.deepEqual(seed.namedCredentials,[]);
  assert.deepEqual(seed.integrationConnections,[]);
  assert.equal(template.records.Account.length,1);
});

test('Core re-seeding is idempotent and preserves tenant changes',()=>{
  const seed={objects:[{apiName:'Account',fields:[]}],pages:[],flows:[]};
  const tenant={objects:[{apiName:'Account',fields:[{apiName:'Custom__c'}]}],pages:[],flows:[]};
  const once=mergeCoreMetadata(tenant,seed);
  const twice=mergeCoreMetadata(once,seed);
  assert.deepEqual(twice,once);
  assert.equal(once.objects[0].fields[0].apiName,'Custom__c');
});

test('Uninstalled optional packages never seed app metadata',()=>{
  const catalog={packages:[{appKey:'dashboard',objects:[{apiName:'Dashboard',kind:'Custom Object',label:'Dashboards'}]}]};
  const tenant={objects:[],pages:[],apps:[],flows:[],records:{Connector_App__c:[]}};
  assert.strictEqual(installedAppSeed(tenant,catalog,'tenant-a','dashboard'),tenant);
  assert.equal(listSeedPackages(catalog)[0].appKey,'dashboard');
});

test('Registry exposes independent Core and tenant app entry points',()=>{
  const registry=createTenantSeedRegistry({coreTemplate:{objects:[],pages:[],flows:[]},appCatalog:{packages:[]}});
  assert.deepEqual(registry.availableApps(),[]);
  assert.deepEqual(registry.freshCore().records,{});
});

test('Fresh tenant Core bootstrap strips nested ACL identities and arbitrary source data',()=>{
  const template={
    objects:[{apiName:'Account',fields:[]}],pages:[],flows:[],
    records:{Account:[{Id:'customer'}]}, users:[{id:'secret'}],
    accessControl:{profiles:[{id:'standard-user'}],users:[{id:'sample-login'}]},
    namedCredentials:[{value:'secret'}], customerRecords:[{Id:'unexpected'}],
    refreshSessions:[{tokenHash:'sample'}], revokedAccessTokens:{sample:true}
  };
  const initial=initializeTenantCore(template);
  assert.equal(initial.objects.length,1);
  assert.deepEqual(initial.records,{});
  assert.deepEqual(initial.users,[]);
  assert.deepEqual(initial.accessControl.users,[]);
  assert.deepEqual(initial.namedCredentials,[]);
  assert.equal('customerRecords' in initial,false);
  assert.equal('refreshSessions' in initial,false);
  assert.equal('revokedAccessTokens' in initial,false);
  const authorized=initializeTenantCore(template,{authorizedUserIds:['sample-login']});
  assert.deepEqual(authorized.accessControl.users,[{id:'sample-login'}]);
  assert.deepEqual(authorized.users,[]);
  assert.deepEqual(authorized.records,{});

});
