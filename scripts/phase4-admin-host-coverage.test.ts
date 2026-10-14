import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveSystemWorkspace} from '../apps/web/src/PlatformWorkspaceSurface';
test('Phase 4 Setup hosts all four administration workspaces through the shared registry',()=>{
 const source=readFileSync(new URL('../apps/web/src/App.tsx',import.meta.url),'utf8');
 for(const workspace of ['app-manager','app-exchange','tenant-management','rbac','company-settings','object-manager']){
  assert.ok(resolveSystemWorkspace(workspace),workspace);
  assert.ok(source.includes('<PlatformWorkspaceSurface workspace="'+workspace+'"'),workspace);
 }
 assert.ok(source.includes('permitted={canManagePlatformTenants}'),'Platform tenancy requires explicit security gate');
 assert.equal(source.split('onEditSystemPage=').length-1,6,'Every administration workspace opens existing Page Builder');
 assert.ok(source.includes('resourceApiName:apiName'),'System layout uses canonical Page Builder navigation');
});
