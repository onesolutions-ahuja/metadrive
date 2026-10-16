import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadAppSeedCatalog} from '../src/seeders/catalog.mjs';
import {ensureBundledAppComponents} from '../src/bundled-app-components.mjs';

const catalog=loadAppSeedCatalog();
const root=resolve(fileURLToPath(new URL('../../web/src/custom-components/',import.meta.url)));
const keys=catalog.packages.map(pkg=>pkg.appKey);
const components=catalog.packages.flatMap(pkg=>(pkg.components??[]).map(item=>({owner:pkg.appKey,...item})));
const rows=keys.map(AppKey__c=>({AppKey__c,Installed__c:true,LicenceStatus__c:'Licensed'}));
const tenant={records:{Connector_App__c:rows}};

test('all installable apps use the same tenant-aware component registry in one reconciliation',()=>{
  assert.equal(new Set(keys).size,keys.length);
  assert.ok(keys.length>0,'Package catalog should not be empty');
  const originals=[{apiName:'TenantOwned',tenantId:'tenant-1',trustedBundled:false,version:3,compiledJs:'customer-source'}];
  const registered=ensureBundledAppComponents(originals,tenant,catalog,root);
  assert.equal(registered.length,originals.length+catalog.coreComponents.length+components.length);
  assert.equal(new Set(registered.map(item=>item.apiName)).size,registered.length);
  assert.strictEqual(registered[0],originals[0]);
  for(const descriptor of [...catalog.coreComponents,...components]){
    const entry=registered.find(item=>item.apiName===descriptor.apiName);
    assert.ok(entry,'Missing shared registry definition '+descriptor.apiName);
    assert.equal(entry.status,'Published');
    assert.equal(entry.trustedBundled,true);
    assert.ok(entry.compiledJs);
    assert.ok(descriptor.surfaces.every(surface=>entry.surfaces.includes(surface)));
  }
  const again=ensureBundledAppComponents(registered,tenant,catalog,root);
  assert.deepEqual(again,registered,'Reconciliation must be idempotent');
});

test('no optional app component initializes without independent installation and licence',()=>{
  const noApps=ensureBundledAppComponents([],{records:{Connector_App__c:[]}},catalog,root);
  assert.equal(noApps.length,catalog.coreComponents.length);
  for(const appKey of keys){
    const single={records:{Connector_App__c:[{AppKey__c:appKey,Installed__c:true,LicenceStatus__c:'Licensed'}]}};
    const registered=ensureBundledAppComponents([],single,catalog,root);
    const own=(catalog.packages.find(pkg=>pkg.appKey===appKey)?.components??[]);
    assert.equal(registered.length,catalog.coreComponents.length+own.length,appKey);
    for(const other of components.filter(item=>item.owner!==appKey))
      assert.ok(!registered.some(item=>item.apiName===other.apiName),other.apiName);
    for(const status of ['Expired','Unlicensed']){
      const disabled=ensureBundledAppComponents([],{records:{Connector_App__c:[{AppKey__c:appKey,Installed__c:true,LicenceStatus__c:status}]}},catalog,root);
      assert.equal(disabled.length,catalog.coreComponents.length);
    }
  }
});

test('existing app page component references resolve without rewriting customer layouts',()=>{
  const installed=ensureBundledAppComponents([],tenant,catalog,root);
  for(const pkg of catalog.packages){
    for(const page of pkg.pages??[]){
      for(const item of page.components??[]){
        if(typeof item.type!=='string'||!item.type.startsWith('Custom:'))continue;
        const apiName=item.type.slice('Custom:'.length);
        const definition=installed.find(component=>component.apiName===apiName);
        assert.ok(definition,'Missing app page component '+pkg.appKey+'/'+apiName);
        assert.ok(definition.surfaces.includes('page'),apiName);
        assert.equal(item.properties?.libraryComponentId,apiName,'Saved binding must remain stable');
        assert.ok(item.id,'Preserve component instance identity');
      }
    }
  }
});
