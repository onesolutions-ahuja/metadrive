import assert from 'node:assert/strict';
import test from 'node:test';
import {flowReferenceChoices,precedingFlowSteps} from '../../apps/web/src/builders/flowReferenceCatalog.ts';
import {flowReferenceBrowserGroups} from '../../apps/web/src/builders/flowReferenceBrowserModel.ts';
import {flowReferenceErrors} from '../../apps/server/src/modules/flows/reference-validation.ts';
import type {FlowDefinitionMetadata,ObjectMetadata} from '../../apps/web/src/metadata.ts';

const field=(apiName:string,dataType='Text(255)',relationship?:{targetObject:string})=>({
  apiName,label:apiName,dataType,required:false,unique:false,
  ...(relationship?{relationship:{type:'Lookup',targetObject:relationship.targetObject,relationshipName:apiName,childRelationshipName:apiName+'s'}}:{})
});
const objects=[
 {apiName:'Order__c',label:'Order',fields:[field('BasketSessionKey'),field('Status')]},
 {apiName:'OrderLine__c',label:'Order Line',fields:[field('OrderId','Lookup(Order__c)',{targetObject:'Order__c'}),field('Quantity','Number(18,2)')]}
] as ObjectMetadata[];
const config=(recordId=2,branch=false)=>({
 apiName:'Checkout',flowType:'Screen Flow',triggerObject:null,startConfig:{},
 elements:[
 {id:1,label:'Start',type:'Start',config:{}},
 {id:2,label:'Find Draft Order',type:'Get Records',config:{object:'Order__c',outputVariable:'Basket',recordLimit:'1',conditions:[{field:'BasketSessionKey',operator:'Equals',value:'cashier-cart'}]}},
 {id:3,label:'Get matching order lines',type:'Get Records',config:{object:'OrderLine__c',outputVariable:'Lines',recordLimit:'all',conditions:[{field:'OrderId',operator:'Equals',value:'{!Basket.Id}'}]}}
 ],
 connectors:[{id:'one',from:1,to:2,kind:'normal',label:''},{id:'two',from:2,to:3,kind:'normal',label:''},
   ...(branch?[{id:'skips',from:1,to:3,kind:'normal',label:''}]:[])],
 resources:[
 {name:'Basket',label:'Basket',type:'Record',dataType:'Order__c',isCollection:false,availableForInput:false,availableForOutput:false},
 {name:'Lines',label:'Lines',type:'Record Collection',dataType:'OrderLine__c',isCollection:true,availableForInput:false,availableForOutput:false},
 {name:'SessionKey',label:'Session Key',type:'Variable',dataType:'Text',isCollection:false,availableForInput:true,availableForOutput:false}
 ]
}) as unknown as FlowDefinitionMetadata;
test('Get Records can choose a guaranteed prior record ID with matching relationship type',()=>{
 const flow=config();
 const target=objects[1].fields.find(x=>x.apiName==='OrderId');
 const choices=flowReferenceChoices(flow,3,objects,target);
 assert(choices.some(x=>x.reference==='{!Basket.Id}'&&x.category==='Earlier steps'));
 assert(!choices.some(x=>x.reference==='{!Basket.Status}'));
 assert(!choices.some(x=>x.reference==='{!Lines.Id}'));
 assert.deepEqual(flowReferenceErrors(flow as any,objects),[]);
});
test('future and branch-skipped outputs are not available in picker or activation',()=>{
 const flow=config(3,true);
 assert(!precedingFlowSteps(flow,3).has(2));
 assert(!flowReferenceChoices(flow,3,objects).some(x=>x.reference==='{!Basket.Id}'));
 assert.match(flowReferenceErrors(flow as any,objects).join(' '),/not guaranteed on every path/);
});
test('broken reference paths, absent resources, bad datatypes and omitted fields fail Flow Check',()=>{
 const flow=config();
 const conditional=(flow.elements[2].config.conditions as Array<Record<string,string>>)[0];
 conditional.value='{!NotThere.Id}';
 assert.match(flowReferenceErrors(flow as any,objects).join(' '),/resource "NotThere" does not exist/);
 conditional.value='{!Basket.Missing}';
 assert.match(flowReferenceErrors(flow as any,objects).join(' '),/does not exist/);
 conditional.value='{!Basket.Status}';
 assert.match(flowReferenceErrors(flow as any,objects).join(' '),/incompatible/);
 conditional.value='@Basket.Id';
 assert.match(flowReferenceErrors(flow as any,objects).join(' '),/invalid reference/);
 conditional.value='{!Basket.Id}';
 flow.elements[1].config.fields=['Status'];
 assert.deepEqual(flowReferenceErrors(flow as any,objects),[]); // Id always supplied by Get Records
 conditional.value='{!Basket.BasketSessionKey}';
 assert.match(flowReferenceErrors(flow as any,objects).join(' '),/not selected in Fields to Store/);
});
test('record collections cannot be used as a single record field',()=>{
 const flow=config();
 (flow.elements[2].config.conditions as Array<Record<string,string>>)[0].value='{!Lines.Id}';
 assert.match(flowReferenceErrors(flow as any,objects).join(' '),/collection|not guaranteed/);
});

