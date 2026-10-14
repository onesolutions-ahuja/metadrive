import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSetupNavigation} from '../apps/web/src/platformSetupNavigation';
import {platformNavigationEntries} from '../apps/web/src/platformWorkspaceMetadata';
test('Phase 4 Setup navigation uses registered workspace metadata',()=>{
 const nav=resolveSetupNavigation('',true);
 assert.ok(nav.length);
 const all=nav.flatMap(g=>g.items);
 assert.ok(all.includes('Object Manager'));
 assert.ok(all.includes('App Manager'));
 assert.ok(all.includes('Tenant Management'));
 assert.ok(platformNavigationEntries().some(w=>w.label==='Object Manager'));
});
test('Phase 4 Setup remains tenant restricted and searchable',()=>{
 const groups=resolveSetupNavigation('',false);
 assert.ok(groups.every(g=>g.group!=='Platform Administration'));
 assert.ok(resolveSetupNavigation('appointment',false,['Appointment Booking Connector'])
  .flatMap(g=>g.items).includes('Une Connectors'));
 const filtered=resolveSetupNavigation('Object Manager',false);
 assert.deepEqual(filtered.flatMap(g=>g.items),['Object Manager']);
});
