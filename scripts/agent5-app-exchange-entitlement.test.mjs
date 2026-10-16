import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import { connectorEntitlement, applyConnectorLifecycle } from '../apps/server/src/connector-app-runtime.ts';
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

test('install, licence and trial lifecycle preserve prior one-time trial and fail closed on uninstall references', () => {
  const base = {
    AppKey__c:'demo', Name:'Demo', CredentialName__c:'DEMO',
    Installed__c:false, TrialRequested__c:false, TrialUsed__c:false,
    TrialDays__c:21
  };
  const installed = applyConnectorLifecycle(base,{...base,Installed__c:true},[],[],now);
  assert.equal(installed.Installed__c,true);
  assert.equal(installed.TrialUsed__c,false);
  const trial = applyConnectorLifecycle(installed,{...installed,TrialRequested__c:true},[],[],now);
  assert.equal(trial.TrialUsed__c,true);
  assert.equal(trial.LicenceStatus__c,'Trial');
  assert.equal(applyConnectorLifecycle(trial,{...trial},[],[],now).TrialExpiresAt__c,trial.TrialExpiresAt__c);
  assert.throws(() => applyConnectorLifecycle(trial,{...trial,TrialRequested__c:true},[],[],now));
  const flows = [{apiName:'Dependency',label:'Dependent Flow',status:'Active',elements:[
    {type:'HTTP Callout',config:{namedCredentialId:'DEMO'}}
  ]}];
  assert.throws(() => applyConnectorLifecycle(trial,{...trial,Installed__c:false},[],flows,now),/Dependent Flow/);
  const uninstalled = applyConnectorLifecycle(trial,{...trial,Installed__c:false},[],[],now);
  assert.equal(uninstalled.TrialUsed__c,true);
  assert.equal(uninstalled.LicenceStatus__c,'Not Installed');
  assert.equal(applyConnectorLifecycle(uninstalled,{...uninstalled,Installed__c:true},[],[],now).TrialUsed__c,true);
});

test('duplicate package definitions never install conflicting metadata', () => {
  const tenant = {
    objects:[], apps:[], pages:[], flows:[], accessControl:{profiles:[],permissionSets:[]},
    records:{Connector_App__c:[{AppKey__c:'demo',Installed__c:true,LicenceStatus__c:'Licensed'}]}
  };
  const entry = {appKey:'demo',objects:[{apiName:'Example__c',label:'Example',kind:'Custom Object',fields:[]}]};
  const duplicate = {...entry,objects:[{...entry.objects[0],label:'Conflicting'}]};
  assert.strictEqual(applyInstallableAppPackages(tenant,{packages:[entry,duplicate]}),tenant);
  assert.equal(tenant.objects.length,0);
});

test('backend routes use tenant-scoped seeder reconciliation and reject duplicate licence records', () => {
  const source = readFileSync(new URL('../apps/server/src/index.ts', import.meta.url),'utf8');
  assert.match(source, /reconcileInstalledAppSeeds\(\s*\{ \.\.\.tenant, autoNumberSequences \}, installableAppCatalog, tenantId/);
  const routes = readFileSync(new URL('../apps/server/src/modules/integrations/connector-app-routes.ts', import.meta.url),'utf8');
  assert.match(routes, /if \(matches\.length > 1\) return res\.status\(409\)/);
});

test('duplicate package catalog entries never register optional bundles', () => {
  const tenant={records:{Connector_App__c:[{
    AppKey__c:'demo',Installed__c:true,LicenceStatus__c:'Licensed'
  }]}};
  const packages=[
    {appKey:'demo',components:[{apiName:'OneDemo'}]},
    {appKey:'demo',components:[{apiName:'OneConflictingDemo'}]}
  ];
  assert.deepEqual([...installedComponentDescriptors(tenant,{packages})],[]);
});