test('loop record variables remain usable inside an existing record collection loop',()=>{
 const flow=config();
 flow.elements.push({id:4,type:'Loop',label:'Each line',config:{collection:'Lines',loopVariable:'RunningLine'}} as any);
 flow.elements.push({id:5,type:'Assignment',label:'Sum line',config:{variable:'Amount',operator:'Add',value:'{!RunningLine.Quantity}'}} as any);
 flow.connectors.push({id:'loopstart',from:3,to:4,kind:'normal',label:''} as any);
 flow.connectors.push({id:'each',from:4,to:5,kind:'normal',label:'For Each'} as any);
 flow.connectors.push({id:'next',from:5,to:4,kind:'normal',label:''} as any);
 flow.resources.push({name:'RunningLine',label:'Running Line',type:'Record',dataType:'OrderLine__c',isCollection:false,availableForInput:false,availableForOutput:false});
 assert(flowReferenceChoices(flow,5,objects).some(x=>x.reference==='{!RunningLine.Quantity}'));
 assert.deepEqual(flowReferenceErrors(flow as any,objects),[]);
});
test('relationship field IDs can populate matching lookups but not unrelated objects',()=>{
 const catalog=[
  {apiName:'Product',label:'Product',fields:[field('Name')]},
  {apiName:'Contact',label:'Contact',fields:[field('Name')]},
  {apiName:'OrderLine__c',label:'Order Line',fields:[
    field('ProductId','Lookup(Product)',{targetObject:'Product'}),field('Name')]},
  {apiName:'SaleItem__c',label:'Sale Item',fields:[
    field('ProductId','Lookup(Product)',{targetObject:'Product'}),
    field('CustomerId','Lookup(Contact)',{targetObject:'Contact'})]}
 ] as ObjectMetadata[];
 const flow=config();
 flow.elements[1].config={object:'OrderLine__c',outputVariable:'Line',recordLimit:'1'};
 flow.elements[2]={id:3,label:'Add Sale Item',type:'Create Records',
  config:{object:'SaleItem__c',fieldValues:[{field:'ProductId',value:'{!Line.ProductId}'}]}} as any;
 const productField=catalog[3].fields[0],customerField=catalog[3].fields[1];
 assert(flowReferenceChoices(flow,3,catalog,productField).some(x=>x.reference==='{!Line.ProductId}'));
 assert(!flowReferenceChoices(flow,3,catalog,customerField).some(x=>x.reference==='{!Line.ProductId}'));
 assert.deepEqual(flowReferenceErrors(flow as any,catalog),[]);
 (flow.elements[2].config.fieldValues as any[])[0].field='CustomerId';
 assert.match(flowReferenceErrors(flow as any,catalog).join(' '),/incompatible/);
});

