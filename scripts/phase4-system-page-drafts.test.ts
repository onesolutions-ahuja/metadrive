import test from 'node:test';
import assert from 'node:assert/strict';
import {createSystemPageDrafts,systemPageApiName,systemPageWorkspaceId} from '../apps/web/src/platformSystemPageDrafts';
test('all registered administration pages have separate editable component metadata',()=>{
 const pages=createSystemPageDrafts([]);
 assert.equal(pages.length,7);
 assert.equal(new Set(pages.map(p=>p.apiName)).size,7);
 for(const page of pages){
  assert.equal(page.status,'Draft');
  assert.equal(page.layoutMode,'free-canvas');
  assert.deepEqual(page.devices,['Desktop','Phone']);
  assert.ok(page.components.length>=2);
  assert.ok(page.components.every(c=>c.properties && c.id));
  assert.ok(systemPageWorkspaceId(page.apiName));
 }
});
test('system pages are idempotent, do not replace tenant authored metadata or activate privileged pages',()=>{
 const original=createSystemPageDrafts([]);
 assert.deepEqual(createSystemPageDrafts(original),[]);
 const existing={...original[0],label:'Custom owner page'};
 assert.equal(createSystemPageDrafts([existing]).some(p=>p.apiName===existing.apiName),false);
 assert.equal(systemPageWorkspaceId('Unknown'),undefined);
 assert.ok(systemPageApiName('tenant-management').startsWith('MetaDriveSystem_'));
});
