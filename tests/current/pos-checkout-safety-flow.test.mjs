import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutSafetyObjects,checkoutSaleFields,planCheckoutSafetyMetadata}
 from '../../scripts/pos-checkout-safety-definitions.mjs';
import {planCashAgeStockFlow} from '../../scripts/pos-checkout-safety-flow.mjs';

function fixtures(){
 const objects=[
  ...['Product__c','Order__c','OrderLine__c','SaleLine__c'].map(apiName=>({
   apiName,kind:'Custom Object',fields:[]})),
  {apiName:'Sale__c',kind:'Custom Object',fields:[{apiName:'Name',dataType:'Text'}]}
 ];
 const flow={
  apiName:'COPILOT_POS_Cash_Checkout',status:'Draft',activeVersion:null,
  flowType:'Screen Flow',elements:[
   {id:1,type:'Start',label:'Start',config:{}},
   {id:2,type:'Screen',label:'Cash Checkout',config:{fields:[{apiName:'CashReceived',type:'Currency',label:'Cash Received'}]}},
   {id:3,type:'Get Records',label:'Find Current Draft Order',config:{object:'Order__c'}},
   {id:5,type:'Get Records',label:'Find Current Order Lines',config:{object:'OrderLine__c',recordLimit:'all',outputVariable:'CurrentOrderLines'}},
   {id:10,type:'Decision',label:'Validate Cash and Basket',config:{outcomes:[
    {name:'InsufficientCash',label:'InsufficientCash',conditions:[]},
    {name:'Default',label:'Default',conditions:[]}]}},
   {id:11,type:'End',label:'Cash Checkout Rejected',config:{}},
   {id:4,type:'Create Records',label:'Create Sale',config:{object:'Sale__c',fieldValues:[]}},
   {id:6,type:'Loop',label:'New Loop',config:{collection:'CurrentOrderLines',loopVariable:'CurrentOrderLine'}},
   {id:9,type:'Get Records',label:'Find Product',config:{object:'Product__c',conditions:[]}},
   {id:7,type:'Create Records',label:'Create Sale Item',config:{object:'SaleLine__c',fieldValues:[]}},
   {id:8,type:'Screen',label:'Checkout Complete',config:{fields:[]}}
  ],
  connectors:[
   {id:'1',from:1,to:2,kind:'normal',label:''},
   {id:'2',from:2,to:3,kind:'normal',label:''},
   {id:'3',from:3,to:5,kind:'normal',label:''},
   {id:'4',from:5,to:10,kind:'normal',label:''},
   {id:'5',from:10,to:4,kind:'normal',label:'Default'},
   {id:'6',from:10,to:11,kind:'normal',label:'InsufficientCash'},
   {id:'7',from:4,to:6,kind:'normal',label:''},
   {id:'8',from:6,to:9,kind:'normal',label:'For Each'},
   {id:'9',from:9,to:7,kind:'normal',label:''},
   {id:'10',from:7,to:6,kind:'normal',label:''},
   {id:'11',from:6,to:8,kind:'normal',label:'After Last'},
   {id:'12',from:8,to:2,kind:'normal',label:''}
  ],resources:[{name:'CurrentOrderLines',type:'Record Collection',dataType:'OrderLine__c',isCollection:true}]};
 return {objects,flow};
}
test('POS safety object installer only creates absent objects and extends canonical Sale',()=>{
 const {objects}=fixtures(),before=structuredClone(objects);
 const ops=planCheckoutSafetyMetadata(objects);
 assert.equal(ops.filter(o=>o.kind==='create').length,3);
 assert.equal(ops.filter(o=>o.kind==='extend').length,1);
 assert.deepEqual(objects,before,'Pure planner must not mutate tenant');
 const next=objects.filter(x=>x.apiName!=='Sale__c').concat(ops.map(x=>x.object));
 assert.deepEqual(planCheckoutSafetyMetadata(next),[]);
 const payment=checkoutSafetyObjects.find(x=>x.apiName==='POS_CashPayment__c');
 assert(payment.fields.find(f=>f.apiName==='CheckoutRequestKey').unique);
 assert(checkoutSaleFields.find(f=>f.apiName==='CheckoutRequestKey').unique);
});
test('POS checkout graph checks age and stock before sale; writes ledger then payment',()=>{
 const {objects,flow}=fixtures();
 const installed=[...objects,...checkoutSafetyObjects];
 const next=planCashAgeStockFlow(flow,installed);
 assert(next);
 assert.equal(planCashAgeStockFlow(next,installed),null);
 const byLabel=x=>next.elements.find(e=>e.label===x);
 const cash=byLabel('Validate Cash and Basket');
 const preflight=byLabel('POS Safety - Validate Lines');
 const sale=byLabel('Create Sale');
 const rollback=byLabel('POS Safety - Rollback Incomplete Checkout');
 const payment=byLabel('POS Safety - Record Cash Payment');
 const movement=byLabel('POS Safety - Record Stock Movement');
 assert(cash.config.outcomes.some(x=>x.name==='EmptyBasket'));
 assert(next.connectors.some(e=>e.from===preflight.id&&e.label==='After Last'));
 assert(!next.connectors.some(e=>e.from===cash.id&&e.to===sale.id),
  'Do not write a Sale before trusted age and stock validation');
 assert(next.connectors.some(e=>e.from===movement.id&&e.to===6));
 assert(next.connectors.some(e=>e.from===6&&e.to===payment.id&&e.label==='After Last'));
 assert(next.connectors.some(e=>e.from===rollback.id&&e.to===byLabel('POS Safety - Out of Stock').id));
 assert.equal(next.elements.some(e=>e.type==='Screen'&&/complete/i.test(e.label)),false);
 assert(next.resources.some(x=>x.name==='CheckoutRequestKey'&&x.availableForInput&&x.availableForOutput));
 assert(next.resources.some(x=>x.name==='ChangeDue'&&x.availableForOutput));
 assert.deepEqual(flow.elements.find(e=>e.id===2).config.fields.length,1,
  'Planner must not mutate original Flow');
});
test('POS safety Flow refuses missing metadata or active checkout',()=>{
 const {objects,flow}=fixtures();
 assert.throws(()=>planCashAgeStockFlow(flow,objects),/Missing installed POS metadata/);
 flow.status='Active';
 assert.throws(()=>planCashAgeStockFlow(flow,[...objects,...checkoutSafetyObjects]),/Refusing to modify active/);
});
