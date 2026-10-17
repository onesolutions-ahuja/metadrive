import test from 'node:test';
import assert from 'node:assert/strict';
import {customisationObjects,customisationObjectExtensions,basketObjectExtensions} from '../../scripts/kiosk-commerce-capabilities.mjs';
import {kioskObjectDefinitions} from '../../scripts/kiosk-demo-fixtures.mjs';
import {commerceFlows} from '../../scripts/kiosk-phase4-flows.mjs';
import {commercePages} from '../../scripts/kiosk-phase4-pages.mjs';
import {retiredObjectApiNames, isRetiredObject} from '../../apps/server/src/retired-object-names.mjs';
import {coreMetadataSeed,mergeCoreMetadata,initializeTenantCore,mergeSharedDependency} from '../../apps/server/src/seeders/core.mjs';
import {loadAppSeedCatalog} from '../../apps/server/src/seeders/catalog.mjs';


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

test('retired Object API names are never reintroduced by Core or shared seeders', () => {
  const banned=retiredObjectApiNames.map(apiName=>({apiName,fields:[]}));
  const supported={apiName:'Product__c',fields:[]};
  const seed=coreMetadataSeed({objects:[...banned,supported],accessControl:{users:[],permissionSets:[]}});
  assert.deepEqual(seed.objects.map(o=>o.apiName),['Product__c']);
  const merged=mergeCoreMetadata({objects:[],pages:[],flows:[]},{
    objects:[...banned,supported],pages:[],flows:[]
  });
  assert.deepEqual(merged.objects.map(o=>o.apiName),['Product__c']);
  const shared=mergeSharedDependency({objects:[],pages:[],flows:[]},{objects:banned});
  assert.deepEqual(shared.objects,[]);
  const provisioned=initializeTenantCore({
    objects:[...banned,supported],accessControl:{users:[],permissionSets:[]}
  },{authorizedUserIds:['owner'],trustedProvisioningDefaults:true});
  assert.deepEqual(provisioned.objects.map(o=>o.apiName),['Product__c']);
  assert.equal(isRetiredObject('Product__c'),false);
  assert.equal(isRetiredObject('ProductCategory'),false);
  for(const name of retiredObjectApiNames) assert.equal(isRetiredObject(name),true);
});
test('installable app packages do not reintroduce deleted SQL-backed Objects',()=>{
  const catalog=loadAppSeedCatalog();
  for(const pkg of catalog.packages){
    for(const object of [...(pkg.objects??[]),...(pkg.extendObjects??[])])
      assert.equal(isRetiredObject(object.apiName),false,pkg.appKey);
  }
});
