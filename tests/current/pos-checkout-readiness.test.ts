import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessCheckoutReadiness} from '../../scripts/pos-checkout-readiness.mjs';

const data=JSON.parse(readFileSync(new URL('../../apps/server/data/platform-metadata.json',import.meta.url),'utf8'));
const find=id=>data.objects.find(o=>o.apiName===id);
test('canonical Product Type empty picklist is reported as a metadata defect, not auto-repaired',()=>{
 const report=assessCheckoutReadiness({objects:data.objects,flows:[],pages:[]});
 assert(report.issues.includes('picklists:Product'));
 assert(report.issues.includes('flow:checkout-found'));
 assert.equal(find('Product').fields.find(f=>f.apiName==='Type').picklistValues,undefined);
 assert.equal(report.readyForLiveTest,false);
});
test('missing referenced UnitOfMeasure causes explicit dependency check failure',()=>{
 const without=data.objects.filter(obj=>obj.apiName!=='UnitOfMeasure');
 const report=assessCheckoutReadiness({objects:without,flows:[],pages:[]});
 assert(report.issues.includes('relationships:Product'));
 assert.match(report.checks.find(c=>c.id==='relationships:Product').note,/UnitOfMeasure/);
});
test('unactivated cash screen and draft Order query are insufficient to claim checkout complete',()=>{
 const draft={
  apiName:'COPILOT_POS_Cash_Checkout',label:'COPILOT POS - Cash Checkout',
  status:'Draft',elements:[
   {id:1,type:'Screen',label:'Cash Received',config:{}},
   {id:2,type:'Get Records',label:'Draft Order',config:{
      object:'Order',conditions:[{field:'BasketSessionKey',operator:'Equals',value:'cashier-cart'}]
   }}
  ],resources:[]
 };
 const report=assessCheckoutReadiness({objects:data.objects,flows:[draft],pages:[]});
 assert.equal(report.checkoutFlow.found,true);
 assert.equal(report.checkoutFlow.status,'Draft');
 for(const requirement of ['flow:line-query','flow:invoice-create','flow:invoice-lines',
   'flow:age-gate','flow:payment-record','flow:stock-update','page:sync'])
   assert(report.issues.includes(requirement),requirement);
 assert.equal(report.readyForLiveTest,false);
});
test('active untested checkout is flagged instead of being called complete',()=>{
 const draft={apiName:'a',label:'Cash Checkout',status:'Active',elements:[],resources:[]};
 const report=assessCheckoutReadiness({objects:data.objects,flows:[draft],pages:[]});
 assert(report.issues.includes('flow:inactive'));
 assert(report.runtimeAssertions.some(x=>x.includes('staff age')));
});
