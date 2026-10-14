import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {componentApiNameFromMetadata,findRegisteredComponentForInstance} from '../apps/web/src/componentRegistryLookup.ts';
const contract=JSON.parse(readFileSync(new URL('../contracts/component-reference-compatibility.v1.json',import.meta.url)));
const registry=[
{apiName:'Shared',status:'Published',surfaces:['page','dashboard','flow'],trustedBundled:false},
{apiName:'Draft',status:'Draft',surfaces:['page','flow']},
{apiName:'PageOnly',status:'Published',surfaces:['page']}
];
test('all saved component shapes resolve through the same published lookup',()=>{
  const samples=[['page',{type:'Custom:Shared',properties:{title:'Saved'}}],
    ['dashboard',{type:'Custom',customComponentApiName:'Shared'}],
    ['flow',{type:'Custom Component',componentApiName:'Shared'}]];
  for(const [surface,source] of samples){
    assert.equal(componentApiNameFromMetadata(source,surface),'Shared');
    assert.equal(findRegisteredComponentForInstance(registry,source,surface),registry[0]);
  }
  assert.equal(contract.legacyReferences.length,3);
});
test('draft, surface mismatch and unsafe component IDs are rejected',()=>{
  assert.equal(findRegisteredComponentForInstance(registry,{type:'Custom:Draft'},'page'),undefined);
  assert.equal(findRegisteredComponentForInstance(registry,{type:'Custom',customComponentApiName:'PageOnly'},'dashboard'),undefined);
  assert.equal(componentApiNameFromMetadata({type:'Custom:../bad'},'page'),undefined);
  assert.equal(componentApiNameFromMetadata({type:'Custom:Shared'},'flow'),undefined);
});
test('instance properties and sandbox trust are never changed',()=>{
  const instance={id:'stable',type:'Custom:Shared',properties:{actionFlows:{clicked:{flowApiName:'SAVE'}}}};
  const before=JSON.stringify(instance);
  assert.equal(findRegisteredComponentForInstance(registry,instance,'page')?.trustedBundled,false);
  assert.equal(JSON.stringify(instance),before);
  assert.equal(contract.futureProtectedSurface,'platform');
});
