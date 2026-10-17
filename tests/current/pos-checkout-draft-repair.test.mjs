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
 const pages=[{apiName:'COPILOT_POS_Cashier_Till',status:'Draft',components:[
  {id:'cart',type:'Custom:OneShoppingCart',properties:{title:'Till'}}
 ]}];
 const flows=[{
  apiName:'COPILOT_POS_Cash_Checkout',status:'Draft',activeVersion:null,
  elements:[
   {id:1,type:'Loop',label:'Order line loop',config:{loopVariable:'CurrentOrderLine',collection:'CurrentOrderLines'}},
   {id:4,type:'Get Records',label:'Find Current Draft Order',config:{object:'Order__c',
    conditions:[{field:'BasketSessionKey',operator:'Equals',value:'cashier-cart'},
      {field:'Status',operator:'Equals',value:'Draft'}]}},
   {id:2,type:'Get Records',label:'Find Product for Order Line',config:{object:'Product',conditions:[]}},
   {id:5,type:'Get Records',label:'Find Current Order Lines',config:{object:'OrderLine__c',
    recordLimit:'all',outputVariable:'CurrentOrderLines'}},
   {id:6,type:'Screen',label:'Cash Checkout',config:{fields:[{
    apiName:'CashReceived',type:'Currency',label:'Cash Received'}]}},
   {id:7,type:'Create Records',label:'Create Sale',config:{object:'Sale__c',fieldValues:[]}},
   {id:3,type:'Create Records',label:'Create Sale Item',config:{object:'SaleItem__c',
    fieldValues:[
     {field:'Name',value:'{!CurrentOrderLine.Name}'},
     {field:'Quantity__c',value:'{!CurrentOrderLine.Quantity}'},
     {field:'Unit_Price__c',value:'{!CurrentOrderLine.UnitPrice}'},
     {field:'Sale__c',value:'{!record7.Id}'},
     {field:'Product__c',value:'{!StandardCatalogProduct.Id}'}
    ]}}
  ],
  connectors:[{id:'line-to-sale',from:5,to:7,label:'',kind:'normal'}],
  resources:[{name:'StandardCatalogProduct',type:'Record',dataType:'Product'}]
 }];
 return {objects,flows,pages};
}
test('POS draft repair only extends age metadata and maps loop product into SaleLine',()=>{
 const {objects,flows,pages}=fixtures();
 const original=JSON.stringify({objects,flows,pages});
 const result=planPosDraftRepair(objects,flows,pages);
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
 const gate=result.flow.elements.find(x=>x.label==='Validate Cash and Basket');
 assert(gate?.config.outcomes.some(x=>x.name==='InsufficientCash'));
 assert(result.flow.connectors.some(x=>x.from===5&&x.to===gate.id));
 assert(result.flow.connectors.some(x=>x.from===gate.id&&x.to===7&&x.label==='Default'));
 assert(!result.flow.connectors.some(x=>x.from===5&&x.to===7),'Sale must never bypass cash validation');
 assert.deepEqual(result.page.components[0].properties.actionFlows.checkout.inputs,{SessionKey:'$event.sessionKey',CheckoutRequestKey:'$event.requestId'});
 assert.equal(JSON.stringify({objects,flows,pages}),original,'Planner must not mutate tenant state');
 const second=planPosDraftRepair([...objects.filter(x=>x.apiName!=='Product__c'),result.product],
  [result.flow],[result.page]);
 assert.equal(second.product,null);
 assert.equal(second.flow,null,'Repair must be idempotent');
 assert.equal(second.page,null,'Page bindings must remain unchanged on replay');
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
