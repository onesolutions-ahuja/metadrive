import test from 'node:test';
import assert from 'node:assert/strict';
import { decideAdvancedRecordAccess as decide, validateAdvancedSharingMetadata as validate } from '../src/advanced-sharing-policy.mjs';
const context = {tenantId:'tenant-a',userId:'member-a',objectApiName:'Account',
  operation:'read',userType:'internal',roleIds:['team-a'],objectPermission:true};
const record = {tenantId:'tenant-a',Region:'EMEA',Status:'Active'};
const rule = {id:'region',tenantId:'tenant-a',objectApiName:'Account',
  enabled:true,subjectType:'role',subjectId:'team-a',conditionLogic:'all',
  conditions:[{field:'Region',operator:'eq',value:'EMEA'}]};
const ask = opts => decide({context,record,ordinaryAuthorized:true,...opts});
test('restriction rules narrow grants but never create new access',()=>{
  assert.equal(ask({rules:[rule]}).allowed,true);
  assert.equal(ask({rules:[{...rule,conditions:[{field:'Region',operator:'eq',value:'APAC'}]}]}).allowed,false);
  assert.equal(ask({rules:[rule],ordinaryAuthorized:false}).allowed,false);
  assert.equal(ask({rules:[rule],context:{...context,objectPermission:false}}).allowed,false);
});
test('multiple applicable restrictions intersect and unmatched users are unaffected',()=>{
  const status={...rule,id:'status',subjectType:'all',conditions:[{field:'Status',operator:'eq',value:'Pending'}]};
  assert.equal(ask({rules:[rule,status]}).allowed,false);
  assert.equal(ask({rules:[{...rule,subjectId:'other-team'}]}).allowed,true);
});
test('external users deny by default unless portal scope was independently granted',()=>{
  const external={...context,userType:'external',accountId:'customer-a'};
  assert.equal(ask({context:external}).allowed,false);
  assert.equal(ask({context:{...external,externalAccessEnabled:true},
    record:{...record,portalVisible:true,accountId:'customer-b'}}).allowed,false);
  assert.equal(ask({context:{...external,externalAccessEnabled:true},
    record:{...record,portalVisible:true,accountId:'customer-a'}}).allowed,true);
});
test('tenant mismatch is always rejected even when ordinary RBAC grants access',()=>{
  assert.throws(()=>ask({record:{...record,tenantId:'tenant-b'}}));
  assert.throws(()=>ask({rules:[{...rule,tenantId:'tenant-b'}]}));
  assert.throws(()=>ask({implicit:[{tenantId:'tenant-b',parentId:'a',childId:'b',direction:'parent_to_child'}]}));
  assert.throws(()=>ask({territoryAssignments:[{tenantId:'tenant-b',territoryId:'t',userId:'member-a',depth:0}]}));
});
test('implicit and territory metadata never turn a base denial into grant',()=>{
  const implicit=[{tenantId:'tenant-a',parentId:'a',childId:'b',direction:'parent_to_child'}];
  const territoryAssignments=[{tenantId:'tenant-a',territoryId:'west',userId:'member-a',depth:1}];
  assert.equal(ask({implicit,territoryAssignments,ordinaryAuthorized:false}).allowed,false);
  assert.equal(ask({implicit,territoryAssignments}).allowed,true);
  assert.throws(()=>ask({territoryAssignments:[{...territoryAssignments[0],depth:99}]}));
});
test('metadata rejects malformed and cross-tenant restrictions',()=>{
  assert.equal(validate({tenantId:'tenant-a',objectApiName:'Account',rules:[rule]}),true);
  assert.throws(()=>validate({tenantId:'tenant-a',objectApiName:'Account',rules:[rule,rule]}));
  assert.throws(()=>validate({tenantId:'tenant-a',objectApiName:'Account',rules:[{...rule,tenantId:'tenant-b'}]}));
  assert.throws(()=>validate({tenantId:'tenant-a',objectApiName:'Account',
    rules:[{...rule,conditions:[{field:'Region',operator:'regex',value:'.*'}]}]}));
});
