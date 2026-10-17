import test from 'node:test';
import assert from 'node:assert/strict';
import {repairProductImageCaseCollision} from '../../apps/server/src/migrations/repair-product-image-alias.mjs';

function fixture(){
 return {tenants:{'demo':{objects:[{apiName:'Product__c',fields:[
  {apiName:'ImageUrl',dataType:'URL',label:'Product image URL'},
  {apiName:'ImageURL',dataType:'URL',label:'Product image URL'},
  {apiName:'Name',dataType:'Text'}]}],records:{Product__c:[
    {Id:'p1',ImageUrl:'https://example.test/product.png'},
    {Id:'p2',ImageUrl:'https://example.test/other.png'}
  ]}}},libraryComponents:[
  {apiName:'OneItemGrid',propertyDefinitions:[{defaultValue:'ImageURL'}]},
  {apiName:'RecordCatalogCart',propertyDefinitions:[{defaultValue:'ImageURL'}]},
  {apiName:'OneShoppingCart',propertyDefinitions:[{defaultValue:'ImageURL'}]}
 ]};
}
test('Product image alias migration preserves data and canonical URL field',()=>{
 const state=fixture();
 assert.deepEqual(repairProductImageCaseCollision(state,'demo'),
  {alreadyDone:false,removedEmptyField:true,updatedComponentDefaults:3});
 assert.deepEqual(state.tenants.demo.records.Product__c.map(r=>r.ImageUrl),
  ['https://example.test/product.png','https://example.test/other.png']);
 assert.deepEqual(state.tenants.demo.objects[0].fields.map(f=>f.apiName),['ImageUrl','Name']);
 assert(state.libraryComponents.every(component=>component.propertyDefinitions[0].defaultValue==='ImageUrl'));
 assert.deepEqual(repairProductImageCaseCollision(state,'demo'),
  {alreadyDone:true,removedEmptyField:false,updatedComponentDefaults:0});
});
test('Product alias migration refuses deletion when alias contains business records',()=>{
 const state=fixture();
 state.tenants.demo.records.Product__c[0].ImageURL='https://example.test/important.png';
 assert.throws(()=>repairProductImageCaseCollision(state,'demo'),/business data/);
 assert.equal(state.tenants.demo.objects[0].fields.length,3);
});
test('Product alias migration refuses unexpected field or consumer metadata',()=>{
 const state=fixture();
 state.tenants.demo.objects[0].fields[1].dataType='Text';
 assert.throws(()=>repairProductImageCaseCollision(state,'demo'),/unexpected duplicate/);
 const state2=fixture();
 state2.libraryComponents.push({apiName:'OtherComponent',propertyDefinitions:[{defaultValue:'ImageURL'}]});
 assert.throws(()=>repairProductImageCaseCollision(state2,'demo'),/unexpected component/);
});
