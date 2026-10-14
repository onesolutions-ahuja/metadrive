import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bundledLegacyMigrationDecision} from '../src/bundled-component-migration.mjs';
import {ensureBundledAppComponents} from '../src/bundled-app-components.mjs';

test('unmodified global legacy component can be adopted without name special cases', () => {
  const legacy = {apiName:'AnyBusinessComponent',jsxSource:'export default function X() {}',cssSource:'.x{}'};
  assert.equal(bundledLegacyMigrationDecision(legacy,'AnyBusinessComponent',legacy.jsxSource,legacy.cssSource),'adopt-current');
  assert.equal(bundledLegacyMigrationDecision({...legacy,tenantId:'tenant-1'},'AnyBusinessComponent',legacy.jsxSource,legacy.cssSource),'preserve');
  assert.equal(bundledLegacyMigrationDecision({...legacy,jsxSource:'customer edit'},'AnyBusinessComponent',legacy.jsxSource,legacy.cssSource),'preserve');
});

test('retirement is catalog-driven and preserves tenant components', () => {
  const shared = {apiName:'KioskOldBundle',trustedBundled:true,tenantId:null};
  const tenantOwned = {...shared,tenantId:'tenant-1'};
  const customer = {...shared,trustedBundled:false};
  const other = {apiName:'AnotherBundle',trustedBundled:true,tenantId:null};
  const library = [shared,tenantOwned,customer,other];
  const catalog = {packages:[],retiredTrustedComponentPrefixes:['Kiosk']};
  assert.deepEqual(ensureBundledAppComponents(library,{records:{}},catalog,'.'),[tenantOwned,customer,other]);
  assert.deepEqual(ensureBundledAppComponents(library,{records:{}},{packages:[]},'.'),library);
});
