import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pageBuilderPaletteCategories, getPageBuilderComponentCategories, createComponentPreviewProps
} from '../apps/web/src/pageBuilderPalette.ts';
import { needsMetadataComponentRuntime } from '../apps/web/src/pageComponentBindings.ts';

test('builder palette exposes only reusable functional groups', () => {
  assert.deepEqual([...pageBuilderPaletteCategories], [
    'All Components', 'Favourites', 'Layout', 'Display', 'Inputs', 'Data', 'Navigation'
  ]);
  assert.deepEqual(getPageBuilderComponentCategories('SectionContainer', 'Section', ''), ['Layout']);
  assert.deepEqual(getPageBuilderComponentCategories('CustomerPicker', 'Select customer', ''), ['Inputs']);
  assert.deepEqual(getPageBuilderComponentCategories('SalesReport', 'Chart', ''), ['Data']);
  assert.deepEqual(getPageBuilderComponentCategories('RunButton', 'Run button', ''), ['Navigation']);
  assert.deepEqual(getPageBuilderComponentCategories('UnknownWidget', 'Unknown', ''), ['Display']);
});

test('a business-specific name alone never introduces an engine-defined palette category', () => {
  for (const name of ['KioskExperience','TillRegister','AppointmentPlanner','SalesWorkspace']) {
    const matches = getPageBuilderComponentCategories(name,name,'');
    assert(matches.length > 0);
    assert(matches.every(category => pageBuilderPaletteCategories.includes(category)));
  }
});

test('generic Object binding detection supports new apps without source changes', () => {
  for (const key of [
    'objectApiName', 'cartObjectApiName', 'customerObjectApiName',
    'appointmentObjectApiName', 'inventoryObjectApiName', 'inspectionObjectApiName'
  ]) {
    assert.equal(needsMetadataComponentRuntime({ [key]: 'CustomObject__c' }), true, key);
    assert.equal(needsMetadataComponentRuntime({ [key]: '   ' }), false, key);
  }
  assert.equal(needsMetadataComponentRuntime({displayApiName:'Unrelated'}), false);
  assert.equal(needsMetadataComponentRuntime({objectApiName:10}), false);
});

test('Flow-only component events still activate the shared runtime', () => {
  assert.equal(needsMetadataComponentRuntime({actionFlows:{
    submit:{actionType:'Flow',flowApiName:'Save_Appointment'}
  }}),true);
  assert.equal(needsMetadataComponentRuntime({actionFlows:{}}),false);
  assert.equal(needsMetadataComponentRuntime({actionFlows:'invalid'}),false);
});

test('component preview remains safe and independent of a business application', () => {
  const preview = createComponentPreviewProps('AppointmentPicker','Appointment Picker');
  assert.equal(preview.preview,true);
  assert.equal(preview.disabled,true);
  assert.deepEqual(preview.items,[]);
  assert.deepEqual(preview.records,[]);
  assert.equal(preview.onAction(),undefined);
  assert.equal(preview.onChange(),undefined);
});
