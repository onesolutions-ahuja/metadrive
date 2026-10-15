import test from 'node:test';
import assert from 'node:assert/strict';
import {
 protectedWorkspacePageDescriptors,protectedAdministrationPage,protectedAdministrationSlotComponents,protectedPageApiName,seedProtectedAdministrationPages,
 validateProtectedAdministrationPageUpdate,isProtectedAdministrationPage
} from '../src/modules/metadata/platform-admin-pages.mjs';
const original={pages:[{apiName:'Tenant_Landing',status:'Active',components:[{id:'custom'}]}]};
test('Phase 4 seeds all protected Page Builder layouts without modifying tenant pages',()=>{
 const seeded=seedProtectedAdministrationPages(original);
 assert.equal(seeded.pages.length,11);
 assert.equal(seeded.pages[0],original.pages[0]);
 assert.equal(protectedWorkspacePageDescriptors.length,10);
 assert.equal(new Set(seeded.pages.map(p=>p.apiName)).size,11);
 assert.ok(seeded.pages.slice(1).every(p=>p.scope==='platform-system'&&p.ownerNamespace==='MetaDrive'
 &&p.definitionVersion>=2&&p.overridePolicy==='presentation-only'
 &&p.status==='Active'&&p.pageType==='App Page'));
 assert.ok(seeded.pages.slice(1).every(p=>p.components.length>0&&p.layoutMode==='template'));
 assert.strictEqual(seedProtectedAdministrationPages(seeded),seeded);
});
test('a system page cannot be silently overwritten during an upgrade',()=>{
 const seeded=seedProtectedAdministrationPages(original);
 const system=seeded.pages.find(p=>p.apiName===protectedPageApiName('rbac'));
 const altered={...system,components:[{id:'custom-admin-layout',type:'Custom:SystemPanel',properties:{},visible:true}]};
 const next=seedProtectedAdministrationPages({pages:[altered,...seeded.pages.filter(p=>p!==system)]});
 assert.equal(next.pages[0],altered);
 assert.equal(next.pages.length,11);
});
test('platform ownership and RBAC cannot be forged with ordinary metadata:write permissions',()=>{
 const page=seedProtectedAdministrationPages({pages:[]}).pages[0];
 assert.ok(isProtectedAdministrationPage(page));
 assert.match(validateProtectedAdministrationPageUpdate(page,page,['metadata:write']),/Platform administrator/);
 assert.match(validateProtectedAdministrationPageUpdate(null,page,['metadata:write']),/Platform administrator/);
 assert.equal(validateProtectedAdministrationPageUpdate(page,page,['platform:superadmin','metadata:write']),null);
 assert.match(validateProtectedAdministrationPageUpdate(page,{...page,scope:'tenant'},['platform:superadmin']),/ownership/);
 assert.match(validateProtectedAdministrationPageUpdate(page,{...page,apiName:'Impostor'},['platform:superadmin']),/renamed/);
 assert.match(validateProtectedAdministrationPageUpdate(page,{...page,requiredPermissions:[]},['platform:superadmin']),/(?:security metadata|required permission)/);
 assert.equal(validateProtectedAdministrationPageUpdate(null,{apiName:'Normal_Page'},['metadata:write']),null);
});

test('pristine v2 administration forms gain independent field slots without resetting edits',()=>{
 const d=protectedWorkspacePageDescriptors.find(item=>item.workspace==='app-manager');
 const pristine={...protectedAdministrationPage(d),definitionVersion:2,
  components:protectedAdministrationSlotComponents('app-manager',
   ['identity','pages','assignments','navigation-items','navigation-order','utility','actions'])};
 const upgraded=seedProtectedAdministrationPages({pages:[pristine]});
 const page=upgraded.pages.find(p=>p.apiName===pristine.apiName);
 assert.equal(page.definitionVersion,3);
 assert.ok(page.components.some(item=>item.properties.platformSlotKey==='field-brandColor'));
 const edited={...pristine,updatedAt:'2026-10-15T08:00:00.000Z'};
 const preserved=seedProtectedAdministrationPages({pages:[edited]});
 assert.equal(preserved.pages[0],edited);
});

test('persisted normalized pristine v2 components upgrade additively without overwriting saved section styles',()=>{
 const descriptor=protectedWorkspacePageDescriptors.find(item=>item.workspace==='app-manager');
 const old=protectedAdministrationSlotComponents('app-manager',
  ['identity','pages','assignments','navigation-items','navigation-order','utility','actions']);
 const normalized=old.map(item=>({...item,properties:{...item.properties,style:{color:'blue'}},
  position:{...item.position},responsive:{}}));
 const page={...protectedAdministrationPage(descriptor),definitionVersion:2,components:normalized};
 const updated=seedProtectedAdministrationPages({pages:[page]});
 const upgraded=updated.pages.find(item=>item.apiName===page.apiName);
 assert.equal(upgraded.definitionVersion,3);
 assert.equal(upgraded.components.length,11);
 normalized.forEach((item,index)=>assert.strictEqual(upgraded.components[index],item));
 assert.equal(seedProtectedAdministrationPages(updated),updated);
});

test('persisted pristine Object Manager page upgrades to independent editor fields',()=>{
 const descriptor=protectedWorkspacePageDescriptors.find(d=>d.workspace==='object-manager');
 const page={...protectedAdministrationPage(descriptor),definitionVersion:2,
  components:protectedAdministrationSlotComponents('object-manager',
   ['object-workspace','object-list','object-heading','object-subnav','object-setting'])};
 const upgraded=seedProtectedAdministrationPages({pages:[page]}).pages.find(p=>p.apiName===page.apiName);
 assert.equal(upgraded.definitionVersion,3);
 assert.ok(upgraded.components.some(c=>c.properties.platformSlotKey==='field-object-01'));
});
