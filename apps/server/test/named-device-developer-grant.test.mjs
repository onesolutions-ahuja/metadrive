import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileDeviceDeveloperGrant} from '../src/seeders/apps.mjs';
const object={apiName:'NamedDevice__c',fields:[{apiName:'Name'},{apiName:'DeviceKey__c'}]};
const fixture=(grant)=>({objects:[object],accessControl:{permissionSets:[{id:'oneengine-tenant-developer',objectPermissions:grant===undefined?{}:{NamedDevice__c:grant},fieldPermissions:{}},{id:'regular-user',objectPermissions:{},fieldPermissions:{}}]}});
test('grants existing named devices to tenant developer and fields only',()=>{
 const before=fixture(); const after=reconcileDeviceDeveloperGrant(before);
 assert.equal(after.accessControl.permissionSets[0].objectPermissions.NamedDevice__c.read,true);
 assert.equal(after.accessControl.permissionSets[0].fieldPermissions['NamedDevice__c.Name'].read,true);
 assert.deepEqual(after.accessControl.permissionSets[1],before.accessControl.permissionSets[1]);
 assert.deepEqual(reconcileDeviceDeveloperGrant(after),after);
});
test('preserves explicit deny and is safe for tenants without object',()=>{
 const before=fixture({read:false});
 assert.equal(reconcileDeviceDeveloperGrant(before),before);
 const missing=fixture(); missing.objects=[];
 assert.equal(reconcileDeviceDeveloperGrant(missing),missing);
});
