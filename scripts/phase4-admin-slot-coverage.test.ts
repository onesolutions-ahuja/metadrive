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
 assert.ok(surface.includes('item.requiredPermissions.length===1&&item.requiredPermissions[0]===definition.requiredPermission'));
 for(const [file,keys] of [
  ['AppManager.tsx',['identity','assignments','navigation-items','actions']],
  ['AppExchange.tsx',['marketplace-search','marketplace-catalog']],
  ['TenantManagement.tsx',['directory','tenant-details']]
 ] as const)for(const key of keys)assert.ok(read(file).includes('slotKey="'+key+'"'),file+' '+key);
});
test('company and object administration render inside protected page hosts',()=>{
 const source=read('setupShellPresentation.tsx');
 for(const workspace of ['company-settings','object-manager']){
  const prefix="workspace === '"+workspace+"' && (";
  assert.match(source,new RegExp('workspace="'+workspace+'"[^>]*permitted=\\{canReadMetadata\\}'),workspace);
 }
 for(const slot of protectedWorkspacePageSlots['company-settings'])
  assert.ok((slot.startsWith('field-')?read('settingsWorkspaceViews.tsx'):source)
   .includes('slotKey="'+slot+'"'),slot);
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
 for(const slot of protectedWorkspacePageSlots['tenant-management'].filter(key=>!key.startsWith('field-')))
  assert.ok(source.includes('slotKey="'+slot+'"'),'Missing tenant management slot '+slot);
});

test('integrations and automation administration use protected page slots',()=>{
 const source=read('setupShellPresentation.tsx');
 for(const [workspace,slot] of [
  ['named-credentials','credentials'],
  ['connector-settings','connector-workspace'],
  ['approval-processes','approval-workspace'],
  ['automation-settings','automation-policy']
 ]){
  assert.ok(source.includes('workspace="'+workspace+'"'),workspace);
  assert.ok(source.includes('slotKey="'+slot+'"'),slot);
 }
});

test('metadata-driven administration fields render as individual registered slots',()=>{
 const primitive=read('AdminPropertyControl.tsx');
 assert.ok(primitive.includes("slotKey={'field-'+definition.propertyKey}"));
 for(const [workspace,file] of [['app-manager','adminAppFieldMetadata.ts'],['tenant-management','adminTenantFieldMetadata.ts']] as const){
  const source=read(file);
  for(const slot of protectedWorkspacePageSlots[workspace].filter(key=>key.startsWith('field-')))
   assert.ok(source.includes("'"+slot.slice(6)+"'"),workspace+' '+slot);
 }
});

test('AppExchange marketplace search is a separate protected editable control',()=>{
 const source=read('AppExchange.tsx');
 for(const slot of protectedWorkspacePageSlots['app-exchange'])
  assert.ok(source.includes('slotKey="'+slot+'"'),'Missing app-exchange slot '+slot);
 assert.ok(protectedWorkspacePageSlots.rbac.filter(key=>key.startsWith('field-')).length>=30);
});

test('protected system metadata exposes each credential, approval and automation editor independently',()=>{
 for(const [workspace,file] of [
  ['named-credentials','NamedCredentials.tsx'],
  ['approval-processes','ApprovalProcessManager.tsx'],
  ['automation-settings','settingsWorkspaceViews.tsx']
 ] as const){
  const source=read(file);
  for(const slot of protectedWorkspacePageSlots[workspace].filter(key=>key.startsWith('field-')))
   assert.ok(source.includes('slotKey="'+slot+'"'),workspace+' '+slot);
 }
});

test('protected admin field presentation binds registered Page Builder metadata without replacing validation or actions',()=>{
 const slot=read('PlatformPageSlot.tsx');
 const control=read('AdminPropertyControl.tsx');
 for(const property of ['controlLabel','controlPlaceholder','controlHelpText'])
  assert.ok(slot.includes(property),'Missing metadata presentation property '+property);
 assert.ok(control.includes("usePlatformSlotPresentation('field-'+definition.propertyKey)"));
 assert.ok(control.includes('presentation.placeholder??definition.placeholder'));
 assert.ok(control.includes('presentation.label??definition.label'));
 assert.ok(control.includes('presentation.helpText'));
 assert.ok(control.includes('validateComponentSetting(definition,value)'));
 assert.ok(control.includes('onChange(event.target.value)'));
});

test('all registered administration field slots expose independently editable accessible presentation metadata',()=>{
 const slot=read('PlatformPageSlot.tsx');
 const control=read('AdminPropertyControl.tsx');
 for(const key of ['controlLabel','controlPlaceholder','controlHelpText','controlDescription']){
  assert.ok(slot.includes(key),'Missing protected slot presentation property '+key);
 }
 assert.ok(control.includes('presentation.description'));
 assert.ok(control.includes('presentation.helpText'));
 assert.ok(slot.includes('aria-label={typeof instance.properties.controlLabel'));
 assert.ok(control.includes("usePlatformSlotPresentation('field-'+definition.propertyKey)"));
});

test('Page Builder exposes protected administrative presentation properties before they have values',()=>{
 const editor=read('componentPropertiesView.tsx');
 assert.ok(editor.includes("typeof properties.platformSlotKey === 'string'"));
 for(const key of ['controlLabel','controlPlaceholder','controlHelpText','controlDescription'])
  assert.ok(editor.includes("'"+key+"'"),key);
 assert.ok(editor.includes('onChange={(event)=>update(key,event.target.value)}'));
});

test('admin field uses a reusable published registered control while retaining legacy-safe fallback',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../apps/web/src/custom-components/manifest.json',import.meta.url),'utf8'));
 const definition=manifest.find((item:any)=>item.apiName==='AdminField');
 assert.ok(definition);
 assert.ok(definition.surfaces.includes('platform'));
 const slot=read('PlatformPageSlot.tsx');
 assert.ok(slot.includes("findRegisteredComponent(state.libraryComponents,'AdminField','page')"));
 assert.ok(slot.includes("definition?.trustedBundled===true"));
 const control=read('AdminPropertyControl.tsx');
 assert.ok(control.includes('<RegisteredComponent definition={registered} props={fieldProps}/>'));
 assert.ok(control.includes('onChange(event.target.value)'));
 assert.ok(control.includes('validateComponentSetting(definition,value)'));
});

test('Setup shell forwards metadata and security read grants to protected workspace presentation',()=>{
 const shell=read('setupAppShell.tsx');
 const presentation=read('setupShellPresentation.tsx');
 const shared='canManageApps, canReadMetadata, canReadSecurity, canManageDashboardTerritories';
 assert.ok(shell.includes(shared),'setup shell must forward metadata permission values');
 assert.ok(presentation.includes(shared),'presentation must destructure forwarded permissions');
 for(const workspace of ['object-manager','app-manager','company-settings']) {
   assert.ok(presentation.includes('workspace="'+workspace+'"'),'protected workspace '+workspace+' must render');
 }
 assert.ok(presentation.includes('permitted={canReadMetadata}'));

});
