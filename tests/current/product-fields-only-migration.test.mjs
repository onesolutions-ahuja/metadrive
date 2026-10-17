import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateProductFieldsOnly} from '../../apps/server/src/migrations/product-fields-only.mjs';
import {isRetiredObject} from '../../apps/server/src/retired-object-names.mjs';

test('standard Product fields move to Product__c without copying records',()=>{
 const tenant={
  objects:[
   {apiName:'Product',kind:'Standard Object',fields:[
    {apiName:'Name',dataType:'Text(255)'},
    {apiName:'AgeRestricted',dataType:'Checkbox'},
    {apiName:'MinimumAge',dataType:'Number(3, 0)'},
    {apiName:'Type',dataType:'Picklist'},
    {apiName:'UnitId',dataType:'Lookup(UnitOfMeasure)',
     relationship:{targetObject:'UnitOfMeasure'}}
   ]},
   {apiName:'Product__c',kind:'Custom Object',fields:[{apiName:'Name',dataType:'Text'}]},
   {apiName:'InvoiceItem',kind:'Standard Object',fields:[
    {apiName:'ProductId',dataType:'Lookup(Product)',relationship:{targetObject:'Product'}}
   ]}
  ],
  records:{Product:[{Id:'old',Name:'Old only'}],Product__c:[{Id:'new',Name:'Canonical'}],InvoiceItem:[]},
  flows:[],apps:[{apiName:'POS',navigationItems:['Product']}],pages:[
   {apiName:'Till',targetObject:'Product'}
  ],accessControl:{profiles:[],permissionSets:[],permissionSetGroups:[],sharingRules:[]},
  sharingSettings:{},fieldHistory:[],recordShares:[]
 };
 const result=migrateProductFieldsOnly(tenant);
 assert.equal(result.added,4);
 assert.equal(result.discardedRecords,1);
 assert.deepEqual(tenant.records.Product__c,[{Id:'new',Name:'Canonical'}]);
 assert.equal('Product' in tenant.records,false);
 assert.deepEqual(tenant.objects.map(x=>x.apiName),['Product__c','InvoiceItem']);
 assert.equal(tenant.objects[0].fields.find(x=>x.apiName==='Type').dataType,'Text(255)');
 assert.equal(tenant.objects[0].fields.find(x=>x.apiName==='UnitId').dataType,'Text(255)');
 assert.equal(tenant.objects[2],undefined);
 assert.equal(tenant.objects[1].fields[0].relationship.targetObject,'Product__c');
 assert.deepEqual(tenant.apps[0].navigationItems,['Product__c']);
 assert.equal(tenant.pages[0].targetObject,'Product__c');
 assert.equal(isRetiredObject('Product'),true);
 assert.deepEqual(migrateProductFieldsOnly(tenant),{alreadyDone:true,added:0,discardedRecords:0});
});
