import assert from 'node:assert/strict';
import {test} from 'node:test';
import {projectCanvasComponentInstances,assertCanvasComponentParity} from '../apps/server/src/modules/metadata/component-canvas-projection.mjs';
test('shared adapter projects page, dashboard and flow canvas metadata',()=>{
 const state={tenants:{t1:{
  pages:[{apiName:'Page',components:[{id:'a',type:'Custom:Button',region:'main',properties:{width:'100%',height:200,accentColor:'red',actionFlows:{click:{flowApiName:'Save'}}}}]}],
  dashboards:[{apiName:'Dashboard',components:[{id:'a',type:'Custom:Chart',properties:{width:300,query:'Amount'}}]}],
  flows:[{apiName:'Flow',components:[{id:'a',type:'Custom:Button',properties:{visibleExpression:'x'}}]}]
 }}};
 const rows=projectCanvasComponentInstances(state);
 assert.equal(rows.length,3);
 assert.deepEqual(rows.map(r=>r.surface),['pages','dashboards','flows']);
 assert.equal(rows[0].width,'100%');
 assert.equal(rows[0].height,'200');
 assert.deepEqual(rows[0].additional_properties.actionFlows,{click:{flowApiName:'Save'}});
 assert.equal(assertCanvasComponentParity(state,structuredClone(rows)),true);
 rows[0].additional_properties.actionFlows.click.flowApiName='Delete';
 assert.throws(()=>assertCanvasComponentParity(state,rows),/metadata mismatch/);
});
