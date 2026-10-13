import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectPageDependencies } from '../apps/web/src/pageDependencies.ts';
import { dashboardComponentValue } from '../apps/web/src/EmbeddedDashboard.tsx';

const page = {
  apiName: 'Test', label: 'Test', targetObject: 'Account', pageType: 'App Page',
  layoutMode: 'template',template:'one-region',canvasWidth:1200,canvasHeight:900,
  status:'Draft',devices:['Desktop','Phone'],components:[
    {id:'dashboard',type:'Dashboard',label:'Dashboard',visible:true,properties:{dashboardApiName:'Sales'}},
    {id:'report',type:'Report Chart',label:'Report',visible:true,properties:{reportApiName:'Sales_Report'}},
    {id:'flow',type:'Custom:KioskOrderingExperience',label:'Order',visible:true,properties:{
      actionFlows:{ add: {flowApiName:'KIOSK_CART_ADD',inputs:{SessionId:'$session'}}}
    }}
  ], activationAssignments: []
};
const scope = {
 apps: [], pages: [page], objects: [{apiName:'Account'}], reports:[{apiName:'Sales_Report'}],
 dashboards:[{apiName:'Sales',status:'Deployed'}],
 flows:[{apiName:'KIOSK_CART_ADD',status:'Active'}],
 libraryComponents:[{apiName:'KioskOrderingExperience',status:'Published',surfaces:['page']}]
};
test('Page Builder dependencies resolve published dashboard, report, Flow and library component', () => {
 const result=inspectPageDependencies(page,scope);
 assert.deepEqual(result.map(item=>item.kind),['Dashboard','Report','Component','Flow']);
 assert(result.every(item=>item.status==='Ready'));
});
test('missing and draft dependencies fail visibly without inventing a route', () => {
 const result=inspectPageDependencies(page,{...scope,
   dashboards:[{apiName:'Sales',status:'Draft'}], flows:[], reports:[]});
 assert.deepEqual(result.filter(item=>item.status!=='Ready').map(item=>item.kind),
   ['Dashboard','Report','Flow']);
});
test('generic dashboard aggregation uses report summary rather than truncated visible rows', () => {
 const metric={measureFieldApiName:'Revenue',aggregation:'Sum'};
 const summaryTotals={rowCount:345,sums:{Revenue:900},counts:{Revenue:345},minimums:{Revenue:1},maximums:{Revenue:40}};
 const input={rows:[{Revenue:3}],total:345,run:{summaryTotals}};
 assert.equal(dashboardComponentValue(metric,input),900);
 assert.equal(dashboardComponentValue({...metric,aggregation:'Count'},input),345);
 assert.equal(dashboardComponentValue({...metric,aggregation:'Average'},input),900/345);
});
test('kiosk remains an editable metadata contract with guarded checkout provider Flow',()=>{
 const preset=JSON.parse(readFileSync('apps/web/src/page-presets/kiosk.editable.json','utf8'));
 const kiosk=preset.components.find(component=>component.type==='Custom:KioskOrderingExperience');
 assert(kiosk);
 for(const event of ['start','add','quantity','remove','reset','checkout'])
   assert.equal(typeof kiosk.properties.actionFlows[event]?.flowApiName,'string',event);
 assert.deepEqual(kiosk.properties.actionFlows.checkout.inputs,
   {SessionId:'$session',OrderType:'$event.orderType'});
 assert(!JSON.stringify(kiosk.properties).includes('paymentSecret'));
});
