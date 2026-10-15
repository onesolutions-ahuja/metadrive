import assert from 'node:assert/strict';
import test from 'node:test';
import { connectorEntitlement } from '../apps/server/src/connector-app-runtime.ts';
import { installedComponentDescriptors } from '../apps/server/src/bundled-app-components.mjs';
import { applyInstallableAppPackages } from '../apps/server/src/installable-app-packages.mjs';

const now = new Date('2026-10-15T12:00:00.000Z');
const credential = { id: 'one', name: 'SHARED' };
const licensed = {
  Name: 'App A', CredentialName__c: 'SHARED', Installed__c: true,
  LicenceExpiresAt__c: '2026-11-15T12:00:00.000Z'
};

test('AppExchange denies ambiguous credential ownership independent of record order', () => {
  const duplicate = { ...licensed, Name: 'App B', Installed__c: false };
  for (const apps of [[licensed, duplicate], [duplicate, licensed]]) {
    const result = connectorEntitlement(apps, credential, now);
    assert.equal(result.allowed, false);
    assert.equal(result.managed, true);
    assert.match(result.message, /Multiple AppExchange installations/);
  }
});

test('AppExchange preserves licensed, uninstalled and unmanaged credential semantics', () => {
  assert.equal(connectorEntitlement([licensed], credential, now).allowed, true);
  assert.equal(connectorEntitlement([{...licensed, Installed__c: false}], credential, now).allowed, false);
  assert.deepEqual(connectorEntitlement([licensed], {id:'other',name:'OTHER'}, now), {
    allowed:true, message:'', managed:false
  });
});

test('optional app components require one unambiguous installed and licensed record', () => {
  const pkg = { appKey: 'demo', components: [{ apiName:'OneDemo' }] };
  const catalog = { packages: [pkg] };
  const valid = { AppKey__c:'demo', Installed__c:true, LicenceStatus__c:'Licensed' };
  const components = records => [...installedComponentDescriptors(
    {records:{Connector_App__c:records}}, catalog
  )].map(component => component.apiName);
  assert.deepEqual(components([valid]), ['OneDemo']);
  assert.deepEqual(components([valid, {...valid, Installed__c:false}]), []);
  assert.deepEqual(components([{...valid, LicenceStatus__c:'Expired'}]), []);
  assert.deepEqual(components([]), []);
});

test('duplicate app installation records cannot seed package metadata', () => {
  const tenant = {
    objects: [], apps: [], pages: [], flows: [],
    records: {Connector_App__c: [
      {AppKey__c:'demo', Installed__c:true, LicenceStatus__c:'Licensed'},
      {AppKey__c:'demo', Installed__c:false, LicenceStatus__c:'Not Installed'}
    ]},
    accessControl: {profiles:[], permissionSets:[]}
  };
  const catalog = {packages:[{appKey:'demo',objects:[{
    apiName:'OneDemo__c',label:'One Demo',kind:'Custom Object',fields:[]
  }]}]};
  assert.strictEqual(applyInstallableAppPackages(tenant,catalog),tenant);
  assert.equal(tenant.objects.length,0);
});
