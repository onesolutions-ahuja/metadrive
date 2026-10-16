import test from 'node:test';
import assert from 'node:assert/strict';
import {
  supportedFilterOperators, examineRecordFilter, isNumericFilterField, isBooleanFilterField
} from '../apps/web/src/recordFilterMetadata.ts';

const fields = [
  { apiName: 'Name', label: 'Name', dataType: 'Text' },
  { apiName: 'Status__c', label: 'Status', dataType: 'Picklist', picklistValues: ['Open', 'Closed'] },
  { apiName: 'Amount__c', label: 'Amount', dataType: 'Currency(18,2)' },
  { apiName: 'IsActive__c', label: 'Active', dataType: 'Checkbox' },
  { apiName: 'EffectiveDate__c', label: 'Effective date', dataType: 'Date' }
];
const byName = name => fields.find(field => field.apiName === name);

test('operator options follow the shared runtime and field metadata, not domain labels', () => {
  assert.deepEqual(supportedFilterOperators(byName('Name')), ['Equals','Not Equals','Contains']);
  assert.deepEqual(supportedFilterOperators(byName('Amount__c')), ['Equals','Not Equals','Greater Than','Less Than']);
  assert.deepEqual(supportedFilterOperators(byName('EffectiveDate__c')), ['Equals','Not Equals']);
  assert.deepEqual(supportedFilterOperators(byName('IsActive__c')), ['Equals','Not Equals']);
  assert.deepEqual(supportedFilterOperators(byName('Status__c')), ['Equals','Not Equals','Contains']);
  assert.equal(isNumericFilterField(byName('Amount__c')), true);
  assert.equal(isBooleanFilterField(byName('IsActive__c')), true);
});
test('valid persisted filters continue to round-trip without translation', () => {
  const saved = [
    { field: 'Name', operator: 'Contains', value: 'Green' },
    { field: 'Amount__c', operator: 'Greater Than', value: '25.5' },
    { field: 'IsActive__c', operator: 'Equals', value: 'false' }
  ];
  saved.forEach(filter => assert.equal(examineRecordFilter(filter, fields), null));
  assert.deepEqual(saved, [
    { field: 'Name', operator: 'Contains', value: 'Green' },
    { field: 'Amount__c', operator: 'Greater Than', value: '25.5' },
    { field: 'IsActive__c', operator: 'Equals', value: 'false' }
  ]);
});
test('stale fields, incompatible operators and invalid values are shown as errors', () => {
  assert.match(examineRecordFilter({field:'Old__c',operator:'Equals',value:'a'},fields), /unavailable/);
  assert.match(examineRecordFilter({field:'Name',operator:'Greater Than',value:'7'},fields), /operator/);
  assert.match(examineRecordFilter({field:'Amount__c',operator:'Equals',value:'nope'},fields), /numeric/);
  assert.match(examineRecordFilter({field:'Amount__c',operator:'Equals',value:''},fields), /numeric/);
  assert.match(examineRecordFilter({field:'IsActive__c',operator:'Equals',value:'yes'},fields), /True or False/);
  assert.match(examineRecordFilter({field:'',operator:'Equals',value:'1'},fields), /Choose a field/);
  assert.match(examineRecordFilter('legacy filter',fields), /Invalid saved filter/);
});
