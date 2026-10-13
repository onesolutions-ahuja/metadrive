import assert from 'node:assert/strict';
import test from 'node:test';
import { filterPageComponentRecords, needsMetadataComponentRuntime } from '../apps/web/src/pageComponentBindings.ts';
import {
  resolvePageComponentStyle, updateLayoutSettings
} from '../apps/web/src/pageComponentLayout.ts';

const fields = [
  { apiName: 'Name', label: 'Name', dataType: 'Text', required: false, unique: false },
  { apiName: 'Price__c', label: 'Price', dataType: 'Currency(18,2)', required: false, unique: false },
  { apiName: 'Available__c', label: 'Available', dataType: 'Checkbox', required: false, unique: false }
];
const records = [
  { Name: 'Burger', Price__c: 8, Available__c: true },
  { Name: 'Pizza', Price__c: 12, Available__c: false }
];

test('old component metadata renders with no migration and can round-trip unchanged', () => {
  const legacy = { title: 'Till', accentColor: '#126be5', objectApiName: 'Product__c' };
  const reopened = JSON.parse(JSON.stringify(legacy));
  assert.equal(resolvePageComponentStyle(reopened, 'Custom:TillSalesWorkspace').padding, undefined);
  assert.deepEqual(reopened, legacy);
  assert.equal(needsMetadataComponentRuntime(reopened), true);
});

test('universal appearance respects visual defaults, explicit layout overrides and device inheritance', () => {
  let properties = { visualStyle: { backgroundColor: '#ffffff', padding: 10, borderRadius: 12, borderColor: '#dddddd', borderWidth: 1 } };
  properties = updateLayoutSettings(properties, 'Base', 'backgroundColor', '#fefefe');
  properties = updateLayoutSettings(properties, 'Tablet', 'padding', 16);
  properties = updateLayoutSettings(properties, 'Phone', 'padding', 5);
  const reopened = JSON.parse(JSON.stringify(properties));
  const desktop = resolvePageComponentStyle(reopened, 'Custom:TillSalesWorkspace', 'Desktop');
  const tablet = resolvePageComponentStyle(reopened, 'Custom:TillSalesWorkspace', 'Tablet');
  const phone = resolvePageComponentStyle(reopened, 'Custom:TillSalesWorkspace', 'Phone');
  assert.equal(desktop.backgroundColor, '#fefefe');
  assert.equal(desktop.padding, 10);
  assert.equal(tablet.padding, 16);
  assert.equal(phone.padding, 5);
  assert.equal(phone.borderRadius, 12);
  assert.equal(phone.borderWidth, 1);
  assert.equal(phone.borderColor, '#dddddd');
});

test('existing filters allow only matching authorized object fields and fail closed', () => {
  const filters = [{ field: 'Price__c', operator: 'Greater Than', value: '9' },
    { field: 'Available__c', operator: 'Equals', value: 'false' }];
  assert.deepEqual(filterPageComponentRecords(records, filters, fields).map(x => x.Name), ['Pizza']);
  assert.equal(filterPageComponentRecords(records, [], fields).length, 2);
  assert.equal(filterPageComponentRecords(records, undefined, fields).length, 2);
  assert.deepEqual(filterPageComponentRecords(records, [{ field: 'Private__c', operator: 'Not Equals', value: '' }], fields), []);
  assert.deepEqual(filterPageComponentRecords(records, [{ field: 'Price__c', operator: 'Greater Than', value: 'bad' }], fields), []);
  assert.deepEqual(filterPageComponentRecords(records, [{ field: 'Price__c', operator: 'Unknown', value: '3' }], fields), []);
  assert.deepEqual(filterPageComponentRecords(records, { field: 'Name', operator: 'Equals', value: 'Burger' }, fields), []);
  assert.deepEqual(filterPageComponentRecords([{ Name: 'Burger' }], [{field:'Price__c',operator:'Not Equals',value:'0'}],fields), []);
});

test('action-only custom component receives the existing Flow runtime without requesting an object', () => {
  assert.equal(needsMetadataComponentRuntime({ actionFlows: { clicked: { actionType: 'Flow', flowApiName: 'MY_FLOW' } } }), true);
  assert.equal(needsMetadataComponentRuntime({ actionFlows: { clicked: { actionType: 'Navigate', navigationTargetType: 'App Page' } } }), true);
  assert.equal(needsMetadataComponentRuntime({ actionFlows: {} }), false);
  assert.equal(needsMetadataComponentRuntime({ title: 'Simple text' }), false);
});

test('registered components retain client-specific properties without modifying their shared definition', () => {
  const template = { title: 'Till', visualStyle: { borderRadius: 8 }, actionFlows: { checkout: { flowApiName: 'TILL_CHECKOUT' } } };
  const first = { ...template, layoutStyle: { backgroundColor: '#ffffff' } };
  const second = { ...template, layoutStyle: { backgroundColor: '#ddeeff' } };
  const pages = JSON.parse(JSON.stringify([first, second]));
  assert.equal(resolvePageComponentStyle(pages[0], 'Custom:TillSalesWorkspace').backgroundColor, '#ffffff');
  assert.equal(resolvePageComponentStyle(pages[1], 'Custom:TillSalesWorkspace').backgroundColor, '#ddeeff');
  assert.equal(template.layoutStyle, undefined);
  assert.equal(pages[0].actionFlows.checkout.flowApiName, 'TILL_CHECKOUT');
});