test('lookup selection from a preceding Screen is a typed usable record ID',()=>{
 const catalog=[
  {apiName:'Contact',label:'Contact',fields:[field('Name')]},
  {apiName:'Sale__c',label:'Sale',fields:[
    field('ContactId','Lookup(Contact)',{targetObject:'Contact'}),
    field('OtherRecordId','Lookup(Sale__c)',{targetObject:'Sale__c'}),
    field('Notes','Text(255)')]}
 ] as ObjectMetadata[];
 const flow=config();
 flow.elements.splice(1,2,
  {id:2,label:'Customer Selection',type:'Screen',config:{
    fields:[{apiName:'Customer',label:'Customer',type:'Lookup',objectApiName:'Contact'}]
  }} as any,
  {id:3,label:'Create Sale',type:'Create Records',config:{
    object:'Sale__c',fieldValues:[{field:'ContactId',value:'{!Customer}'}]
  }} as any
 );
 const contactField=catalog[1].fields[0],unrelatedField=catalog[1].fields[1];
 assert(flowReferenceChoices(flow,3,catalog,contactField).some(x=>x.reference==='{!Customer}'));
 assert(!flowReferenceChoices(flow,3,catalog,unrelatedField).some(x=>x.reference==='{!Customer}'));
 assert.deepEqual(flowReferenceErrors(flow as any,catalog),[]);
 (flow.elements[2].config.fieldValues as any[])[0].field='OtherRecordId';
 assert.match(flowReferenceErrors(flow as any,catalog).join(' '),/incompatible/);
 (flow.elements[2].config.fieldValues as any[])[0].field='ContactId';
 flow.connectors.push({id:'skip-screen',from:1,to:3,kind:'normal',label:''} as any);
 assert(!flowReferenceChoices(flow,3,catalog,contactField).some(x=>x.reference==='{!Customer}'));
 assert.match(flowReferenceErrors(flow as any,catalog).join(' '),/not guaranteed/);
});

test('standard Product.Id condition accepts the matching prior Order Line lookup ID',()=>{
 const catalogue=[
  {apiName:'OrderLine__c',label:'Order Line',fields:[
    field('ProductId','Lookup(Product)',{targetObject:'Product'})]},
  {apiName:'Product',label:'Product',fields:[field('Name')]},
  {apiName:'Contact',label:'Contact',fields:[field('Name')]}
 ] as ObjectMetadata[];
 const flow=config();
 flow.elements[1].config={object:'OrderLine__c',outputVariable:'Line',recordLimit:'1'};
 flow.elements[2].config={object:'Product',outputVariable:'SelectedProduct',recordLimit:'1',
   conditions:[{field:'Id',operator:'Equals',value:'{!Line.ProductId}'}]};
 const idField=field('Id','Id');
 assert(flowReferenceChoices(flow,3,catalogue,idField,'Product')
   .some(item=>item.reference==='{!Line.ProductId}'));
 assert(!flowReferenceChoices(flow,3,catalogue,idField,'Contact')
   .some(item=>item.reference==='{!Line.ProductId}'));
 assert.deepEqual(flowReferenceErrors(flow as any,catalogue),[]);
 flow.elements[2].config.object='Contact';
 assert.match(flowReferenceErrors(flow as any,catalogue).join(' '),/incompatible/);
});

test('cash Screen currency output can populate downstream numeric fields',()=>{
 const catalogue=[{apiName:'Payment',label:'Payment',fields:[
  field('Amount','Currency(18,2)')]}] as ObjectMetadata[];
 const flow=config();
 flow.elements.splice(1,2,
  {id:2,label:'Cash Received',type:'Screen',config:{
    fields:[{apiName:'CashReceived',label:'Cash Received',type:'Currency'}]
  }} as any,
  {id:3,label:'Create Payment',type:'Create Records',config:{
    object:'Payment',fieldValues:[{field:'Amount',value:'{!CashReceived}'}]
  }} as any
 );
 assert(flowReferenceChoices(flow,3,catalogue,catalogue[0].fields[0])
  .some(item=>item.reference==='{!CashReceived}'));
 assert.deepEqual(flowReferenceErrors(flow as any,catalogue),[]);
});

