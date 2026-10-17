import test from 'node:test';
import assert from 'node:assert/strict';
import {consolidateRetiredProducts} from '../../scripts/pos-product-consolidation.mjs';
function fixture(){
 const fields=[{apiName:'Name',dataType:'Text(255)'},
  {apiName:'SKU',dataType:'Text(255)'},{apiName:'DefaultPrice',dataType:'Currency(18, 2)'},
  {apiName:'CreatedDate',dataType:'Date/Time'},{apiName:'LastModifiedDate',dataType:'Date/Time'}];
 const objects=[
  {apiName:'Product',fields:structuredClone(fields)},
  {apiName:'Product__c',fields:[...structuredClone(fields),{apiName:'Price__c',dataType:'Currency(18, 2)'}]},
  {apiName:'InvoiceItem',fields:[{apiName:'ProductId',dataType:'Lookup(Product)',
   relationship:{type:'Lookup',targetObject:'Product'}}]}
 ];
 const records={Product:Array.from({length:6},(_,i)=>({
  Id:'legacy-'+i,Name:'Product '+i,SKU:'LEGACY-'+i,DefaultPrice:i+1,
  CreatedDate:'2026-01-01T00:00:00.000Z',LastModifiedDate:'2026-02-01T00:00:00.000Z'
 })),
 Product__c:[{Id:'canonical-0',Name:'Product 0',SKU:'LEGACY-0',DefaultPrice:1}],
 InvoiceItem:[{Id:'invoice-line-1',ProductId:'legacy-1'}]};
 return {objects,records};
}
test('Six retired Product records migrate with five new and one reused identity',()=>{
 const t=fixture();
 const result=consolidateRetiredProducts(t);
 assert.deepEqual(result,{archived:6,migrated:5,reused:1,remappedInvoiceItems:1});
 assert.equal(t.records.Product__c.length,6);
 assert.equal(t.records.Product.length,6,'Original rows remain for physical SQL archive');
 assert.equal(t.records.InvoiceItem[0].ProductId,'legacy-1');
 assert.equal(t.objects[2].fields[0].relationship.targetObject,'Product__c');
 assert(t.records.Product__c.every(x=>x.Name&&x.Id));
 const b=structuredClone(t);
 b.objects=b.objects.filter(x=>x.apiName!=='Product');
 assert.deepEqual(consolidateRetiredProducts(b),{archived:0,migrated:0,reused:0,remappedInvoiceItems:0});
});
test('Refuses contradictory canonical SKU and Name rather than changing customer products',()=>{
 const t=fixture();
 t.records.Product__c.push({Id:'different',Name:'Product 1',SKU:'DIFFERENT'});
 t.records.Product__c[0].SKU='LEGACY-1';
 assert.throws(()=>consolidateRetiredProducts(t),/conflicting canonical SKU and Name/);
});
test('Refuses unsupported invoice reference; no silent orphaning',()=>{
 const t=fixture();
 t.records.InvoiceItem[0].ProductId='unknown';
 assert.throws(()=>consolidateRetiredProducts(t),/unmapped legacy Product/);
});
