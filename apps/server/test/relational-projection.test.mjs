import assert from 'node:assert/strict';
import test from 'node:test';
import { projectState, restoreState, verifyProjection } from '../src/relational-projection.mjs';
function sample() {
  return {
    tenants:{
      first:{
        objects:[
          {apiName:'Customer__c',fields:[{apiName:'Name',dataType:'Text'}]},
          {apiName:'Order__c',fields:[{apiName:'Customer__c',relationship:{targetObject:'Customer__c'}}]}
        ],
        flows:[{apiName:'RecordFlow',elements:[{config:{objectApiName:'Customer__c'}}]}],
        pages:[],namedCredentials:[{id:'encrypted',ciphertext:'not-plaintext'}],
        records:{Customer__c:[{Id:'customer1',Name:'Example',Amount__c:0}],Order__c:[{Id:'order1',Customer__c:'customer1'}],Empty__c:[]},
        accessControl:{roles:[{id:'admin'}]},sharingSettings:{},
        scheduleRetries:{},fieldHistory:[],platformEvents:[],dashboardSubscriptions:[]
      },
      second:{objects:[],records:{},flows:[],pages:[],namedCredentials:[]}
    },
    libraryComponents:[{id:'component1',source:'example component'}],
    users:[{id:'user1',tenantId:'first',name:'Support',email:'support@example.test',passwordSalt:'salt',passwordHash:'hash',role:'Admin',permissionSetIds:['sys'],permissionSetGroupIds:[],disabled:false,createdAt:'2026-10-11T00:00:00.000Z'}],
    refreshSessions:[{tokenHash:'hash1',familyId:'family',userId:'user1',tenantId:'first',expiresAt:100,usedAt:null,revokedAt:null}],
    revokedAccessTokens:{revoked:999},
    platformPolicies:{user1:['platform:superadmin']},
    platformPolicyAudit:[{actorId:'user1',userId:'user1',previous:[],next:['platform:superadmin'],at:'2026-10-12T00:00:00.000Z'}]
  };
}
test('metadata records and related objects survive a roundtrip',()=>{
  const state=sample(),rows=projectState(state);
  assert.deepStrictEqual(restoreState(rows),state);
  assert.equal(verifyProjection(state,rows).counts.records,2);
  assert.equal(rows.recordBuckets.length,3);
});
test('empty buckets and tenant isolation are preserved',()=>{
  const state=sample();
  assert.deepStrictEqual(restoreState(projectState(state)),state);
});
test('flow, page, and credential metadata survives without hardcoded fields',()=>{
  const state=sample();
  state.tenants.first.flows.push({apiName:'Dynamic__c',elements:[{config:{objectApiName:'Custom__c',customProperty__c:true}}]});
  state.tenants.first.records.Customer__c[0].Nested__c={array:[null,false,0,'text']};
  assert.deepStrictEqual(restoreState(projectState(state)),state);
});
test('duplicate record IDs are rejected',()=>{
  const state=sample();
  state.tenants.first.records.Customer__c.push({Id:'customer1'});
  assert.throws(()=>projectState(state),/duplicate record Id/);
});
test('records must have Id',()=>{
  const state=sample();
  state.tenants.first.records.Customer__c.push({Name:'invalid'});
  assert.throws(()=>projectState(state),/record Id/);
});
test('unknown top-level keys must fail closed',()=>{
  assert.throws(()=>projectState({...sample(),unrecognised:[123]}),/unknown top-level key/);
});
test('duplicate user emails must fail closed',()=>{
  const state=sample();
  state.users.push({...state.users[0],id:'user2'});
  assert.throws(()=>projectState(state),/duplicate user email/);
});
test('duplicate refresh token hashes must fail closed',()=>{
  const state=sample();
  state.refreshSessions.push({...state.refreshSessions[0]});
  assert.throws(()=>projectState(state),/duplicate session tokenHash/);
});
test('malformed sessions must fail closed',()=>{
  const state=sample();
  state.refreshSessions[0].tokenHash='';
  assert.throws(()=>projectState(state),/session tokenHash/);
});
test('prototype-like tenant and object names remain literal metadata',()=>{
  const state=sample();
  const value=JSON.parse(JSON.stringify(state));
  value.tenants.constructor=value.tenants.second;
  delete value.tenants.second;
  value.tenants.first.records=JSON.parse('{"__proto__":[],"Customer__c":[{"Id":"customer1","Name":"Example","Amount__c":0}],"Order__c":[{"Id":"order1","Customer__c":"customer1"}],"Empty__c":[]}');
  assert.deepStrictEqual(restoreState(projectState(value)),value);
});
test('malformed revoked tokens must fail closed',()=>{
  const state=sample();
  state.revokedAccessTokens.invalid='not-number';
  assert.throws(()=>projectState(state),/invalid revoked token expiry/);
});

test('platform policy grants and audit survive relational projection without tenant leakage',()=>{
  const state=sample();
  const rows=projectState(state);
  assert.equal(rows.platformSettings.length,2);
  assert.deepStrictEqual(restoreState(rows),state);
  assert.equal(verifyProjection(state,rows).counts.platformSettings,2);
  const missing=structuredClone(state);
  delete missing.platformPolicies;
  delete missing.platformPolicyAudit;
  assert.deepStrictEqual(restoreState(projectState(missing)),missing,
    'Older legacy snapshots without policy fields must also survive unchanged');
  assert.throws(()=>restoreState({...rows,platformSettings:[{key:'notAllowed',payload:{}}]}),
    /unknown or duplicate platform setting/);
});

test('tenant directory entries and management audits round-trip independently of tenant data',()=>{
  const state=sample();
  const timestamp='2026-10-12T12:00:00.000Z';
  state.tenantRegistry={
    first:{name:'First Studio',description:'A customer',status:'SUSPENDED',createdAt:timestamp,updatedAt:timestamp},
    second:{name:'Second Studio',description:'',status:'ACTIVE',createdAt:timestamp,updatedAt:timestamp}
  };
  state.tenantManagementAudit=[{
    actorId:'user1',tenantId:'first',action:'SUSPENDED',at:timestamp,
    previous:{...state.tenantRegistry.first,status:'ACTIVE'},
    next:state.tenantRegistry.first
  }];
  const rows=projectState(state);
  assert.equal(rows.platformSettings.length,4);
  assert.deepStrictEqual(restoreState(rows),state);
  assert.equal(verifyProjection(state,rows).counts.platformSettings,4);
  assert.throws(()=>restoreState({...rows,platformSettings:[
    ...rows.platformSettings,{key:'tenantRegistry',payload:{}}]}),/unknown or duplicate platform setting/);
});