test('Loop item references derive their Object from Get Records collection without an extra Record resource',()=>{
 const objects=[
  {apiName:'Product',label:'Product',fields:[field('Name')]},
  {apiName:'OrderLine__c',label:'Order Line',fields:[field('ProductId','Lookup(Product)',{targetObject:'Product'})]},
  {apiName:'SaleItem__c',label:'Sale Item',fields:[field('ProductId','Lookup(Product)',{targetObject:'Product'})]}
 ] as ObjectMetadata[];
 const flow=config();
 flow.elements[1].config={object:'OrderLine__c',outputVariable:'OrderLines',recordLimit:'all'};
 flow.elements[2]={id:3,type:'Loop',label:'Each line',config:{collection:'OrderLines',loopVariable:'CurrentOrderLine'}} as any;
 flow.elements.push({id:4,type:'Create Records',label:'Create Sale Item',config:{
  object:'SaleItem__c',fieldValues:[{field:'ProductId',value:'{!CurrentOrderLine.ProductId}'}]
 }} as any);
 flow.connectors.push({id:'loopbody',from:3,to:4,kind:'normal',label:'For Each'} as any);
 flow.connectors.push({id:'loopreturn',from:4,to:3,kind:'normal',label:''} as any);
 assert(!flow.resources.some(item=>item.name==='CurrentOrderLine'));
 assert(flowReferenceChoices(flow,4,objects,objects[2].fields[0])
   .some(choice=>choice.reference==='{!CurrentOrderLine.ProductId}'));
 assert.deepEqual(flowReferenceErrors(flow as any,objects),[]);
});

test('Loop uses Get Records Object when collection resource stores generic datatype',()=>{
 const objects=[
  {apiName:'Product',label:'Product',fields:[field('Name')]},
  {apiName:'OrderLine__c',label:'Order Line',fields:[field('ProductId','Lookup(Product)',{targetObject:'Product'})]},
  {apiName:'SaleItem__c',label:'Sale Item',fields:[field('ProductId','Lookup(Product)',{targetObject:'Product'})]}
 ] as ObjectMetadata[];
 const flow=config();
 flow.elements[1].config={object:'OrderLine__c',outputVariable:'OrderLines',recordLimit:'all'};
 flow.elements[2]={id:3,type:'Loop',label:'For each line',config:{collection:'OrderLines',loopVariable:'CurrentOrderLine'}} as any;
 flow.resources.push({name:'OrderLines',label:'Order Lines',type:'Record Collection',dataType:'Record',
  isCollection:true,availableForInput:false,availableForOutput:false});
 flow.elements.push({id:4,type:'Create Records',label:'Create sale item',config:{
  object:'SaleItem__c',fieldValues:[{field:'ProductId',value:'{!CurrentOrderLine.ProductId}'}]}} as any);
 flow.connectors.push({id:'loop-body',from:3,to:4,kind:'normal',label:'For Each'} as any);
 flow.connectors.push({id:'loop-return',from:4,to:3,kind:'normal',label:''} as any);
 assert(flowReferenceChoices(flow,4,objects,objects[2].fields[0])
  .some(choice=>choice.reference==='{!CurrentOrderLine.ProductId}'));
 assert.deepEqual(flowReferenceErrors(flow as any,objects),[]);
});

