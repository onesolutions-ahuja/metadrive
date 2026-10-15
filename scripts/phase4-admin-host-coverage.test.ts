import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveSystemWorkspace} from '../apps/web/src/PlatformWorkspaceSurface';
test('Phase 4 Setup hosts all four administration workspaces through the shared registry',()=>{
 const source=readFileSync(new URL('../apps/web/src/setupAppShell.tsx',import.meta.url),'utf8');
 for(const workspace of ['app-manager','app-exchange','tenant-management','rbac']){
  assert.ok(resolveSystemWorkspace(workspace),workspace);
  assert.ok(source.includes('<PlatformWorkspaceSurface workspace="'+workspace+'"'),workspace);
 }
 assert.ok(source.includes('permitted={canManagePlatformTenants}'),'Platform tenancy requires explicit security gate');
});
