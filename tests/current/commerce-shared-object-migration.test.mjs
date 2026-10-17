import test from 'node:test';
import assert from 'node:assert/strict';
import {customisationObjects,customisationObjectExtensions,basketObjectExtensions} from '../../scripts/kiosk-commerce-capabilities.mjs';
import {kioskObjectDefinitions} from '../../scripts/kiosk-demo-fixtures.mjs';
import {commerceFlows} from '../../scripts/kiosk-phase4-flows.mjs';
import {commercePages} from '../../scripts/kiosk-phase4-pages.mjs';

test('commerce installs only shared Object definitions',()=>{
 const retired=new Set(['ModifierGroup__c','ModifierOption__c','ProductCategory__c','SaleItem__c','OrderLineModifier__c']);
 for(const object of [...customisationObjects,...kioskObjectDefinitions]){
  assert.equal(retired.has(object.apiName),false,object.apiName);
  for(const field of object.fields){
   assert.equal(retired.has(field.relationship?.targetObject),false);
  }
 }
});
test('the missing alternative fields are declared in metadata',()=>{
 const check=(object,fields)=>{
  const found=new Map((customisationObjectExtensions[object]??basketObjectExtensions[object]??[])
   .map(field=>[field.apiName,field]));
  for(const field of fields)assert.ok(found.has(field),object+'.'+field);
  return found;
 };
 check('ProductModifierGroup__c',['MinSelections','MaxSelections','IsRequired','IsActive']);
 assert.equal(check('ProductModifier__c',['GroupId','IsActive','SortOrder'])
  .get('GroupId').relationship.targetObject,'ProductModifierGroup__c');
 assert.equal(check('Product__c',['CategoryId']).get('CategoryId')
  .relationship.targetObject,'ProductCategory');
 check('ProductCategory',['ImageUrl','SortOrder','IsActive']);
 assert.equal(check('OrderLine__c',['ParentOrderLineId','ProductModifierId'])
  .get('ProductModifierId').relationship.targetObject,'ProductModifier__c');
});
test('published commerce definitions contain no retired Object references',()=>{
 const retired=['ModifierGroup__c','ModifierOption__c','ProductCategory__c','SaleItem__c','OrderLineModifier__c'];
 const refs=JSON.stringify([...commerceFlows,...commercePages]);
 for(const name of retired)assert.equal(new RegExp('(?<![A-Za-z_])'+name).test(refs),false,name);
 assert.match(refs,/ProductModifierGroup__c/);
 assert.match(refs,/ProductModifier__c/);
 assert.match(refs,/ProductCategory/);
});