test('universal @ picker browses loop Object fields and marks non-stored fields unavailable',()=>{
 const catalog=[
  {apiName:'OrderLine__c',label:'Order Line',fields:[
    field('ProductId','Lookup(Product)',{targetObject:'Product'}),field('Name')]},
  {apiName:'SaleItem__c',label:'Sale Item',fields:[
    field('ProductId','Lookup(Product)',{targetObject:'Product'})]},
  {apiName:'Product',label:'Product',fields:[field('Name')]}
 ] as ObjectMetadata[];
 const flow=config();
 flow.elements[1].config={object:'OrderLine__c',outputVariable:'OrderLines',recordLimit:'all',fields:['Name']};
 flow.elements[2]={id:3,type:'Loop',label:'Each order line',
  config:{collection:'OrderLines',loopVariable:'CurrentOrderLine'}} as any;
 flow.elements.push({id:4,type:'Create Records',label:'Sale item',config:{object:'SaleItem__c'}} as any);
 flow.connectors.push({id:'each',from:3,to:4,kind:'normal',label:'For Each'} as any);
 const picker=flowReferenceBrowserGroups(flow,4,catalog,catalog[1].fields[0]);
 const group=picker.groups.find(group=>group.path==='CurrentOrderLine');
 assert(group, 'The Loop item is an available record even without a manual Record resource');
 const product=group.options.find(item=>item.reference==='{!CurrentOrderLine.ProductId}');
 assert.equal(product?.disabled,true,'Get Records must store ProductId before the value can run');
 assert.match(product?.reason??'',/Fields to Store/);
 assert.equal(group.options.find(item=>item.reference==='{!CurrentOrderLine.Name}')?.disabled,true);
 flow.elements[1].config.fields=['Name','ProductId'];
 const available=flowReferenceBrowserGroups(flow,4,catalog,catalog[1].fields[0]).groups
  .find(group=>group.path==='CurrentOrderLine')?.options;
 assert.equal(available?.find(item=>item.reference==='{!CurrentOrderLine.ProductId}')?.disabled,false);
});

test('universal @ picker exposes typed Screen outputs without an extra resource',()=>{
 const catalog=[{apiName:'Payment',label:'Payment',fields:[field('Amount','Currency(18,2)')]}] as ObjectMetadata[];
 const flow=config();
 flow.elements[1]={id:2,label:'Cash Received',type:'Screen',
  config:{fields:[{apiName:'CashReceived',label:'Cash Received',type:'Currency'}]}} as any;
 flow.elements[2]={id:3,label:'Create Payment',type:'Create Records',
  config:{object:'Payment'}} as any;
 const choices=flowReferenceBrowserGroups(flow,3,catalog,catalog[0].fields[0]);
 assert.equal(choices.directOptions.find(item=>item.reference==='{!CashReceived}')?.disabled,false);
});

test('ordinary JSON literals are not misread as broken Flow references',()=>{
 const flow=config();
 flow.elements.push({id:4,type:'Assignment',label:'Keep JSON',config:{variable:'SessionKey',value:'{"example":1}'}} as any);
 assert.deepEqual(flowReferenceErrors(flow as any,objects),[]);
});

test('typed lookup fields remain selectable inside a Loop when relationship object is absent',()=>{
 const catalog=[
  {apiName:'Product',label:'Product',fields:[field('Name')]},
  {apiName:'OrderLine__c',label:'Order Line',fields:[field('ProductId','Lookup(Product)')]},
  {apiName:'SaleItem__c',label:'Sale Item',fields:[
   field('ProductId','Lookup(Product)'),field('ContactId','Lookup(Contact)')]}
 ] as ObjectMetadata[];
 const flow=config();
 flow.elements[1].config={object:'OrderLine__c',outputVariable:'Lines',recordLimit:'all'};
 flow.elements[2]={id:3,type:'Loop',label:'Each line',config:{collection:'Lines',loopVariable:'CurrentOrderLine'}} as any;
 flow.elements.push({id:4,type:'Create Records',label:'Create Sale Item',
  config:{object:'SaleItem__c',fieldValues:[{field:'ProductId',value:'{!CurrentOrderLine.ProductId}'}]}} as any);
 flow.connectors.push({id:'loop-body',from:3,to:4,kind:'normal',label:'For Each'} as any);
 const product=flowReferenceBrowserGroups(flow,4,catalog,catalog[2].fields[0]).groups
  .find(group=>group.path==='CurrentOrderLine')?.options
  .find(option=>option.reference==='{!CurrentOrderLine.ProductId}');
 assert.equal(product?.disabled,false);
 assert.deepEqual(flowReferenceErrors(flow as any,catalog),[]);
 const contact=flowReferenceBrowserGroups(flow,4,catalog,catalog[2].fields[1]).groups
  .find(group=>group.path==='CurrentOrderLine')?.options
  .find(option=>option.reference==='{!CurrentOrderLine.ProductId}');
 assert.equal(contact?.disabled,true);
});
