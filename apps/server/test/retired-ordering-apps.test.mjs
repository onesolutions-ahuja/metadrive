import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyInstallableAppPackages } from '../src/installable-app-packages.mjs';

test('Kiosk and POS catalog entries have been retired', () => {
  const catalog = JSON.parse(readFileSync(new URL('../data/installable-app-packages.json', import.meta.url)));
  assert.equal(catalog.packages.some(pkg => ['kiosk', 'pos'].includes(pkg.appKey)), false);
});

test('retirement removes only ordering pages, apps, flows and connector records', () => {
  const keep = { apiName: 'REPORT_FLOW' };
  const tenant = {
    apps: [{apiName:'POSApp'}, {apiName:'KioskApp'}, {apiName:'ServiceApp',
      navigationPageApiNames:['UNE_POS','Dashboard'],
      navigationItems:['UNE_KIOSK','Account']}],
    pages: [{apiName:'UNE_POS'}, {apiName:'UNE_KIOSK'}, {apiName:'Dashboard',
      activationAssignments:[{appId:'POSApp'},{appId:'ServiceApp'}]}],
    flows: [{apiName:'KIOSK_CART_ADD'}, {apiName:'POS_CASH_SETTLE'}, keep],
    objects: [{apiName:'Sale__c'}, {apiName:'Product'}],
    records: {Connector_App__c:[{AppKey__c:'pos'}, {AppKey__c:'kiosk'}, {AppKey__c:'whatsapp'}],
      Sale__c:[{Id:'sale1'}]},
    accessControl: {profiles:[]}
  };
  const result = applyInstallableAppPackages(tenant, {packages:[]});
  assert.deepEqual(result.apps.map(x=>x.apiName), ['ServiceApp']);
  assert.deepEqual(result.apps[0].navigationPageApiNames, ['Dashboard']);
  assert.deepEqual(result.apps[0].navigationItems, ['Account']);
  assert.deepEqual(result.pages.map(x=>x.apiName), ['Dashboard']);
  assert.deepEqual(result.pages[0].activationAssignments, [{appId:'ServiceApp'}]);
  assert.deepEqual(result.flows, [keep]);
  assert.deepEqual(result.records.Connector_App__c, [{AppKey__c:'whatsapp'}]);
  assert.deepEqual(result.records.Sale__c, [{Id:'sale1'}]);
  assert.deepEqual(result.objects, tenant.objects);
});
