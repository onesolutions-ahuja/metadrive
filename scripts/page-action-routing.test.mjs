import test from 'node:test';
import assert from 'node:assert/strict';
import { pageIsAvailableInApp, resolvePageActionRoute } from '../apps/web/src/pageActionRouting.ts';

const context = {
  objects: [{ apiName: 'Product__c' }, { apiName: 'Account' }],
  apps: [
    { apiName: 'Records', navigationPageApiNames: [] },
    { apiName: 'Kiosk', navigationPageApiNames: ['Welcome_Page'] },
    { apiName: 'Sales', navigationPageApiNames: [] }
  ],
  pages: [
    { apiName: 'Welcome_Page', pageType: 'App Page', status: 'Active' },
    { apiName: 'Sales_Panel', pageType: 'App Page', status: 'Active', activationAssignments: [{ appId: 'Sales' }] },
    { apiName: 'Old_Page', pageType: 'App Page', status: 'Draft', activationAssignments: [{ appId: 'Kiosk' }] },
    { apiName: 'Record_Page', pageType: 'Record Page', status: 'Active', activationAssignments: [{ appId: 'Kiosk' }] }
  ],
  currentAppId: 'Kiosk',
  defaultObjectApiName: 'Product__c'
};

test('legacy Navigate actions still resolve to Records object lists', () => {
  assert.deepEqual(resolvePageActionRoute({ navigationObjectApiName: 'Account' }, context),
    { kind: 'record-list', objectApiName: 'Account', appId: 'Records' });
});
test('configurable record list uses validated object and app metadata', () => {
  assert.deepEqual(resolvePageActionRoute({ navigationTargetType: 'Record List', navigationObjectApiName: 'Product__c', navigationAppId: 'Kiosk' }, context),
    { kind: 'record-list', objectApiName: 'Product__c', appId: 'Kiosk' });
  assert.throws(() => resolvePageActionRoute({ navigationObjectApiName: 'Other__c' }, context), /destination object/);
  assert.throws(() => resolvePageActionRoute({ navigationAppId: 'Unknown' }, context), /destination application/);
});
test('app home routes use the selected or current app', () => {
  assert.deepEqual(resolvePageActionRoute({ navigationTargetType: 'App Home' }, context),
    { kind: 'app-home', appId: 'Kiosk' });
  assert.deepEqual(resolvePageActionRoute({ navigationTargetType: 'App Home', navigationAppId: 'Sales' }, context),
    { kind: 'app-home', appId: 'Sales' });
});
test('app pages require active app membership from navigation or activation', () => {
  assert.equal(pageIsAvailableInApp(context.pages[0], context.apps[1]), true);
  assert.equal(pageIsAvailableInApp(context.pages[1], context.apps[2]), true);
  assert.deepEqual(resolvePageActionRoute({ navigationTargetType: 'App Page', navigationAppId: 'Sales', navigationPageApiName: 'Sales_Panel' }, context),
    { kind: 'app-page', appId: 'Sales', pageApiName: 'Sales_Panel' });
  for (const name of ['Old_Page', 'Record_Page', 'Not_Installed', 'Sales_Panel']) {
    assert.throws(() => resolvePageActionRoute({ navigationTargetType: 'App Page', navigationAppId: 'Kiosk', navigationPageApiName: name }, context), /active App Page assigned/);
  }
});
test('unrecognized destination kinds fail closed', () => {
  assert.throws(() => resolvePageActionRoute({ navigationTargetType: 'https://untrusted.example' }, context), /Unsupported navigation/);
});
