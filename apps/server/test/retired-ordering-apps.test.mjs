import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyInstallableAppPackages } from '../src/installable-app-packages.mjs';

test('retired Kiosk and POS packages are absent from the installable catalog', () => {
  const catalog = JSON.parse(readFileSync(new URL('../data/installable-app-packages.json', import.meta.url)));
  assert.equal(catalog.packages.some(pkg => ['kiosk', 'pos'].includes(pkg.appKey)), false);
});

test('package installation does not delete tenant-owned metadata by retired app names', () => {
  const tenant = {
    apps: [{apiName:'POSApp'}, {apiName:'KioskApp'}],
    pages: [{apiName:'UNE_POS'}, {apiName:'UNE_KIOSK'}],
    flows: [{apiName:'KIOSK_CART_ADD'}, {apiName:'POS_CASH_SETTLE'}],
    objects: [{apiName:'Sale__c'}, {apiName:'Product'}],
    records: {Connector_App__c:[{AppKey__c:'pos'}, {AppKey__c:'kiosk'}], Sale__c:[{Id:'sale1'}]},
    accessControl: {profiles:[]}
  };
  assert.deepEqual(applyInstallableAppPackages(tenant, {packages:[]}), tenant);
});
