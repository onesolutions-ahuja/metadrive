import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeTenantCore,seedInitialTenantDeveloperPolicy} from '../src/seeders/core.mjs';

const admin={id:'system-administrator',apiName:'System_Administrator',label:'System Administrator',
 license:'MetaDrive',systemPermissions:['metadata:read','security:manage'],
 objectPermissions:{Account:{read:true,create:true,edit:true,delete:true}},
 fieldPermissions:{'Account.Name':{read:true,edit:true}},recordTypePermissions:{}};
const template={objects:[{apiName:'Account'}],pages:[],flows:[],
 accessControl:{permissionSets:[admin],profiles:[],users:[{id:'initial-admin'}]}};

test('agent2: fresh tenant receives independent OneEngine Tenant Developer permissions',()=>{
 const tenant=initializeTenantCore(template,{authorizedUserIds:['initial-admin'],trustedProvisioningDefaults:true});
 const developer=tenant.accessControl.permissionSets.find(item=>item.id==='oneengine-tenant-developer');
 assert.equal(developer.apiName,'OneEngine_Tenant_Developer');
 assert.deepEqual(developer.objectPermissions,admin.objectPermissions);
 assert.notEqual(developer.objectPermissions,admin.objectPermissions);
 assert.equal(developer.systemPermissions.includes('platform:superadmin'),false);
 assert.equal(tenant.accessControl.users.length,1);
});
test('agent2: existing developer policy customisations are authoritative',()=>{
 const permissions={...template.accessControl, permissionSets:[
  admin,{id:'oneengine-tenant-developer',apiName:'OneEngine_Tenant_Developer',
    systemPermissions:[],objectPermissions:{Account:{read:false}}}]};
 const merged=seedInitialTenantDeveloperPolicy(permissions);
 assert.deepEqual(merged.permissionSets[1],permissions.permissionSets[1]);
 assert.deepEqual(permissions.permissionSets[1].objectPermissions.Account,{read:false});
});
test('agent2: tenant developer seeding requires the canonical administrator template',()=>{
 assert.throws(()=>seedInitialTenantDeveloperPolicy({permissionSets:[]}),/Missing canonical administrator/);
});
