import test from 'node:test';
import assert from 'node:assert/strict';
import {builderDefinitions,resolveBuilderContext,validateInspectorProperties,prepareBuilderPublish,prepareBuilderRollback} from '../apps/web/src/sharedBuilderContract.ts';
test('5a-f canonical builder workspaces and tenant RBAC',()=>{
 assert.equal(builderDefinitions.length,6);
 for(const definition of builderDefinitions){
  assert.equal(resolveBuilderContext({workspaceId:definition.id,tenantId:'t',userId:'u',grants:new Set(['metadata:write']),device:'Phone'}).definition.kind,definition.kind);
  assert.throws(()=>resolveBuilderContext({workspaceId:definition.id,tenantId:'t',userId:'u',grants:new Set(),device:'Phone'}));
  assert.throws(()=>resolveBuilderContext({workspaceId:definition.id,tenantId:'t',userId:'u',grants:new Set(['metadata:write']),device:'Unknown'}),/viewport/);
  assert.throws(()=>resolveBuilderContext({workspaceId:definition.id,tenantId:'',userId:'u',grants:new Set(['metadata:write']),device:'Phone'}),/tenant context/);
 }
});
test('5b properties reject duplicates, unsafe identifiers, and invalid values',()=>{
 assert.deepEqual(validateInspectorProperties([{apiName:'padding',kind:'number',value:12}]),[]);
 assert.ok(validateInspectorProperties([{apiName:'padding',kind:'number',value:Infinity}]).length);
 assert.ok(validateInspectorProperties([{apiName:'name',kind:'text',value:'x'},{apiName:'name',kind:'text',value:'y'}]).length);
});
test('5g publish and rollback enforce revision and permission contracts',()=>{
 const current={apiName:'Demo',revision:2,status:'Draft',body:{}};
 const next={apiName:'Demo',revision:3,status:'Published',body:{hello:true}};
 assert.equal(prepareBuilderPublish(current,next,new Set(['metadata:write'])).revision,3);
 assert.throws(()=>prepareBuilderPublish(current,next,new Set()));
 assert.throws(()=>prepareBuilderPublish(current,{...next,revision:5},new Set(['metadata:write'])));
 assert.equal(prepareBuilderRollback(next,{...current,revision:1},new Set(['metadata:write'])).restoreRevision,1);
});
