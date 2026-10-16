import test from 'node:test';
import assert from 'node:assert/strict';
import {createCorePermissionRuntime} from '../../apps/server/src/core/security/permission-runtime.js';
import {libraryComponentVisible,libraryComponentEditable} from '../../apps/server/src/component-scope.mjs';
import {sandboxPublicProps,sandboxSafeAction} from '../../apps/web/src/componentSandboxPolicy.js';

test('RBAC separates tenant permissions from platform grants',()=>{
 const user:any={id:'u',tenantId:'a',role:'Staff',email:'a@tenant.test',permissionSetIds:[],permissionSetGroupIds:[]};
 const tenant:any={accessControl:{users:[{id:'u',profileId:'p',permissionSetIds:[],permissionSetGroupIds:[]}],
 profiles:[{id:'p',systemPermissions:['records:read','platform:superadmin','licence:manage']}],
 permissionSets:[],permissionSetGroups:[]}};
 const state:any={platformPolicies:{}};
 const runtime=createCorePermissionRuntime(()=>state);
 assert.deepEqual(runtime.effectivePermissions(user,tenant),['records:read']);
 state.platformPolicies['u']=['platform:superadmin'];
 assert.ok(runtime.effectivePermissions(user,tenant).includes('platform:superadmin'));
 assert.ok(runtime.effectivePermissions(user,tenant).includes('licence:manage'));
 assert.equal(runtime.principalForUser(user,tenant).tenantId,'a');
});
test('component registry denies cross-tenant ownership and trusted edits',()=>{
 const tenants=['a','b'];
 assert.equal(libraryComponentVisible({tenantId:'a'},'b',tenants),false);
 assert.equal(libraryComponentEditable({tenantId:'a'},'b',tenants),false);
 assert.equal(libraryComponentVisible({tenantId:'a'},'a',tenants),true);
 assert.equal(libraryComponentEditable({tenantId:'a'},'a',tenants),true);
 assert.equal(libraryComponentVisible({trustedBundled:true},'b',tenants),true);
 assert.equal(libraryComponentEditable({trustedBundled:true},'b',tenants),false);
});
test('sandbox never exposes credentials, callbacks or internal host props',()=>{
 const cleaned=sandboxPublicProps({label:'Safe',color:'red',apiKey:'SECRET',onAction:()=>{},
  internalState:'secret',properties:{color:'red',password:'secret'}});
 assert.equal(cleaned.label,'Safe');
 assert.equal(cleaned.color,'red');
 assert.equal('apiKey' in cleaned,false);
 assert.equal('onAction' in cleaned,false);
 assert.equal('internalState' in cleaned,false);
 assert.equal('password' in (cleaned.properties as Record<string,unknown>),false);
 assert.equal(sandboxSafeAction({event:'invalid event',value:1}),null);
 assert.equal(sandboxSafeAction({event:'save',value:'x'.repeat(40000)}),null);
});
