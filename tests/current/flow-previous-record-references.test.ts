import assert from 'node:assert/strict';
import test from 'node:test';
import {flowReferenceChoices,precedingFlowSteps} from '../../apps/web/src/builders/flowReferenceCatalog.ts';
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
