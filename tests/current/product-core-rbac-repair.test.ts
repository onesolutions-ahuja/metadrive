import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {restoreMissingCoreAdministratorGrants} from '../../apps/server/src/seeders/repair-core-administrator-grants.mjs';
import {createCoreRecordAccess} from '../../apps/server/src/core/security/record-access.js';

const seed=JSON.parse(readFileSync('apps/server/data/platform-metadata.json','utf8'));
const objects=seed.objects.filter((item:{apiName:string})=>
  ['Product','ProductCategory','Account'].includes(item.apiName));
const fullGrant={read:true,create:true,edit:true,delete:true,viewAll:true,modifyAll:true};

test('repairs missing seeded Product grants in admin and OneEngine policies only',()=>{
  assert.equal(objects.find((item:{apiName:string})=>item.apiName==='Product')?.kind,'Standard Object');
  const existing={Account:{...fullGrant}};
  const recovered=restoreMissingCoreAdministratorGrants(existing,objects,fullGrant);
  assert.equal(recovered.Product.read,true);
  assert.equal(recovered.ProductCategory.read,true);
  assert.deepEqual(recovered.Account,existing.Account);
  assert.equal(existing.Product,undefined,'input is immutable');
  assert.equal(restoreMissingCoreAdministratorGrants(recovered,objects,fullGrant),recovered,
    'repeated SQL hydration must not make new changes');
});

test('never changes explicit owner denials or grants access to optional-app custom objects',()=>{
 const custom=[...objects,{apiName:'My_Optional_Object__c',kind:'Custom Object'}];
 const explicit={Product:{read:false,create:false,edit:false,delete:false,viewAll:false,modifyAll:false}};
 const repaired=restoreMissingCoreAdministratorGrants(explicit,custom,fullGrant);
 assert.equal(repaired.Product.read,false);
 assert.equal(repaired.ProductCategory.read,true);
 assert.equal(repaired.My_Optional_Object__c,undefined);
});

test('server Object enforcement accepts repaired administrator policy and denies non-admin profile',()=>{
 const users=[
  {id:'admin',tenantId:'t',role:'System Administrator',permissionSetIds:['oneengine'],permissionSetGroupIds:[]},
  {id:'staff',tenantId:'t',role:'Staff',permissionSetIds:[],permissionSetGroupIds:[]}
 ];
 const grants=restoreMissingCoreAdministratorGrants({},objects,fullGrant);
 const tenant:any={objects,records:{},accessControl:{
  users:users.map(u=>({id:u.id,profileId:u.id==='admin'?'system-administrator':'standard-user',
    permissionSetIds:u.permissionSetIds,permissionSetGroupIds:[]})),
  profiles:[{id:'system-administrator',objectPermissions:grants,fieldPermissions:{}},
    {id:'standard-user',objectPermissions:{},fieldPermissions:{}}],
  permissionSets:[{id:'oneengine',objectPermissions:grants,fieldPermissions:{}}],
  permissionSetGroups:[]
 }};
 const access=createCoreRecordAccess({principalUser:p=>users.find(u=>u.id===p.userId) as never});
 assert.equal(access.hasObjectPermission({userId:'admin',tenantId:'t',permissions:[]} as never,tenant,'Product','read'),true);
 assert.equal(access.hasObjectPermission({userId:'admin',tenantId:'t',permissions:[]} as never,tenant,'Product','edit'),true);
 assert.equal(access.hasFieldPermission({userId:'admin',tenantId:'t',permissions:[]} as never,tenant,'Product','Name','read'),true);
 assert.equal(access.hasObjectPermission({userId:'staff',tenantId:'t',permissions:[]} as never,tenant,'Product','read'),false);
});
