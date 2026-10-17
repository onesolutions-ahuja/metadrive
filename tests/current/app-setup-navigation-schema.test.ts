import test from 'node:test';
import assert from 'node:assert/strict';
import { lightningAppSchema } from '../../apps/server/src/modules/pages/schemas.js';

const app = {
  apiName:'PageOnlyApp',label:'Page only app',description:'',
  navigationItems:[],navigationPageApiNames:['MainPage'],
  navigationOrder:[{type:'App Page',apiName:'MainPage'}],
  brandColor:'#0176d3',utilityItems:[]
};

test('page-only applications validate without requiring unrelated object tabs',()=>{
  assert.equal(lightningAppSchema.safeParse(app).success,true);
});
test('object-only applications remain valid',()=>{
  assert.equal(lightningAppSchema.safeParse({
    ...app,navigationItems:['Account'],navigationPageApiNames:[],
    navigationOrder:[{type:'Object',apiName:'Account'}]
  }).success,true);
});
test('empty navigation and invalid or duplicate page references fail closed',()=>{
  assert.equal(lightningAppSchema.safeParse({
    ...app,navigationItems:[],navigationPageApiNames:[],navigationOrder:[]
  }).success,false);
  assert.equal(lightningAppSchema.safeParse({
    ...app,navigationPageApiNames:['MainPage','MainPage'],navigationOrder:[]
  }).success,false);
});
