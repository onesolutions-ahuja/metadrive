import test from 'node:test';
import assert from 'node:assert/strict';
import {platformNavigationEntries,authorizePlatformNavigation} from '../apps/web/src/platformWorkspaceMetadata.ts';
test('4d maps App Manager and AppExchange to their registered workspaces',()=>{
 const nav=platformNavigationEntries();
 assert.equal(nav.find(x=>x.label==='App Manager')?.id,'app-manager');
 assert.equal(nav.find(x=>x.label==='AppExchange')?.id,'app-exchange');
});
test('4e maps RBAC settings to central security workspace without granting access',()=>{
 assert.equal(platformNavigationEntries().find(x=>x.label==='Profiles')?.id,'rbac');
 assert.equal(authorizePlatformNavigation('Profiles',new Set()),undefined);
 assert.equal(authorizePlatformNavigation('Profiles',new Set(['metadata:read'])),undefined);
 assert.ok(authorizePlatformNavigation('Profiles',new Set(['security:read'])));
});
test('4f connectors require metadata write access',()=>{
 assert.equal(authorizePlatformNavigation('Named Credentials',new Set(['metadata:read'])),undefined);
 assert.equal(authorizePlatformNavigation('Named Credentials',new Set(['metadata:write']))?.id,'named-credentials');
});
test('4g remaining administration uses canonical routes and edit RBAC',()=>{
 assert.equal(platformNavigationEntries().find(x=>x.label==='Scheduled Flows')?.id,'flow-builder');
 assert.equal(authorizePlatformNavigation('Object Manager',new Set(['metadata:read']),'edit'),undefined);
 assert.equal(authorizePlatformNavigation('Not Registered',new Set(['metadata:write'])),undefined);
});
