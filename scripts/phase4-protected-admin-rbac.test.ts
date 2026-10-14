import test from 'node:test';
import assert from 'node:assert/strict';
import {canWritePageMetadata,isProtectedSystemPage,visiblePageMetadata,validSystemPageScope} from '../apps/server/src/modules/pages/protected-system-pages';
test('reserved system page namespace denies tenant metadata grants',()=>{
 const name='MetaDriveSystem_rbac_Page',other='Tenant_Page';
 assert.equal(isProtectedSystemPage(name),true);
 assert.equal(isProtectedSystemPage('metadrivesystem_rbac_Page'),true);
 assert.equal(validSystemPageScope({apiName:name,scope:'tenant'}),false);
 assert.equal(validSystemPageScope({apiName:name,scope:'platform-system',ownerNamespace:'MetaDrive'}),true);
 assert.equal(validSystemPageScope({apiName:other,scope:'platform-system'}),false);
 assert.equal(canWritePageMetadata(undefined,{apiName:name},['metadata:write','pages:manage']),false);
 assert.equal(canWritePageMetadata({apiName:name},{apiName:other},['metadata:write']),false);
 assert.equal(canWritePageMetadata(undefined,{apiName:name},['platform:superadmin']),true);
 assert.equal(canWritePageMetadata(undefined,{apiName:other},['pages:manage']),true);
});
test('protected pages do not leak to non-platform administrators',()=>{
 const pages=[{apiName:'MetaDriveSystem_tenant_management_Page',scope:'platform-system'},
  {apiName:'OtherPlatformPage',scope:'platform-system'},
  {apiName:'Tenant_Page'}];
 assert.deepEqual(visiblePageMetadata(pages,['metadata:read']).map(p=>p.apiName),['Tenant_Page']);
 assert.equal(visiblePageMetadata(pages,['metadata:read','platform:superadmin']).length,3);
});
