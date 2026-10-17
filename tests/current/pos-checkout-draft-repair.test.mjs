import test from 'node:test';
import assert from 'node:assert/strict';
import {planPosDraftRepair} from '../../scripts/pos-checkout-draft-repair.mjs';

const lookup=(name,target)=>({apiName:name,label:name,dataType:'Lookup('+target+')',
 required:false,unique:false,relationship:{type:'Lookup',targetObject:target}});
function fixtures(){
 const objects=[
  {apiName:'Product__c',label:'Product',kind:'Custom Object',fields:[{apiName:'Name',dataType:'Text'}]},
  {apiName:'OrderLine__c',label:'Order Line',fields:[lookup('ProductId','Product__c')]},
  {apiName:'SaleLine__c',label:'Sale Line',fields:[lookup('ProductId','Product__c'),lookup('SaleId','Sale__c')]},
  {apiName:'Sale__c',label:'Sale',fields:[]}
 ];
 const flows=[{
  apiName:'COPILOT_POS_Cash_Checkout',status:'Draft',activeVersion:null,
  elements:[
   {id:1,type:'Loop',label:'Order line loop',config:{loopVariable:'CurrentOrderLine',collection:'CurrentOrderLines'}},
   {id:4,type:'Get Records',label:'Find Current Draft Order',config:{object:'Order__c',
    conditions:[{field:'BasketSessionKey',operator:'Equals',value:'cashier-cart'},
      {field:'Status',operator:'Equals',value:'Draft'}]}},
   {id:2,type:'Get Records',label:'Find Product for Order Line',config:{object:'Product',conditions:[]}},
   {id:3,type:'Create Records',label:'Create Sale Item',config:{object:'SaleItem__c',
    fieldValues:[
     {field:'Name',value:'{!CurrentOrderLine.Name}'},
     {field:'Quantity__c',value:'{!CurrentOrderLine.Quantity}'},
     {field:'Unit_Price__c',value:'{!CurrentOrderLine.UnitPrice}'},
     {field:'Sale__c',value:'{!record7.Id}'},
     {field:'Product__c',value:'{!StandardCatalogProduct.Id}'}
    ]}}
  ],
  resources:[{name:'StandardCatalogProduct',type:'Record',dataType:'Product'}]
 }];
 return {objects,flows};
}
test('POS draft repair only extends age metadata and maps loop product into SaleLine',()=>{
 const {objects,flows}=fixtures();
 const original=JSON.stringify({objects,flows});
 const result=planPosDraftRepair(objects,flows);
 assert.deepEqual(result.fieldsToAdd,['AgeRestricted','MinimumAge']);
 const writer=result.flow.elements.find(x=>x.id===3);
 assert.equal(writer.config.object,'SaleLine__c');
 assert.equal(writer.config.fieldValues.find(x=>x.field==='ProductId').value,'{!CurrentOrderLine.ProductId}');
 assert.equal(writer.config.fieldValues.find(x=>x.field==='SaleId').value,'{!record7.Id}');
 assert.equal(result.flow.elements[2].config.object,'Product__c');
 assert.equal(result.flow.elements[1].config.conditions[0].value,'{!SessionKey}');
 assert(result.flow.resources.some(r=>r.name==='SessionKey'&&r.availableForInput===true));
 assert.deepEqual(result.flow.elements[2].config.conditions,[
  {field:'Id',operator:'Equals',value:'{!CurrentOrderLine.ProductId}'}]);
 assert.equal(result.flow.resources[0].dataType,'Product__c');
 assert.equal(JSON.stringify({objects,flows}),original,'Planner must not mutate tenant state');
 const second=planPosDraftRepair([...objects.filter(x=>x.apiName!=='Product__c'),result.product],
  [result.flow]);
 assert.equal(second.product,null);
 assert.equal(second.flow,null,'Repair must be idempotent');
});
test('POS draft repair rejects wrong relationship rather than forcing incompatible Product ID',()=>{
 const {objects,flows}=fixtures();
 objects[2].fields[0].relationship.targetObject='Product';
 assert.throws(()=>planPosDraftRepair(objects,flows),/relationships disagree/);
});
test('POS draft repair refuses active checkout Flow',()=>{
 const {objects,flows}=fixtures();
 flows[0].status='Active';
 assert.throws(()=>planPosDraftRepair(objects,flows),/Refusing to edit an active/);
});
