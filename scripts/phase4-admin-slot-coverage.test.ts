import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {protectedWorkspacePageDescriptors,protectedPageApiName,protectedWorkspacePageSlots,seedProtectedAdministrationPages} from '../apps/server/src/modules/metadata/platform-admin-pages.mjs';
const read=(name:string)=>readFileSync(new URL('../apps/web/src/'+name,import.meta.url),'utf8');
test('OneEngine protected pages expose editable component-instance slots',()=>{
 const initial=seedProtectedAdministrationPages({pages:[]});
 assert.equal(initial.pages.length,protectedWorkspacePageDescriptors.length);
 for(const d of protectedWorkspacePageDescriptors){
  const page=initial.pages.find((p:any)=>p.apiName===protectedPageApiName(d.workspace));
  assert.ok(page,d.workspace);
  assert.equal(page.scope,'platform-system');
  assert.equal(page.ownerNamespace,'MetaDrive');
  assert.deepEqual(page.requiredPermissions,[d.permission]);
  assert.equal(page.layoutMode,'template');
  assert.deepEqual(page.components.map((c:any)=>c.properties.platformSlotKey),protectedWorkspacePageSlots[d.workspace]);
  assert.equal(new Set(page.components.map((c:any)=>c.id)).size,page.components.length);
 }
 assert.equal(seedProtectedAdministrationPages(initial),initial);
});
test('Tenant-customised protected pages are never reset by re-seeding',()=>{
 const initial=seedProtectedAdministrationPages({pages:[]});
 const customised={...initial.pages[0],components:[],updatedAt:'2026-10-15T00:00:00.000Z'};
 const next=seedProtectedAdministrationPages({pages:[customised,...initial.pages.slice(1)]});
 assert.equal(next.pages[0],customised);
});
test('admin slot presentation uses the existing workspace and RBAC instead of another engine',()=>{
 const surface=read('PlatformWorkspaceSurface.tsx');
 assert.ok(surface.includes('PlatformPageSlotsProvider'));
 assert.ok(surface.includes('Array.isArray(item.requiredPermissions)&&item.requiredPermissions.length>0'));
 for(const [file,keys] of [
  ['AppManager.tsx',['identity','assignments','navigation-items','actions']],
  ['AppExchange.tsx',['marketplace-search','marketplace-catalog']],
  ['TenantManagement.tsx',['directory','tenant-details']]
 ] as const)for(const key of keys)assert.ok(read(file).includes('slotKey="'+key+'"'),file+' '+key);
});
test('company and object administration render inside protected page hosts',()=>{
 const source=read('setupAppShell.tsx');
 for(const workspace of ['company-settings','object-manager']){
  const prefix="workspace === '"+workspace+"' && (";
  assert.ok(source.includes('workspace="'+workspace+'" permitted={canReadMetadata}'),workspace);
 }
 for(const slot of protectedWorkspacePageSlots['company-settings'])
  assert.ok(source.includes('slotKey="'+slot+'"'),slot);
 assert.ok(source.includes('<PlatformPageSlot slotKey="audit">'));
});

test('Object Manager uses every seeded independent page slot',()=>{
 const source=read('objectManagerView.tsx');
 for(const slot of protectedWorkspacePageSlots['object-manager'])
  assert.ok(source.includes('slotKey="'+slot+'"'),'Missing editable object slot '+slot);
});

test('RBAC screen renders through all seeded protected page slots',()=>{
 const source=read('permissionsView.tsx');
 for(const slot of protectedWorkspacePageSlots.rbac)
  assert.ok(source.includes('slotKey="'+slot+'"'),'Missing RBAC slot '+slot);
});

test('tenant management has independently editable detail, domain, usage and recovery slots',()=>{
 const source=read('TenantManagement.tsx');
 for(const slot of protectedWorkspacePageSlots['tenant-management'])
  assert.ok(source.includes('slotKey="'+slot+'"'),'Missing tenant management slot '+slot);
});

test('integrations and automation administration use protected page slots',()=>{
 const source=read('setupAppShell.tsx');
 for(const [workspace,slot] of [
  ['named-credentials','credentials'],
  ['approval-processes','approval-workspace'],
  ['automation-settings','automation-policy']
 ]){
  assert.ok(source.includes('workspace="'+workspace+'"'),workspace);
  assert.ok(source.includes('slotKey="'+slot+'"'),slot);
 }
});
