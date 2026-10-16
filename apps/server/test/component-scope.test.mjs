import assert from 'node:assert/strict';
import test from 'node:test';
import {libraryComponentVisible as visible,libraryComponentEditable as editable}
  from '../src/component-scope.mjs';

test('tenant private components are never visible or editable from another tenant',()=>{
  const owned={apiName:'CustomTile',tenantId:'tenant-a',trustedBundled:false};
  assert.equal(visible(owned,'tenant-a',['tenant-a','tenant-b']),true);
  assert.equal(editable(owned,'tenant-a',['tenant-a','tenant-b']),true);
  assert.equal(visible(owned,'tenant-b',['tenant-a','tenant-b']),false);
  assert.equal(editable(owned,'tenant-b',['tenant-a','tenant-b']),false);
  assert.equal(visible(owned,'missing',['tenant-a','tenant-b']),false);
});

test('bundled platform primitives are shared read-only, never tenant-mutable',()=>{
  const bundled={apiName:'GenericGrid',trustedBundled:true};
  assert.equal(visible(bundled,'tenant-b',['tenant-a','tenant-b']),true);
  assert.equal(editable(bundled,'tenant-b',['tenant-a','tenant-b']),false);
});

test('legacy unowned components are grandfathered only for the original single tenant',()=>{
  const legacy={apiName:'LegacyCustom',trustedBundled:false};
  assert.equal(visible(legacy,'tenant-a',['tenant-a']),true);
  assert.equal(editable(legacy,'tenant-a',['tenant-a']),true);
  assert.equal(visible(legacy,'tenant-b',['tenant-a','tenant-b']),false);
  assert.equal(visible(legacy,'tenant-a',['tenant-a','tenant-b']),false);
  assert.equal(editable(legacy,'tenant-a',['tenant-a','tenant-b']),false);
});

test('no anonymous, missing or unregistered tenant can enumerate component code',()=>{
  const component={tenantId:'tenant-a'};
  assert.equal(visible(component,'',['tenant-a']),false);
  assert.equal(visible(component,'tenant-a',[]),false);
  assert.equal(visible(null,'tenant-a',['tenant-a']),false);
  assert.equal(editable(null,'tenant-a',['tenant-a']),false);
});
