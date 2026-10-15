import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordWritePolicySchema, withFlowRecordWriteContext, grantedObjectPermission,
  assertRecordFieldPermissions, lockedRecordWriteAllowed, recordWritePolicyMetadataGuard
} from '../src/record-write-policy.js';

const actor = {tenantId:'tenant-a', userId:'staff-a', permissions:[]} as any;
const rights = {read:true, create:true, edit:true, delete:true, viewAll:true, modifyAll:true};
const object = (policy?:unknown) => ({apiName:'Record', kind:'Standard Object',
  fields:[], ...(policy ? {recordWritePolicy:policy} : {})}) as any;
const grants = (permission = rights) => ({
  profile:{objectPermissions:{Record:permission}}, directSets:[], groups:[]
}) as any;
const policy = {flowApiNames:['APPROVED'], operations:['create','edit','delete']};
const approved = <T>(work:()=>T) => withFlowRecordWriteContext('APPROVED','tenant-a','staff-a',work);

test('approved Flow context is additional to central object RBAC and never a bypass', () => {
  const definition = object(policy);
  assert.equal(grantedObjectPermission(actor,definition,grants(),'read'),true);
  for (const operation of ['create','edit','delete'] as const) {
    assert.equal(grantedObjectPermission(actor,definition,grants(),operation),false);
    assert.equal(approved(()=>grantedObjectPermission(actor,definition,grants(),operation)),true);
    assert.equal(approved(()=>grantedObjectPermission(actor,definition,undefined,operation)),false);
  }
  assert.equal(grantedObjectPermission(actor,object(),grants(),'edit'),true);
});

test('a guessed Flow name, another actor or another tenant cannot satisfy a write policy', () => {
  for (const [flow,tenant,user] of [
    ['OTHER','tenant-a','staff-a'],['APPROVED','tenant-b','staff-a'],['APPROVED','tenant-a','staff-b']
  ]) {
    assert.equal(withFlowRecordWriteContext(flow,tenant,user,()=>
      grantedObjectPermission(actor,object(policy),grants(),'create')),false);
  }
});

test('async and nested Flow contexts are isolated and do not leak into callers', async () => {
  const definition=object(policy);
  const results=await Promise.all([
    approved(async()=>{await Promise.resolve();return grantedObjectPermission(actor,definition,grants(),'edit');}),
    withFlowRecordWriteContext('OTHER','tenant-a','staff-a',async()=>{
      await Promise.resolve();return grantedObjectPermission(actor,definition,grants(),'edit');
    })
  ]);
  assert.deepEqual(results,[true,false]);
  approved(()=>{
    assert.equal(withFlowRecordWriteContext('OTHER','tenant-a','staff-a',()=>
      grantedObjectPermission(actor,definition,grants(),'edit')),false);
    assert.equal(grantedObjectPermission(actor,definition,grants(),'edit'),true);
  });
  assert.equal(grantedObjectPermission(actor,definition,grants(),'edit'),false);
});

test('protected fields and record locks preserve unrelated object behaviour and field RBAC', () => {
  const definition=object({...policy,protectedFieldApiNames:['Controlled'],lockedRecordFieldApiName:'Locked'});
  assert.doesNotThrow(()=>assertRecordFieldPermissions(actor,{} as any,definition,{Name:'normal'},()=>true));
  assert.throws(()=>assertRecordFieldPermissions(actor,{} as any,definition,{Controlled:1},()=>true),/approved Flow/);
  approved(()=>assert.doesNotThrow(()=>assertRecordFieldPermissions(actor,{} as any,definition,{Controlled:1},()=>true)));
  approved(()=>assert.throws(()=>assertRecordFieldPermissions(actor,{} as any,definition,{Controlled:1},()=>false),/Missing edit permission/));
  assert.equal(lockedRecordWriteAllowed(actor,definition,{Locked:true}),false);
  assert.equal(lockedRecordWriteAllowed(actor,definition,{Locked:false}),true);
  assert.equal(approved(()=>lockedRecordWriteAllowed(actor,definition,{Locked:true})),true);
});

test('group muting is retained and a policy does not grant new permissions', () => {
  const muted = {profile:undefined,directSets:[],groups:[{
    group:{mutedObjectPermissions:{Record:{edit:true}}},sets:[{objectPermissions:{Record:rights}}]
  }]} as any;
  assert.equal(approved(()=>grantedObjectPermission(actor,object(policy),muted,'edit')),false);
});

test('policy mutation and protected schema removal require security:manage', () => {
  let status=0, continued=false;
  const response={status:(code:number)=>{status=code;return response;},json:()=>{}} as any;
  const guard=recordWritePolicyMetadataGuard(()=>actor,()=>({objects:[object({
    ...policy,protectedFieldApiNames:['Controlled']
  })]}) as any);
  guard({method:'PUT',path:'/Record',body:{}} as any,response,()=>{continued=true;});
  assert.equal(status,403);assert.equal(continued,false);
  status=0;
  guard({method:'DELETE',path:'/Record/fields/Controlled',body:{}} as any,response,()=>{continued=true;});
  assert.equal(status,403);
  const adminGuard=recordWritePolicyMetadataGuard(()=>({...actor,permissions:['security:manage']}),
    ()=>({objects:[object(policy)]}) as any);
  adminGuard({method:'PUT',path:'/Record',body:{}} as any,response,()=>{continued=true;});
  assert.equal(continued,true);
});

test('policy schema refuses wildcard trust and unsupported operations', () => {
  assert.equal(recordWritePolicySchema.safeParse({...policy,flowApiNames:['*']}).success,false);
  assert.equal(recordWritePolicySchema.safeParse({...policy,operations:['read']}).success,false);
  assert.equal(recordWritePolicySchema.safeParse(policy).success,true);
});
