import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {AccessControlMetadata} from '../src/core/metadata/Definitions/metadata';
import {rbacUserSaveWasCommitted} from '../src/core/workspace/SetupShell/rbacSaveRecovery';

const baseline={
  tenantId:'tenant-1',revision:1,
  profiles:[],permissionSets:[],permissionSetGroups:[],roles:[],publicGroups:[],
  queues:[],sharingRules:[],sharingSettings:{},
  users:[{
    id:'user-1',name:'Developer',username:'developer@example.invalid',
    roleId:'role-1',profileId:'profile-1',timeZone:'UTC',locale:'en-GB',
    currencyIsoCode:'USD',userType:'internal',externalAccountId:'',
    permissionSetIds:['set-1'],permissionSetGroupIds:[]
  }]
} as unknown as AccessControlMetadata;

test('timed-out RBAC save may be confirmed only by matching committed User settings',()=>{
  const draft={
    ...baseline,
    users:[{...baseline.users[0],timeZone:'Europe/London',currencyIsoCode:'GBP'}]
  };
  const committed={...draft,revision:2};
  assert.equal(rbacUserSaveWasCommitted(baseline,draft,committed),true);
  assert.equal(rbacUserSaveWasCommitted(baseline,draft,{...committed,revision:1}),false);
  assert.equal(rbacUserSaveWasCommitted(baseline,draft,{
    ...committed,users:[{...draft.users[0],currencyIsoCode:'USD'}]
  }),false);
  assert.equal(rbacUserSaveWasCommitted(baseline,{...draft,sharingSettings:{Any:{}}} as AccessControlMetadata,committed),false);
  assert.equal(rbacUserSaveWasCommitted(baseline,draft,{...committed,tenantId:'tenant-2'}),false);
});
