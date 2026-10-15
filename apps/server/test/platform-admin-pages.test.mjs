import test from 'node:test';
import assert from 'node:assert/strict';
import {
 protectedWorkspacePageDescriptors,protectedPageApiName,seedProtectedAdministrationPages,
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
 &&p.definitionVersion===2&&p.overridePolicy==='presentation-only'
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
