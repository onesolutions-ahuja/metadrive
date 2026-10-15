import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeCoreMetadata} from '../src/seeders/core.mjs';

test('agent2: repeat Core seeds do not append duplicate API definitions', () => {
  const tenant = {objects:[],pages:[],flows:[],records:{Account:[{Id:'customer'}]}};
  const seed = {objects:[{apiName:'Account',label:'Seed default'},{apiName:'Account',label:'Duplicate'}],
    pages:[{apiName:'Home'}],flows:[]};
  const once = mergeCoreMetadata(tenant,seed);
  assert.equal(once.objects.length,1);
  assert.deepEqual(mergeCoreMetadata(once,seed),once);
  assert.deepEqual(once.records,tenant.records);
  assert.equal(tenant.objects.length,0);
});

test('agent2: tenant metadata overrides and RBAC grants survive a reseed', () => {
  const tenant = {objects:[{apiName:'Account',label:'Custom',fields:[{apiName:'Custom__c'}]}],
    pages:[],flows:[],accessControl:{permissionSets:[{apiName:'OneEngine',permissions:[]}]},
    records:{Account:[{Id:'a'}]}};
  const seed = {objects:[{apiName:'Account',label:'Core'}],pages:[],flows:[],
    accessControl:{permissionSets:[{apiName:'OneEngine',permissions:['Manage']}] }};
  const merged = mergeCoreMetadata(tenant,seed);
  assert.deepEqual(merged.objects,tenant.objects);
  assert.deepEqual(merged.accessControl,tenant.accessControl);
  assert.deepEqual(merged.records,tenant.records);
});

test('agent2: fail closed on a seed definition missing its stable API identity', () => {
  assert.throws(() => mergeCoreMetadata({objects:[],pages:[],flows:[]},
    {objects:[{label:'Unkeyed'}],pages:[],flows:[]}), /stable apiName/);
});
